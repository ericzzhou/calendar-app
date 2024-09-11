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

    this.configuration = {
      eventInterval: 5, // 刷新事件间隔分钟
      notificationTime: 10, //事件提醒时间，提前x分钟
      defaultEventSize: 20, // 默认加载的事件数量
      defaultFontSize: 12, // 默认字体
    };
  }

  /**
   * 监听主线程消息
   */
  listeningMainEvent() {
    // 用户授权成功
    ipcRenderer.on("server-port", async (event, port) => {
      this.serverPort = port;
      this.oauth2Client = new google.auth.OAuth2(
        CLIENT_ID,
        CLIENT_SECRET,
        `http://localhost:${port}`
      );
    });

    //主线程获取到持久化的token
    ipcRenderer.on("tokens-retrieved", (event, tokens) => {
      console.log("从主线程获取到持久化的token:", tokens);
      if (tokens) {
        this.googleOauthToken = tokens;
        this.oauth2Client.setCredentials(tokens);

        this.refresh();
      } else {
        // 用户未登录，显示授权按钮
        document.getElementById("authButton").style.display = "block";
      }
    });

    // 用户授权成功
    ipcRenderer.on("auth-code", async (event, code) => {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);
      this.googleOauthToken = tokens;
      // 通知主线程持久化令牌
      this.sendEventToMain("save-tokens", tokens);

      this.refresh();
    });

    ipcRenderer.on("html", async (event, html) => {
      document.getElementById("eventList").innerHTML = html;
    });

    ipcRenderer.on("refresh", async (event) => {
      this.refresh();
    });

    ipcRenderer.on("configuration", async (event, value) => {
      console.log("configuration", value);
      this.configuration = value;
      // this.refresh();
    });

    ipcRenderer.on("storePath", async (event, value) => {
      // document.getElementById("footer").innerHTML = `
      // <a target="_blank" href="${value}">配置文件</a>
      // `;

      const linkElement = document.getElementById("config-link");
      // linkElement.textContent = value
      // linkElement.href = "#"
      linkElement.addEventListener("click", (e) => {
        e.preventDefault();
        this.sendEventToMain("open-file", value);
      });
    });

    ipcRenderer.on("version", async (event,version) => {
      document.getElementById("version").innerHTML = version
    });
  }

  // 向主线程发通知
  sendEventToMain(eventName, params) {
    ipcRenderer.send(eventName, params);
  }

  /**
   * 监听页面事件
   */
  listeningPageEvent() {
    // 点击google授权按钮进行授权
    const authButton = document.getElementById("authButton");

    const authEvent = () => {
      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
      });

      this.sendEventToMain("open-auth-url", authUrl);
    };
    authButton.removeEventListener("click", authEvent);
    authButton.addEventListener("click", authEvent);

    const eventsContainer = document.getElementById("eventList");
    eventsContainer.addEventListener("contextmenu", (e) => {
      // 使用 closest 确保捕获到正确的目标元素，防止点击到子元素导致问题
      const targetElement = e.target.closest(".event-container");
      if (targetElement) {
        document.querySelectorAll(".event-container").forEach((el) => {
          el.classList.remove("highlighted");
        });
        targetElement.classList.add("highlighted");

        console.log(`触发事件的元素${e.target}`, e);
        e.preventDefault();
        const link = targetElement.dataset.link;
        this.sendEventToMain("show-context-menu", link);
      }
    });

    
  }

  /**
   * 从 Google Calendar 获取数据
   * @param {*} maxResults
   * @returns
   */
  async getEventsFromGoogleCalendar(maxResults = 15) {
    console.log("googleOauthToken", this.googleOauthToken);
    if (!this.googleOauthToken) {
      return;
    }

    maxResults = this.configuration.defaultEventSize;
    document.getElementById("authButton").style.display = "none";

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

  init() {
    this.listeningMainEvent();
    this.listeningPageEvent();
    this.refresh();
    
  }
  async refresh() {
    // 向主线程请求获取持久化的令牌
    if (!this.googleOauthToken) {
      this.sendEventToMain("get-tokens");
    }
    const events = await this.getEventsFromGoogleCalendar();
    this.sendEventToMain("calendar-events", events);
  }
}

// // 监听从主进程发送的事件数据
// ipcRenderer.on("events-data", (event, events) => {
//   const groupedEvents = groupEventsByDate(events);
//   renderGroupedEvents(groupedEvents);
// });

const render = new RenderProcess();
render.init();
