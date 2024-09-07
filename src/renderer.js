const { google } = require("googleapis");
const { ipcRenderer } = require("electron");

const CLIENT_ID =
  "356247018475-0hdovvr97o9beo47sjkn2e38eibl6epb.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const REDIRECT_URI = "http://localhost:12345"; // 使用本地重定向

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

class RenderProcess {
  constructor() {
    this.events = [];

    /**
     * google oauth token
     */
    this.googleOauthToken = null;
    this.oauth2Client = new google.auth.OAuth2(
      CLIENT_ID,
      CLIENT_SECRET,
      REDIRECT_URI
    );
  }

  /**
   * 监听主线程消息
   */
  onMainEvent() {
    //主线程获取到持久化的token
    ipcRenderer.on("tokens-retrieved", (event, tokens) => {
      console.log("从主线程获取到持久化的token:", tokens);
      if (tokens) {
        this.googleOauthToken = tokens;
        this.oauth2Client.setCredentials(tokens);
        this.getAndRenderEvents();
      } else {
        // 用户未登录，显示授权按钮
        document.getElementById("authButton").style.display = "block";
      }
    });

    // 用户授权成功
    ipcRenderer.on("auth-code", async (event, code) => {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      // 通知主线程持久化令牌
      this.sendEventToMain("save-tokens", tokens);
      this.getAndRenderEvents();
    });
  }

  // 向主线程发通知
  sendEventToMain(eventName, params) {
    ipcRenderer.send(eventName, params);
  }

  onPageEvent() {
    // 点击google授权按钮进行授权
    const authButton = document.getElementById("authButton");
    authButton.addEventListener("click", () => {
      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
      });

      this.sendEventToMain("open-auth-url", authUrl);
    });

    document.getElementById("reload").addEventListener("click", () => {
      this.init();
    });
  }
  // 格式化日期时间
  formatDateTime(dateTime) {
    const options = {
      // year: "numeric",
      // month: "2-digit",
      // day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    };
    return new Date(dateTime).toLocaleTimeString("zh-CN", options);
    // return new Date(dateTime).toLocaleDateString("zh-CN", options);
  }

  // 格式化事件持续时长
  formatDuration(start, end) {
    const startTime = new Date(start);
    const endTime = new Date(end);
    const duration = Math.round((endTime - startTime) / (1000 * 60)); // 时长（分钟）

    // 如果持续时间小于60分钟，直接返回 xx分钟
    if (duration < 60) {
      return `${duration}分钟`;
    }

    // 如果持续时间是60分钟的倍数，返回 xx小时
    if (duration % 60 === 0) {
      const hours = duration / 60;
      return `${hours}小时`;
    }

    // 否则返回 xx.xx小时，保留两位小数
    const hours = (duration / 60).toFixed(2);
    return `${hours}小时`;
  }

  // 事件分组
  groupEventsByDate(events) {
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
  }

  /**
   * 渲染事件列表,返回 html 片段
   * @param {*} groupedEvents
   * @returns 返回 html 片段
   */
  renderGroupedEvents(groupedEvents) {
    const _this = this;
    let container = "";
    // const container = document.getElementById("events-container");
    // container.innerHTML = "";

    function createEventElement(event) {
      const div = document.createElement("div");
      div.classList.add("event");
      div.innerHTML = `
        <div class="event-container">
          <div class="event-time">${_this.formatDateTime(
            event.start.dateTime
          )} <br/> ${_this.formatDuration(
        event.start.dateTime,
        event.end.dateTime
      )}</div>
          <div class="event-summary">${event.summary}</div>
          </div>
      `;
      return div;
    }

    if (groupedEvents.today.length > 0) {
      const todaySection = document.createElement("div");
      todaySection.classList.add("section");
      todaySection.innerHTML = "<h3>今天</h3>";
      groupedEvents.today.forEach((event) =>
        todaySection.appendChild(createEventElement(event))
      );
      container += todaySection.innerHTML;
    }

    if (groupedEvents.tomorrow.length > 0) {
      const tomorrowSection = document.createElement("div");
      tomorrowSection.classList.add("section");
      tomorrowSection.innerHTML = "<h3>明天</h3>";
      groupedEvents.tomorrow.forEach((event) =>
        tomorrowSection.appendChild(createEventElement(event))
      );
      container += tomorrowSection.innerHTML;
    }

    groupedEvents.upcoming.forEach((group) => {
      const upcomingSection = document.createElement("div");
      upcomingSection.classList.add("section");
      upcomingSection.innerHTML = `<h3>${group.date}</h3>`;
      group.events.forEach((event) =>
        upcomingSection.appendChild(createEventElement(event))
      );
      container += upcomingSection.innerHTML;
    });

    return container;
  }
  /**
   * 从 Google Calendar 获取数据
   * @param {*} maxResults
   * @returns
   */
  async getEventsFromGoogleCalendar(maxResults = 10) {
    console.log("googleOauthToken", this.googleOauthToken);
    if (!this.googleOauthToken) {
      return;
    }
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

    return events;
  }

  async getAndRenderEvents() {
    const events = await this.getEventsFromGoogleCalendar();
    console.log("events from google:", events);
    this.sendEventToMain("calendar-events", events);

    const groupedEvents = this.groupEventsByDate(events);
    console.log("groupEvents", groupedEvents);
    const containerHtml = this.renderGroupedEvents(groupedEvents);
    console.log("containerHtml", containerHtml);
    document.getElementById("eventList").innerHTML = containerHtml;
  }

  async init() {
    // 向主线程请求获取持久化的令牌
    this.sendEventToMain("get-tokens");
    this.onMainEvent();
    this.onPageEvent();
    this.getAndRenderEvents();
  }
}

// // 监听从主进程发送的事件数据
// ipcRenderer.on("events-data", (event, events) => {
//   const groupedEvents = groupEventsByDate(events);
//   renderGroupedEvents(groupedEvents);
// });

const render = new RenderProcess();
render.init();

setInterval(() => {
  render.getAndRenderEvents();
}, 5 * 60 * 1000); // 5分钟刷新一次
