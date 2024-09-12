const schedule = require("node-schedule");
const notification = require("./notification");
const storeManager = require("./storeManager");
const path = require("path");
const { groupEventsByDate, formatRenderData } = require("./utils");
const handlebars = require("handlebars");
const fs = require("fs");
// const logManager = require("./logManager");

class EventManager {
  constructor() {
    this.notificationJobs = new Map(); // 存储已经设置提醒的任务
    storeManager.getConfiguration().then((conf) => {
      this.configuration = conf;
    });
    this.setIntervalId = null; // 定时读取新事件的定时器
  }
  /**
   * 给单个事件设置提醒任务
   * @param {*} event 事件信息
   * @param {*} notificationTime 提前x分钟提醒
   * @param {*} notificationJobs 任务job池
   * @returns
   */
  scheduleNotification(event) {
    // 解析会议的开始时间
    const eventStartTime = new Date(event.start.dateTime); // 假设 event.start.dateTime 是 ISO 时间格式
    const notificationTime = new Date(
      eventStartTime.getTime() - this.configuration.notificationTime * 60000
    ); // 提前 configuration.notificationTime 分钟提醒

    // 检查是否已经为该事件设置了提醒，如果有则取消
    if (this.notificationJobs.has(event.id)) {
      const existingJob = this.notificationJobs.get(event.id);
      existingJob.cancel(); // 取消之前的定时任务
      // logManager.info(`提醒已取消： ${event.summary} at ${notificationTime}`);
    }

    // 获取当前时间
    const currentTime = new Date();

    if (eventStartTime < currentTime) {
      // logManager.info(
      //   `会议已经开始或已结束： ${event.summary} at ${eventStartTime}`
      // );
      return; // 跳过后续提醒设置
    }

    //如果当前时间已超过提醒时间，立即提醒
    if (notificationTime < currentTime) {
      // logManager.info(
      //   `任务过期，立即提醒： ${event.summary} at ${currentTime}`
      // );

      // 显示立即提醒
      // const immediateNotification = new Notification({
      //   title: "会议提醒",
      //   body: `您的会议 "${event.summary}" 即将开始！`,
      // });
      // immediateNotification.show();

      notification("会议提醒", `您的会议 "${event.summary}" 即将开始！`);

      return; // 跳过后续定时任务设置
    }

    // 正常设置新的提醒任务
    const job = schedule.scheduleJob(notificationTime, () => {
      notification(
        "会议提醒",
        `您的会议 "${event.summary}" 将在${this.configuration.notificationTime}分钟后开始。`
      );
      // const notification = new Notification({
      //   title: "会议提醒",
      //   body: `您的会议 "${event.summary}" 将在${this.configuration.notificationTime}分钟后开始。`,
      // });
      // notification.show();
    });

    // 将新任务存储到 Map 中，使用事件的唯一 ID 作为 key
    this.notificationJobs.set(event.id, job);

    // logManager.info(`提醒已设置: ${event.summary} at ${notificationTime}`);
  }

  /**
   * 处理日历事件
   * @param {*} events
   * @returns
   */
  processEvents(events) {
    if (!events) {
      // logManager.info("没有事件需要设置提醒");
      return;
    }

    // 先清理所有job
    if (this.notificationJobs && this.notificationJobs.length > 0) {
      // 取消job
      this.notificationJobs.forEach((job) => {
        job.cancel();
      });
    }

    events.forEach((event) => {
      if (event.start && event.start.dateTime) {
        this.scheduleNotification(event); // 为每个事件设置提醒
      }
    });
  }

  buildTemplate(events, configuration) {
    const group = groupEventsByDate(events);
    const data = formatRenderData(group);
    const templatePath = path.join(__dirname, "../", "index.hbs");

    const templateSource = fs.readFileSync(templatePath, "utf8");

    const template = handlebars.compile(templateSource);

    const datas = {
      data: data,
      fontSize: configuration.defaultFontSize,
    };
    // console.log("datas", datas);
    const html = template(datas);
    return html;
  }

  setIntervalJob(callback) {
    if (this.setIntervalId) {
      clearInterval(this.setIntervalId);
      this.setIntervalId = null;
    }

    const eventInterval = this.configuration.eventInterval;
    // logManager.info(`setIntervalJob 设置事件更新时间间隔：${eventInterval} 分钟`);
    this.setIntervalId = setInterval(() => {
      if (callback) callback();
      // console.log("refresh 定时任务执行");
      // this.win.webContents.send("refresh");
    }, eventInterval * 60 * 1000);
  }
}

module.exports = new EventManager();
