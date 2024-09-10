const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Tray,
  Menu,
  screen,
  clipboard,
} = require("electron");
const http = require("http");
const url = require("url");
const schedule = require("node-schedule");
const { Notification } = require("electron");
const path = require("path");
const handlebars = require("handlebars");
const fs = require("fs");
const notifier = require("node-notifier");
const log = require("electron-log");

// 配置日志文件路径
log.transports.file.file = path.join(app.getPath("userData"), "main.log");
let Store;

class MainProcess {
  constructor() {
    this.store = null;
    this.win = null;
    this.tray = null; //系统托盘
    this.httpServer = null;
    this.notificationJobs = new Map(); // 存储已经设置提醒的任务
    this.configuration = {
      eventInterval: 5, // 刷新事件间隔分钟
      notificationTime: 10, //事件提醒时间，提前x分钟
      defaultEventSize: 20, // 默认加载的事件数量
      defaultFontSize: 12, // 默认字体
    };
    this.setIntervalId = null; // 定时读取新事件的定时器
  }

  async createMainWindow() {
    // 获取主屏幕的尺寸
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    // 将窗口吸附到屏幕的右侧
    const windowWidth = 300; // 假设窗口宽度是 800
    const windowHeight = 800;
    const xPos = width - windowWidth; // 计算窗口的 x 坐标，使其靠右侧
    const yPos = 30; // 从屏幕顶部开始吸附

    this.win = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: xPos,
      y: yPos,
      alwaysOnTop: true, // 使窗口始终在其他窗口之上
      webPreferences: {
        preload: `${__dirname}/preload.js`, // 确保能与渲染进程通讯
        nodeIntegration: true,
        contextIsolation: false, // 确保可以正常使用 DOM 访问
      },
    });

    this.win.setMenuBarVisibility(false);
    this.win.loadFile(`${__dirname}/index.html`);

    // 当窗口最小化时隐藏到托盘
    this.win.on("minimize", (event) => {
      event.preventDefault();
      this.win.hide(); // 最小化时隐藏到系统托盘
    });

    this.win.webContents.send("configuration", this.configuration);
  }

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
      console.log(`提醒已取消： ${event.summary} at ${notificationTime}`);
    }

    // 获取当前时间
    const currentTime = new Date();

    if (eventStartTime < currentTime) {
      console.log(
        `会议已经开始或已结束： ${event.summary} at ${eventStartTime}`
      );
      return; // 跳过后续提醒设置
    }

    //如果当前时间已超过提醒时间，立即提醒
    if (notificationTime < currentTime) {
      console.log(`任务过期，立即提醒： ${event.summary} at ${currentTime}`);

      // 显示立即提醒
      // const immediateNotification = new Notification({
      //   title: "会议提醒",
      //   body: `您的会议 "${event.summary}" 即将开始！`,
      // });
      // immediateNotification.show();

      this.notification("会议提醒", `您的会议 "${event.summary}" 即将开始！`);

      return; // 跳过后续定时任务设置
    }

    // 正常设置新的提醒任务
    const job = schedule.scheduleJob(notificationTime, () => {
      this.notification(
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

    console.log(`提醒已设置: ${event.summary} at ${notificationTime}`);
  }

  processEvents(events) {
    if (!events) {
      console.log("没有事件需要设置提醒");
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

  onAppEvent() {
    app.whenReady().then(() => {
      log.info("app ready ......");
      this.createMainWindow().then(() => {
        log.info("create window success ......");
      });
      this.watchStoreChanged();

      this.win.webContents.send("storePath", this.store.path);
    });

    // 当窗口关闭时隐藏到托盘，而不是完全退出应用
    app.on("close", (event) => {
      event.processEvents(); // 阻止默认行为，防止应用关闭
      this.win.hide();
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
      }
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });
  }
  createTray() {
    const iconPath = path.join(
      __dirname,
      "../",
      "build/icons/Martz90-Circle-Calendar.512.png"
    ); // 你自己的托盘图标路径
    this.tray = new Tray(iconPath);

    // 双击托盘图标时显示主窗口
    this.tray.on("double-click", () => {
      if (this.win) {
        this.win.show();
      }
    });

    // 创建托盘菜单
    const trayMenu = Menu.buildFromTemplate([
      {
        label: "显示",
        click: () => {
          this.win.show();
        },
      },
      {
        label: "刷新日历数据",
        click: () => {
          this.win.webContents.send("refresh");
        },
      },
      {
        label: "显示系统菜单",
        click: () => {
          this.win.setMenuBarVisibility(true);
        },
      },
      {
        label: "测试通知",
        click: () => {
          this.notification("通知标题", "通知正文", false, true);
        },
      },
      {
        label: "重置默认设置",
        click: () => {
          this.setDefaultConfiguration();
        },
      },
      {
        label: "退出",
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.setToolTip("日程提醒");
    this.tray.setContextMenu(trayMenu);
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
      this.buildTemplate(events);
    });

    ipcMain.on("open-auth-url", (event, authUrl) => {
      shell.openExternal(authUrl);
    });

    ipcMain.on("show-context-menu", (event, link) => {
      console.log(`收到右键菜单请求：${link}`);
      this.createContextMenu(link);
    });

    // 处理打开文件的请求
    ipcMain.on("open-file", (event, filePath) => {
      console.log("收到打开文件请求：", filePath);
      shell.openPath(filePath);
    });
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

  // 格式化事件持续时长
  formatDuration(start, end) {
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

  /**
   * 获取指定日期的星期几
   * @param {string|Date} dateTime - 日期时间字符串或 Date 对象
   * @returns {string} - 星期几的名称
   */
  getDayOfWeek(dateTime) {
    const date = new Date(dateTime);
    const options = {
      weekday: "long", // 使用 "short" 可以获取缩写，例如 "Mon"
    };
    return date.toLocaleDateString("zh-CN", options); // 返回中文的星期几名称，例如 "星期一"
  }

  formatRenderData(groupedEvents) {
    const events = [];
    if (groupedEvents.today.length > 0) {
      events.push({
        date: "今天",
        DayOfWeek: this.getDayOfWeek(groupedEvents.today[0].start.dateTime),
        events: groupedEvents.today.map((event) => ({
          ...event,
          start: this.formatDateTime(event.start.dateTime),
          duration: this.formatDuration(
            event.start.dateTime,
            event.end.dateTime
          ),
        })),
      });
    }
    if (groupedEvents.tomorrow.length > 0) {
      events.push({
        date: "明天",
        DayOfWeek: this.getDayOfWeek(groupedEvents.tomorrow[0].start.dateTime),
        events: groupedEvents.tomorrow.map((event) => ({
          ...event,
          start: this.formatDateTime(event.start.dateTime),
          duration: this.formatDuration(
            event.start.dateTime,
            event.end.dateTime
          ),
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
            start: this.formatDateTime(event.start.dateTime),
            duration: this.formatDuration(
              event.start.dateTime,
              event.end.dateTime
            ),
          }))
        );
        return;
      }

      events.push({
        date: group.date,
        DayOfWeek: this.getDayOfWeek(group.events[0].start.dateTime),
        events: group.events.map((event) => ({
          ...event,
          start: this.formatDateTime(event.start.dateTime),
          duration: this.formatDuration(
            event.start.dateTime,
            event.end.dateTime
          ),
        })),
      });
    });

    return events;
  }
  buildTemplate(events) {
    const group = this.groupEventsByDate(events);
    const data = this.formatRenderData(group);
    const templatePath = path.join(__dirname, "index.hbs");

    const templateSource = fs.readFileSync(templatePath, "utf8");

    const template = handlebars.compile(templateSource);

    const datas = {
      data: data,
      fontSize: this.configuration.defaultFontSize,
    };
    // console.log("datas", datas);
    const html = template(datas);
    this.win.webContents.send("html", html);
  }

  /**
   * 检测store配置文件修改
   */
  async watchStoreChanged() {
    if (!this.store) {
      // 动态导入 electron-store
      Store = (await import("electron-store")).default;
      this.store = new Store(); // 初始化 store
      console.log("Store loaded:", this.store.path); // 打印存储路径，确保加载成功
    }

    log.info("watch store changed begin");
    fs.watchFile(this.store.path, async (curr, prev) => {
      log.info("store changed");
      if (curr.mtime !== prev.mtime) {
        // 配置文件发生变化，提醒用户重启应用
        this.notification(
          "配置文件修改",
          "配置文件已修改，请重启应用以应用新配置。"
        );
      }

      const newConf = await this.getStore("configuration");
      log.info("newConf", newConf);
      if (newConf == null) {
        await this.setDefaultConfiguration();
      }

      this.win.webContents.send("configuration", newConf);
      log.info("win.webContents.send configuration", newConf);
    });
  }
  async getStore(key) {
    if (!this.store) {
      // 动态导入 electron-store
      Store = (await import("electron-store")).default;
      this.store = new Store(); // 初始化 store
      console.log("Store loaded:", this.store.path); // 打印存储路径，确保加载成功
    }
    this.configuration = this.store.get("configuration");
    return this.configuration;
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

  createHttpServer() {
    this.httpServer = http.createServer((req, res) => {
      const queryObject = url.parse(req.url, true).query;
      if (queryObject.code) {
        console.log("Google 授权成功");
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Authorization successful! You can close this window.");

        this.win.webContents.send("auth-code", queryObject.code);
        // this.httpServer.close();
      }
    });

    this.httpServer.listen(0, () => {
      const address = this.httpServer.address();
      this.win.webContents.send("server-port", address.port);
      console.log(`Server listening on port: ${address.port}`);
    });
  }

  // 创建右键菜单并复制会议链接
  createContextMenu(eventLink) {
    const menu = Menu.buildFromTemplate([
      {
        label: "复制会议链接",
        click: () => {
          clipboard.writeText(eventLink); // 复制链接到剪贴板

          console.log(`会议链接已复制: ${eventLink}`);
        },
      },
      {
        label: "打开会议",
        click: () => {
          shell.openExternal(eventLink);

          console.log(`会议已打开: ${eventLink}`);
        },
      },
    ]);

    menu.popup(); // 显示菜单
  }

  setIntervalJob() {
    if (this.setIntervalId) {
      clearInterval(this.setIntervalId);
      this.setIntervalId = null;
    }

    const eventInterval = this.configuration.eventInterval;
    console.log(`setIntervalJob 设置事件时间：${eventInterval} 分钟`);
    this.setIntervalId = setInterval(() => {
      console.log("refresh 定时任务执行");
      this.win.webContents.send("refresh");
    }, eventInterval * 60 * 1000);
  }

  /**
   * 重置默认设置
   */
  async setDefaultConfiguration() {
    console.log("setDefaultConfiguration");
    this.configuration = {
      eventInterval: 5, //刷新事件间隔：分钟
      notificationTime: 5, //事件提醒时间设置:分钟
      defaultEventSize: 20, // 默认加载的事件数量
      defaultFontSize: 12, // 默认字体
    };
    await this.setStore("configuration", this.configuration);
  }
  /**
   * 发送通知
   * @param {*} title 消息标题
   * @param {*} message 消息正文
   * @param {*} sound 是否播放声音
   * @param {*} wait 是否等待用户反馈
   */
  notification(title, message, sound = false, wait = false) {
    notifier.notify({
      title: title,
      message: message,
      icon: path.join(
        __dirname,
        "../",
        "build/icons/Martz90-Circle-Calendar.512.png"
      ),
      sound: sound, // 是否播放声音
      wait: wait, // 是否等待用户反馈
    });
  }
  async Init() {
    log.info("Init ......");
    const gotTheLock = app.requestSingleInstanceLock(); // 单例锁，防止多开

    if (!gotTheLock) {
      app.quit(); // 如果未能获得锁，直接退出应用
      return;
    } else {
      app.on("second-instance", () => {
        // 当用户尝试启动第二个实例时，让现有窗口恢复
        if (this.win) {
          if (this.win.isMinimized()) {
            this.win.restore();
          }
          this.win.focus();
        }
      });
    }

    this.configuration = await this.getStore("configuration");

    if (this.configuration == null) {
      await this.setDefaultConfiguration();
    }

    this.createTray();
    this.onAppEvent();

    this.onRenderEvent();
    this.createHttpServer();
    this.setIntervalJob();
  }
}

const main = new MainProcess();
main.Init();
