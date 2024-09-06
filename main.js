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
  }

  async createMainWindow() {
    this.win = new BrowserWindow({
      width: 300,
      height: 800,
      webPreferences: {
        preload: `${__dirname}/preload.js`,
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.win.loadFile("index.html");
  }

  scheduleNotification(event) {
    const eventStartTime = new Date(event.start.dateTime); // 假设 event.start.dateTime 是 ISO 时间格式
    const notificationTime = new Date(eventStartTime.getTime() - 10 * 60000); // 提前10分钟提醒

    schedule.scheduleJob(notificationTime, () => {
      const notification = new Notification({
        title: "会议提醒",
        body: `您的会议 "${event.summary}" 将在10分钟后开始。`,
      });
      notification.show();
    });

    console.log(`提醒已设置: ${event.summary} at ${notificationTime}`);
  }

  processEvents(events) {
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
    ipcMain.on("save-tokens", (event, tokens) => {
      this.store.set("oauthTokens", tokens);
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

  InitStore() {
    this.store = new Store(); // 初始化 store
    console.log("Store loaded:", this.store.path); // 打印存储路径，确保加载成功
  }
  async Init() {
    // 动态导入 electron-store
    Store = (await import("electron-store")).default;
    this.InitStore();
    this.onAppEvent();
    this.onRenderEvent();
  }
}

const main = new MainProcess();
main.Init();
