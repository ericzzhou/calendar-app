const path = require("path");
require('dotenv').config({ path: path.resolve(__dirname,"../", '.env') });
const { app, BrowserWindow, ipcMain, shell, screen, Tray } = require("electron");
const http = require("http");
const url = require("url");
const os = require('os');

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
    this.usageInterval = null;
    this.isExpanded = true; // 修改这里，默认展开
    this.windowWidth = 300; // 窗口固定宽度
    this.windowHeight = 800; // 修改这里：窗口固定高度设置为800
    this.visibleWidth = 5; // 可见部分的宽度
    this.isAnimating = false; // 添加一个标志来防止动画重叠
    this.isMenuEnabled = false; // 添加这行来控制菜单是否启用
  }

  /**
   * 从github获取指定tag的release note
   * @param {*} tag
   * @returns
   */
  async getReleaseNotes(tag) {
    const apiUrl = `https://api.github.com/repos/ericzzhou/calendar-app/releases/tags/v${tag}`;
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
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
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const win = new BrowserWindow({
      width: this.windowWidth,
      height: this.windowHeight,
      x: width - this.windowWidth, // 修改这里，默认完全显示
      y: height - this.windowHeight,
      frame: true, // 修改这里，启用窗口框架
      transparent: false, // 修改这里，禁用透明
      alwaysOnTop: false, // 修改这里，不总是置顶
      skipTaskbar: false, // 保持为 false
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    win.loadFile(path.join(__dirname, 'index.html'));
    console.log("NODE_ENV:",process.env.NODE_ENV);
    if (process.env.NODE_ENV === 'development') {
      win.webContents.openDevTools();
    }
    
    this.windows.main = win;

    // 设置任务栏上显示的应用名称
    win.setTitle(app.getName());
    win.setMenuBarVisibility(this.isMenuEnabled);
    // 使用 webContents 来添加事件监听器
    win.webContents.on('did-finish-load', () => {
      // 在这里添加显示窗口的代码
      win.show();
      win.focus();
    });

    win.webContents.send("configuration", this.configuration);
    win.webContents.send("oauthTokens", this.oauthTokens);

    const releaseNote = await this.getReleaseNotes(app.getVersion());
    win.webContents.send("appInfomation", {
      appName: app.getName(),
      appVersion: app.getVersion(),
      appUserData: app.getPath("userData"),
      appStorePath: await storeManager.getStorePath(),
      appReleaseNote: releaseNote,
    });

    // 在窗口创建后,设置任务栏缩略图
    win.setThumbnailClip({ x: 0, y: 0, width: this.windowWidth, height: this.windowHeight });
    win.setThumbnailToolTip(app.getName());

    // 添加以下代码来恢复默认菜单
    if (this.isMenuEnabled) {
      const { Menu } = require('electron');
      Menu.setApplicationMenu(Menu.getApplicationMenu());
    }

    
  }

  expandWindow() {
    if (!this.isExpanded && !this.isAnimating) {
      this.isAnimating = true;
      this.animateWindow(this.visibleWidth, this.windowWidth);
    }
  }

  collapseWindow() {
    if (this.isExpanded && !this.isAnimating) {
      this.isAnimating = true;
      this.animateWindow(this.windowWidth, this.visibleWidth);
    }
  }

  animateWindow(startVisible, endVisible) {
    const animationDuration = 150; // 动画持续时间（毫秒）
    const steps = 10; // 动画步数
    const stepDuration = animationDuration / steps;
    const stepVisible = (endVisible - startVisible) / steps;

    let currentStep = 0;
    const animate = () => {
      if (currentStep < steps) {
        const visibleWidth = startVisible + stepVisible * currentStep;
        const screenWidth = screen.getPrimaryDisplay().workAreaSize.width;
        const screenHeight = screen.getPrimaryDisplay().workAreaSize.height;
        const newX = screenWidth - visibleWidth;
        const newY = screenHeight - this.windowHeight; // 保持窗口在屏幕底部
        this.windows.main.setPosition(Math.round(newX), newY);
        currentStep++;
        setTimeout(animate, stepDuration);
      } else {
        this.isAnimating = false;
        this.isExpanded = (endVisible === this.windowWidth);
        // 确保最终位置精确
        const screenWidth = screen.getPrimaryDisplay().workAreaSize.width;
        const screenHeight = screen.getPrimaryDisplay().workAreaSize.height;
        const finalX = screenWidth - endVisible;
        const finalY = screenHeight - this.windowHeight; // 保持窗口在屏幕底部
        this.windows.main.setPosition(Math.round(finalX), finalY);
      }
    };

    animate();
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
    // 修改这里：监听窗口的 'close' 事件，而不是应用的 'close' 事件
    this.windows.main.on('close', (event) => {
      event.preventDefault(); // 阻止窗口关闭
      this.windows.main.hide(); // 隐藏窗口
    });

    // 保留原有的 'before-quit' 事件处理
    app.on("before-quit", () => {
      console.log("app.on before-quit");
      logManager.info("应用正在退出...");

      this.stopUsageMonitoring(); // 停止监控资源使用情况

      try {
        // 关闭服务
        if (this.httpServer) {
          this.httpServer.close();
          logManager.info("HTTP 服务器已关闭");
        }

        // 关闭口
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
    //   eventManager.processEvents(events); // 处理件并安排提醒
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

    // this.tray = createTray(this.windows.main);
    this.startUsageMonitoring();
  }

  startUsageMonitoring() {
    this.usageInterval = setInterval(() => {
      const cpuUsage = process.cpuUsage();
      const memUsage = process.memoryUsage();
      
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      
      const cpuPercentage = ((cpuUsage.user + cpuUsage.system) / 1000000).toFixed(2);
      const memPercentage = ((memUsage.rss / totalMem) * 100).toFixed(2);
      
      if (this.tray) {
        this.tray.setToolTip(`CPU: ${cpuPercentage}%\n内存: ${memPercentage}%\n${new Date().toLocaleString()}`);
      }
    }, 1000); // 每秒更新一次
  }

  stopUsageMonitoring() {
    if (this.usageInterval) {
      clearInterval(this.usageInterval);
      this.usageInterval = null;
    }
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

// 监听未处理的 Promise 拒绝事件
process.on("unhandledRejection", (reason, promise) => {
  if (reason instanceof Error) {
    // 如果 reason 是 Error 对象记录详细的错误信息
    logManager.error(
      `Unhandled Rejection at: ${promise}, reason: ${reason.message}, stack: ${reason.stack}`
    );
  } else {
    // 如果 reason 不是 Error 对象，直接记录原始信息
    logManager.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  }
  // logManager.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  // 你还可以根据需要关闭应用程或处理其他逻辑
});

// 监听未捕获的异常
process.on("uncaughtException", (err) => {
  logManager.error(`Uncaught Exception: ${err.message}`);
  // // 记录错误并安全地退出应用
  // process.exit(1);
});