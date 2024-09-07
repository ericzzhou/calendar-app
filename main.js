const { app, BrowserWindow, ipcMain, shell } = require("electron");
const http = require("http");
const url = require("url");
const schedule = require("node-schedule");
const { Notification } = require("electron");

let Store;
const httpServerPort = 12345;
class MainProcess {
  constructor() {
    this.store = null;
    this.win = null;
    this.httpServer = null;
    this.notificationJobs = new Map(); // 存储已经设置提醒的任务
    this.configuration = {
      eventInterval: 5, // 刷新事件间隔分钟
      notificationTime: 10, //事件提醒时间，提前x分钟
    };
  }

  async createMainWindow() {
    this.win = new BrowserWindow({
      width: 300,
      height: 800,
      webPreferences: {
        preload: `${__dirname}/preload.js`,
        nodeIntegration: true,
        contextIsolation: false,  // 确保可以正常使用 DOM 访问
      },
    });

    this.win.loadFile("index.html");
  }

  scheduleNotification(event) {
    // console.log(event)
    const eventStartTime = new Date(event.start.dateTime); // 假设 event.start.dateTime 是 ISO 时间格式
    const notificationTime = new Date(
      eventStartTime.getTime() - this.configuration.notificationTime * 60000
    ); // 提前 configuration.notificationTime 分钟提醒

    // 检查是否已经为该事件设置了提醒，如果有则取消
    if (this.notificationJobs.has(event.id)) {
      const existingJob = this.notificationJobs.get(event.id);
      existingJob.cancel(); // 取消之前的定时任务
      console.log(`提醒已取消： ${event.summary} at ${notificationTime}`);
    }

    // 如果当前时间已超过提醒时间，立即提醒
    const currentTime = new Date();
    if (notificationTime < currentTime) {
      console.log(`任务过期，立即提醒： ${event.summary} at ${currentTime}`);

      // 显示立即提醒
      const immediateNotification = new Notification({
        title: "会议提醒",
        body: `您的会议 "${event.summary}" 即将开始！`,
      });
      immediateNotification.show();
      return; // 跳过后续定时任务设置
    }

    // 正常设置新的提醒任务
    const job = schedule.scheduleJob(notificationTime, () => {
      const notification = new Notification({
        title: "会议提醒",
        body: `您的会议 "${event.summary}" 将在${this.configuration.notificationTime}分钟后开始。`,
      });
      notification.show();
    });

    // 将新任务存储到 Map 中，使用事件的唯一 ID 作为 key
    this.notificationJobs.set(event.id, job);

    console.log(`提醒已设置: ${event.summary} at ${notificationTime}`);
  }

  processEvents(events) {
    if (!events) {
      console.log("没有事件需要设置提醒");
      return;
    }
    events.forEach((event) => {
      if (event.start && event.start.dateTime) {
        this.scheduleNotification(event); // 为每个事件设置提醒
      }
    });
  }

  onAppEvent() {
    app.whenReady().then(this.createMainWindow());

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        if (this.httpServer) {
          this.httpServer.close();
        }
        app.quit();
      }
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });
  }

  onRenderEvent() {
    ipcMain.on("save-tokens", async (event, tokens) => {
      await this.setStore("oauthTokens", tokens);
      console.log("Tokens saved successfully");
    });

    ipcMain.on("get-tokens", (event) => {
      const tokens = this.store.get("oauthTokens");
      event.reply("tokens-retrieved", tokens);
    });

    ipcMain.on("calendar-events", (event, events) => {
      this.processEvents(events); // 处理事件并安排提醒
    });

    ipcMain.on("open-auth-url", (event, authUrl) => {
      shell.openExternal(authUrl);

      this.httpServer = http
        .createServer((req, res) => {
          const queryObject = url.parse(req.url, true).query;
          if (queryObject.code) {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("Authorization successful! You can close this window.");

            win.webContents.send("auth-code", queryObject.code);
            server.close();
          }
        })
        .listen(httpServerPort, () => {
          console.log("Server listening on port ", httpServerPort);
        });
    });
  }

  async setStore(storeName, storeValue) {
    if (!this.store) {
      // 动态导入 electron-store
      Store = (await import("electron-store")).default;
      this.store = new Store(); // 初始化 store
      console.log("Store loaded:", this.store.path); // 打印存储路径，确保加载成功
    }

    this.store.set(storeName, storeValue);
    console.log("Store set:", storeName, "=", storeValue);
  }

  async Init() {
    // 刷新事件间隔：分钟
    await this.setStore("eventInterval", this.configuration.eventInterval);

    // 事件提醒时间设置:分钟
    await this.setStore(
      "notificationTime",
      this.configuration.notificationTime
    );

    this.onAppEvent();
    this.onRenderEvent();
  }
}

const main = new MainProcess();
main.Init();
