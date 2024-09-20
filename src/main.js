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
const { convertBytesPerSecond } = require("./utils/utils");

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

  
  /**
   * 从github获取指定tag的release note
   * @param {*} tag 
   * @returns 
   */
  async getReleaseNotes(tag) {
    const apiUrl = `https://api.github.com/repos/ericzzhou/calendar-app/releases/tags/v${tag}`;
    const response = await fetch(apiUrl,{
      method:"GET",
      headers: {
        "Content-Type": "application/json",
        'Authorization': 'Bearer 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',
      },
    });
    // 设置 header 授权

    const data = await response.json();
    return data.body;
  }

  /**
   * 初始化窗口
   * @returns
   */
  async InitWindow() {
    const win = await winManager.createMainWin(
      `${__dirname}/preload.js`,
      `${__dirname}/index.html`
    );
    this.windows.main = win;

    win.webContents.send("configuration", this.configuration);
    win.webContents.send("oauthTokens", this.oauthTokens);

    const releaseNote = await this.getReleaseNotes(app.getVersion())
    win.webContents.send("appInfomation", {
      appName: app.getName(),
      appVersion: app.getVersion(),
      appUserData: app.getPath("userData"),
      appStorePath: await storeManager.getStorePath(),
      appReleaseNote : releaseNote
    });
    this.windows.main.show();
  }

  async onAppEvent() {
    await app.whenReady();
    await this.InitWindow();

    this.tray = createTray(this.windows.main);
    this.onRenderEvent();
    this.createHttpServer();

    try {
      checkUpdate(this.configuration.serverUrl, (progressObj) => {
        const speedFormat = convertBytesPerSecond(progressObj.bytesPerSecond);

        const dowloadTips = `新版本：已下载 ${Number(
          progressObj.percent
        ).toFixed(2)}%，Speed：${speedFormat}`;
        this.windows.main.webContents.send("download-progress", dowloadTips);
      });
    } catch (error) {
      logManager.error("检查更新失败");
      logManager.error(error);
    }
    //#region  APP 事件监听
    // 当窗口关闭时隐藏到托盘，而不是完全退出应用
    app.on("close", (event) => {
      console.log("app.on close");
      event.processEvents(); // 阻止默认行为，防止应用关闭
      this.windows.main.hide();
    });

    app.on("before-quit", () => {
      console.log("app.on before-quit");
      logManager.info("应用正在退出...");

      try {
        // 关闭服务
        if (this.httpServer) {
          this.httpServer.close();
          logManager.info("HTTP 服务器已关闭");
        }

        // 关闭窗口
        BrowserWindow.getAllWindows().forEach((win) => {
          win.destroy();
        });
      } catch (error) {
        logManager.error("退出应用时发生错误：");
        logManager.error(error);
      }
    });

    app.on("window-all-closed", () => {
      console.log("app.on window-all-closed");

      // macOS 系统（darwin 平台)
      if (process.platform !== "darwin") {
        app.quit();
      }
    });

    app.on("activate", async () => {
      console.log("app.on activate");
      if (BrowserWindow.getAllWindows().length === 0) {
        await this.InitWindow();
      }
    });

    //#endregion
  }

  onRenderEvent() {
    ipcMain.on("save-tokens", async (event, tokens) => {
      await storeManager.setStore("oauthTokens", tokens);
      // logManager.info("Tokens saved successfully");
    });

    // ipcMain.on("get-tokens", async (event) => {
    //   const tokens = await storeManager.getStoreByKey("oauthTokens");
    //   // console.log("观察", tokens);
    //   event.reply("tokens-retrieved", tokens);
    // });

    // ipcMain.on("calendar-events", (event, events) => {
    //   eventManager.processEvents(events); // 处理事件并安排提醒
    //   // this.buildTemplate(events);
    //   const html = eventManager.buildTemplate(events, this.configuration);
    //   this.windows.main.webContents.send("html", html); //TODO 改成 replay
    // });

    ipcMain.on("open-google-auth-url", (event) => {
      const authUrl = eventManager.generateAuthUrl(this.httpServerPort);
      console.log("authUrl:", authUrl);
      shell.openExternal(authUrl);
    });

    ipcMain.on("show-context-menu", (event, obj) => {
      // console.log(`收到右键菜单请求：`,obj);
      createContextMenu(obj);
    });

    // 处理打开文件的请求
    ipcMain.on("open-file", (event, filePath) => {
      console.log("收到打开文件请求：", filePath);
      shell.openPath(filePath);
    });
  }

  async refreshEventHtml(httpServerPort) {
    const eventsHtml = await eventManager.buildEventsHtml(httpServerPort);
    this.windows.main.webContents.send("html", eventsHtml);
  }
  createHttpServer() {
    this.httpServer = http.createServer(async (req, res) => {
      const queryObject = url.parse(req.url, true).query;
      if (queryObject.code) {
        console.log("Google 授权成功");
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Authorization successful! You can close this window.");
        const code = queryObject.code;

        const tokens = await eventManager.getTokenFromOAuthClient(code);

        await storeManager.setStore("oauthTokens", tokens);
        this.refreshEventHtml(this.httpServerPort);

        // this.httpServer.close();
      }
    });

    this.httpServer.listen(0, async () => {
      const address = this.httpServer.address();
      this.httpServerPort = address.port;

      await this.refreshEventHtml(address.port);
      this.windows.main.webContents.send("server-port", address.port);

      logManager.info(
        `OAuth Capture Server listening on port: ${address.port}`
      );
    });
  }

  async Init() {
    // logManager.info("Init App......");

    // logManager.info("Init 单例锁检查 ......");
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

    // logManager.info("Init 获取配置文件 ......");
    this.configuration = await storeManager.getConfiguration();
    this.oauthTokens = await storeManager.getStoreByKey("oauthTokens");
    await this.onAppEvent();

    eventManager.setIntervalJob(() => {
      console.log("refresh 定时任务执行");
      this.refreshEventHtml(this.httpServerPort);
    });

    // logManager.info("init 启动配置文件监控，当发生变化时向主窗口传递数据");
    // 启动配置文件监控，当发生变化时向主窗口传递数据
    await storeManager.watchStoreChanged(async (newConf) => {
      // logManager.info("configuration changed ......");
      // logManager.info(newConf);
      this.configuration = newConf;
      if (this.windows.main) {
        this.windows.main.webContents.send("configuration", newConf);
        this.refreshEventHtml(this.httpServerPort);
      }
    });
  }
}

/**设置应用开机启动 */
app.setLoginItemSettings({
  openAtLogin: true, // 是否开机启动
  path: app.getPath("exe"), // 可执行文件的路径
  args: [], // 启动传参，--hidden 是启动后隐藏主窗口
});

const main = new MainProcess();
main.Init();
