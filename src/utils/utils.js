const fs = require("fs");
const handlebars = require("handlebars");
/**
 * 事件分组
 * @param {*} events
 * @returns
 */
const groupEventsByDate = (events) => {
  // print(events);
  const groupedEvents = {
    today: [],
    tomorrow: [],
    upcoming: [],
  };

  if (events == null || events.length == 0) {
    return groupedEvents;
  }
  const now = new Date();
  const today = new Date(now.toDateString());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  events.forEach((event) => {
    if (event.start && event.start.dateTime) {
      const eventStart = new Date(event.start.dateTime);

      if (eventStart.toDateString() === today.toDateString()) {
        groupedEvents.today.push(event);
      } else if (eventStart.toDateString() === tomorrow.toDateString()) {
        groupedEvents.tomorrow.push(event);
      } else {
        groupedEvents.upcoming.push({
          date: `${eventStart.getMonth() + 1}月${eventStart.getDate()}号`,
          events: [event],
        });
      }
    }
  });

  return groupedEvents;
};

/**
 * 格式化事件持续时长
 * @param {*} start
 * @param {*} end
 * @returns
 */
const formatDuration = (start, end) => {
  const startTime = new Date(start);
  const endTime = new Date(end);
  const duration = Math.round((endTime - startTime) / (1000 * 60)); // 时长（分钟）

  // 如果持续时间小于60分钟，直接返回 xx分钟
  if (duration < 60) {
    return `${duration} 分钟`;
  }

  // 如果持续时间是60分钟的倍数，返回 xx小时
  if (duration % 60 === 0) {
    const hours = duration / 60;
    return `${hours} 小时`;
  }

  // 否则返回 xx.xx小时，保留两位小数
  const hours = (duration / 60).toFixed(2);
  return `${hours} 小时`;
};

// 格式化日期时间
const formatDateTime = (dateTime) => {
  const options = {
    // year: "numeric",
    // month: "2-digit",
    // day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  };
  return new Date(dateTime).toLocaleTimeString("zh-CN", options);
  // return new Date(dateTime).toLocaleDateString("zh-CN", options);
};

/**
 * 获取指定日期的星期几
 * @param {string|Date} dateTime - 日期时间字符串或 Date 对象
 * @returns {string} - 星期几的名称
 */
const getDayOfWeek = (dateTime) => {
  const date = new Date(dateTime);
  const options = {
    weekday: "long", // 使用 "short" 可以获取缩写，例如 "Mon"
  };
  return date.toLocaleDateString("zh-CN", options); // 返回中文的星期几名称，例如 "星期一"
};

const formatRenderData = (groupedEvents) => {
  const events = [];
  if (groupedEvents.today.length > 0) {
    events.push({
      date: "今天",
      DayOfWeek: getDayOfWeek(groupedEvents.today[0].start.dateTime),
      events: groupedEvents.today.map((event) => ({
        ...event,
        start: formatDateTime(event.start.dateTime),
        startDatetime:event.start.dateTime,
        duration: formatDuration(event.start.dateTime, event.end.dateTime),
      })),
    });
  }
  if (groupedEvents.tomorrow.length > 0) {
    events.push({
      date: "明天",
      DayOfWeek: getDayOfWeek(groupedEvents.tomorrow[0].start.dateTime),
      events: groupedEvents.tomorrow.map((event) => ({
        ...event,
        start: formatDateTime(event.start.dateTime),
        startDatetime:event.start.dateTime,
        duration: formatDuration(event.start.dateTime, event.end.dateTime),
      })),
    });
  }
  groupedEvents.upcoming.forEach((group) => {
    // 如果group.date 已经存在于 events, 则只需要追加 events
    const existingGroup = events.find((e) => e.date === group.date);
    if (existingGroup) {
      // existingGroup.events.push(...group.events);

      existingGroup.events.push(
        ...group.events.map((event) => ({
          ...event,
          start: formatDateTime(event.start.dateTime),
          startDatetime:event.start.dateTime,
          duration: formatDuration(event.start.dateTime, event.end.dateTime),
        }))
      );
      return;
    }

    events.push({
      date: group.date,
      DayOfWeek: getDayOfWeek(group.events[0].start.dateTime),
      events: group.events.map((event) => ({
        ...event,
        start: formatDateTime(event.start.dateTime),
        startDatetime:event.start.dateTime,
        duration: formatDuration(event.start.dateTime, event.end.dateTime),
      })),
    });
  });

  return events;
};

/**
 * 解析事件列表模板
 * @param {*} templatePath
 * @param {*} events
 * @param {*} fontSize
 * @returns 返回解析成功的模板html
 */
const buildTemplate = (templatePath, events, fontSize) => {
  const group = groupEventsByDate(events);
  const data = formatRenderData(group);

  const templateSource = fs.readFileSync(templatePath, "utf8");

  const template = handlebars.compile(templateSource);

  const datas = {
    data: data,
    fontSize: fontSize,
  };
  // console.log("datas", datas);
  const html = template(datas);
  // this.win.webContents.send("html", html);
  return html;
};

/**
 * 将下载速度 bytesPerSecond 转换为 kb/s（千字节每秒）或 MB/s（兆字节每秒）
 * @param {*} bytesPerSecond
 * @returns
 */
const convertBytesPerSecond = (bytesPerSecond) => {
  let kbPerSecond = bytesPerSecond / 1024; // 转换为 KB/s
  let mbPerSecond = bytesPerSecond / (1024 * 1024); // 转换为 MB/s

  if (mbPerSecond >= 1) {
    // 如果大于等于 1 MB/s，使用 MB/s 显示
    return mbPerSecond.toFixed(2) + " MB/s";
  } else {
    // 否则，使用 KB/s 显示
    return kbPerSecond.toFixed(2) + " KB/s";
  }
};

module.exports = {
  groupEventsByDate,
  formatDuration,
  formatDateTime,
  getDayOfWeek,
  formatRenderData,
  buildTemplate,
  convertBytesPerSecond,
};
