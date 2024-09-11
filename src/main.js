const { app, BrowserWindow, ipcMain, shell, screen } = require("electron");
const http = require("http");
const url = require("url");
const path = require("path");
const fs = require("fs");
const notifier = require("node-notifier");

const createTray = require("./utils/createTray");
const storeManager = require("./utils/storeManager");
const logManager = require("./utils/logManager");
const createContextMenu = require("./utils/contextMenu");
const eventManager = require("./utils/eventManager");
const winManager = require("./utils/winManager");
const checkUpdate = require("./utils/update");

class MainProcess {
  constructor() {
    this.windows = {
      main: null,
      setting: null,
    };
    this.tray = null; //系统托盘
    this.httpServer = null;
    this.notificationJobs = new Map(); // 存储已经设置提醒的任务
    this.configuration = {
      eventInterval: 5, // 刷新事件间隔分钟
      notificationTime: 10, //事件提醒时间，提前x分钟
      defaultEventSize: 20, // 默认加载的事件数量
      defaultFontSize: 12, // 默认字体
      serverUrl: null,
    };
    this.oauthTokens = null;
  }

  async InitMainWindow() {
    const win = await winManager.createMainWin(
      `${__dirname}/preload.js`,
      `${__dirname}/index.html`
    );
    logManager.info("init main window complate ......");

    logManager.info("init configuration ......");
    logManager.info(this.configuration);
    win.webContents.send("configuration", this.configuration);

    logManager.info("init oauthTokens ......");
    logManager.info(this.oauthTokens);
    win.webContents.send("oauthTokens", this.oauthTokens);

    logManager.info("init store path ......");
    const storePath = await storeManager.getStorePath();

    logManager.info(`storePath : ${storePath}`);
    win.webContents.send("storePath", await storeManager.getStorePath());

    win.webContents.send("refresh");
    win.webContents.send("version",app.getVersion())

    logManager.info("init mainWin event : minimize ......");
    // 当窗口最小化时隐藏到托盘
    win.on("minimize", (event) => {
      event.preventDefault();
      win.hide(); // 最小化时隐藏到系统托盘
    });

    this.windows.main = win;
    return win;
  }

  async onAppEvent() {
    await app.whenReady();

    logManager.info("app ready ......");

    logManager.info("init main window ......");
    const mainWin = await this.InitMainWindow();

    logManager.info("init tray ......");
    this.tray = createTray(mainWin);

    logManager.info("init http server ......");
    this.createHttpServer();

    logManager.info("init page event ......");
    this.onRenderEvent();

    checkUpdate(this.configuration.serverUrl);
    //#region  APP 事件监听
    // 当窗口关闭时隐藏到托盘，而不是完全退出应用
    app.on("close", (event) => {
      event.processEvents(); // 阻止默认行为，防止应用关闭
      this.windows.main.hide();
    });

    app.on("before-quit", () => {
      if (this.httpServer) {
        this.httpServer.close();
      }
    });

    app.on("window-all-closed", () => {
      // macOS 系统（darwin 平台)
      if (process.platform !== "darwin") {
        if (this.httpServer) {
          this.httpServer.close();
        }
        app.quit();
        // this.windows.main.hide();
      }
    });

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await this.InitMainWindow();
      }
    });
    //#endregion
  }

  onRenderEvent() {
    ipcMain.on("save-tokens", async (event, tokens) => {
      await storeManager.setStore("oauthTokens", tokens);
      logManager.info("Tokens saved successfully");
    });

    ipcMain.on("get-tokens", async (event) => {
      const tokens = await storeManager.getStoreByKey("oauthTokens");
      // console.log("观察", tokens);
      event.reply("tokens-retrieved", tokens);
    });

    ipcMain.on("calendar-events", (event, events) => {
      eventManager.processEvents(events); // 处理事件并安排提醒
      // this.buildTemplate(events);
      const html = eventManager.buildTemplate(events, this.configuration);
      this.windows.main.webContents.send("html", html); //TODO 改成 replay
    });

    ipcMain.on("open-auth-url", (event, authUrl) => {
      shell.openExternal(authUrl);
    });

    ipcMain.on("show-context-menu", (event, link) => {
      console.log(`收到右键菜单请求：${link}`);
      createContextMenu(link);
    });

    // 处理打开文件的请求
    ipcMain.on("open-file", (event, filePath) => {
      console.log("收到打开文件请求：", filePath);
      shell.openPath(filePath);
    });
  }

  createHttpServer() {
    this.httpServer = http.createServer((req, res) => {
      const queryObject = url.parse(req.url, true).query;
      if (queryObject.code) {
        console.log("Google 授权成功");
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Authorization successful! You can close this window.");

        this.windows.main.webContents.send("auth-code", queryObject.code);
        // this.httpServer.close();
      }
    });

    this.httpServer.listen(0, () => {
      const address = this.httpServer.address();
      this.windows.main.webContents.send("server-port", address.port);
      console.log(`Server listening on port: ${address.port}`);
    });
  }

  setIntervalJob() {
    if (this.setIntervalId) {
      clearInterval(this.setIntervalId);
      this.setIntervalId = null;
    }

    const eventInterval = this.configuration.eventInterval;
    logManager.info(`setIntervalJob 设置事件更新间隔：${eventInterval} 分钟`);
    this.setIntervalId = setInterval(() => {
      console.log("refresh 定时任务执行");
      this.windows.main.webContents.send("refresh");
    }, eventInterval * 60 * 1000);
  }

  async Init() {
    logManager.info("Init App......");

    logManager.info("Init 单例锁检查 ......");
    //#region  单例锁，防止多开
    const gotTheLock = app.requestSingleInstanceLock(); // 单例锁，防止多开

    if (!gotTheLock) {
      app.quit(); // 如果未能获得锁，直接退出应用
      return;
    } else {
      app.on("second-instance", () => {
        // 当用户尝试启动第二个实例时，让现有窗口恢复
        if (this.windows.main) {
          if (this.windows.main.isMinimized()) {
            this.windows.main.restore();
          }
          this.windows.main.focus();
        }
      });
    }
    //#endregion

    logManager.info("Init 获取配置文件 ......");
    this.configuration = await storeManager.getConfiguration();
    this.oauthTokens = await storeManager.getStoreByKey("oauthTokens");

    await this.onAppEvent();

    // this.setIntervalJob();
    logManager.info("正在设置定时刷新任务");
    eventManager.setIntervalJob(() => {
      console.log("refresh 定时任务执行");
      this.windows.main.webContents.send("refresh");
    });

    logManager.info("init 启动配置文件监控，当发生变化时向主窗口传递数据");
    // 启动配置文件监控，当发生变化时向主窗口传递数据
    await storeManager.watchStoreChanged((newConf) => {
      logManager.info("configuration changed ......");
      logManager.info(newConf);
      this.configuration = newConf;
      if (this.windows.main) {
        this.windows.main.webContents.send("configuration", newConf);
        this.windows.main.webContents.send("refresh");
      }
    });
  }
}

const main = new MainProcess();
main.Init();
