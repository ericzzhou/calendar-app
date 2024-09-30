const path = require("path");
require('dotenv').config({ path: path.resolve(__dirname,"../../", '.env') });
const schedule = require("node-schedule");
const notification = require("./notification");
const storeManager = require("./storeManager");
const { groupEventsByDate, formatRenderData } = require("./utils");
const handlebars = require("handlebars");
const fs = require("fs");
const logManager = require("./logManager");
const { google } = require("googleapis");

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

class EventManager {
  constructor() {
    this.notificationJobs = new Map(); // 存储已经设置提醒的任务
    storeManager.getConfiguration().then((conf) => {
      this.configuration = conf;
    });
    this.setIntervalId = null; // 定时读取新事件的定时器
  }

  async getTokenFromOAuthClient(code) {
    const { tokens } = await this.oauth2Client.getToken(code);
    return tokens;
  }

  createOAuth2Client(httpServerPort) {
    try {
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        logManager.error("未配置Google OAuth Client ID或Client Secret");
      }
      this.oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        `http://localhost:${httpServerPort}`
      );
    } catch (error) {
      logManager.error("创建OAuth2客户端失败:");
      logManager.error(error);
    }
  }
  generateAuthUrl(httpServerPort) {
    if (this.oauth2Client == null) {
      this.createOAuth2Client(httpServerPort);
    }

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
    });
    return authUrl;
  }
  /**
   * 1. 从 google 获取日历里边
   * @param {*} maxResults
   * @returns
   */
  async getEventsFromCalendar(maxResults = 15, httpServerPort) {
    const googleOAuthToken = await storeManager.getGoogleOAuthToken();
    if (!googleOAuthToken) {
      logManager.info("未获取到Google OAuth Token");
      return null;
    }

    if (this.oauth2Client == null) {
      this.createOAuth2Client(httpServerPort);
    }

    this.oauth2Client.setCredentials(googleOAuthToken);

    const conf = await storeManager.getConfiguration();
    maxResults = conf.defaultEventSize;

    const calendar = google.calendar({
      version: "v3",
      auth: this.oauth2Client,
    });
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      maxResults: maxResults,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = res.data.items;

    console.log(`Main Process 获取到[${events.length}]个事件`);
    return events;
  }

  /**
   * 给单个事件设置提醒任务
   * @param {*} event 事件信息
   * @param {*} notificationTime 提前x分钟提醒
   * @param {*} notificationJobs 任务job池
   * @returns
   */
  setSingleScheduleNotification(event) {
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
      //   body: `会议 "${event.summary}" 即将开始！`,
      // });
      // immediateNotification.show();

      notification("会议提醒", `会议 "${event.summary}" 即将开始！`);

      return; // 跳过后续定时任务设置
    }

    // 正常设置新的提醒任务
    const job = schedule.scheduleJob(notificationTime, () => {
      notification(
        "会议提醒",
        `会议 "${event.summary}" 将在${this.configuration.notificationTime}分钟后开始。`
      );
      // const notification = new Notification({
      //   title: "会议提醒",
      //   body: `会议 "${event.summary}" 将在${this.configuration.notificationTime}分钟后开始。`,
      // });
      // notification.show();
    });

    // 将新任务存储到 Map 中，使用事件的唯一 ID 作为 key
    this.notificationJobs.set(event.id, job);

    // logManager.info(`提醒已设置: ${event.summary} at ${notificationTime}`);
  }

  /**
   * 2. 设置日历提醒
   * @param {*} events
   * @returns
   */
  async setEventsNotification(events) {
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
        this.setSingleScheduleNotification(event); // 为每个事件设置提醒
      }
    });
  }

  /**
   * 3. 根据模板生成events html
   * @param {*} events
   * @returns
   */
  async buildTemplate(events) {
    const group = groupEventsByDate(events);
    const data = formatRenderData(group);
    const templatePath = path.join(__dirname, "../", "index.hbs");

    const templateSource = fs.readFileSync(templatePath, "utf8");

    const template = handlebars.compile(templateSource);
    const configuration = await storeManager.getConfiguration();
    const datas = {
      data: data,
      fontSize: configuration.defaultFontSize,
    };
    // console.log("datas", datas);
    const html = template(datas);
    // console.log("模板输出：", html);
    return html;
  }

  /**
   * 4. 生成事件的 html
   * @returns
   */
  async buildEventsHtml(httpServerPort) {
    const events = await this.getEventsFromCalendar(null, httpServerPort);
    // console.log("获取到的时间列表见日志文件：");
    // logManager.debug(JSON.stringify(events));
    
    this.setEventsNotification(events);

    const html = await this.buildTemplate(events);
    return html;
  }

  setIntervalJob(callback) {
    if (this.setIntervalId) {
      clearInterval(this.setIntervalId);
      this.setIntervalId = null;
    }

    const eventInterval = this.configuration.eventInterval;
    // logManager.info(`setIntervalJob 设置事件更新时间间隔：${eventInterval} 分钟`);
    this.setIntervalId = setInterval(async () => {
      if (callback) callback();
      // console.log("refresh 定时任务执行");
      // this.win.webContents.send("refresh");
    }, eventInterval * 60 * 1000);
  }
}

module.exports = new EventManager();
