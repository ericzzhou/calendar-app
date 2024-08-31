const { app, BrowserWindow, ipcMain, shell, screen } = require("electron");
class WindowManager {
  constructor() {
    this.window = null;
    this.mainWin = null;
    this.dotWin = null;
  }

  createWindow() {
    this.window = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: true,
      },
    });
    this.window.loadFile("index.html");
    // this.window.on("closed", () => {
    //   this.window = null;
    // });
  }

  async createDotWin(preload, filepath) {
    const dotWin = new BrowserWindow({
      width: 50,
      height: 50,
      x: screen.getPrimaryDisplay().workAreaSize.width - 60, // 位置靠近右上角
      y: 10,
      frame: false, // 无边框窗口
      alwaysOnTop: true, // 始终置顶
      transparent: true,
      show: false, // 初始不显示
      webPreferences: {
        preload: preload, // ���保能与����进程通��
        nodeIntegration: true,
        contextIsolation: false, // ���保可以正常使用 DOM ��问
      },
    });

    dotWin.setMenuBarVisibility(false);
    await dotWin.loadFile(filepath);

    ipcMain.on("open-main-window", () => {
      dotWin.hide();
      this.mainWin.show();
    });

    this.dotWin = dotWin;
    return dotWin;
  }
  /**
   * 处理日历事件
   * @param {*} events
   * @returns
   */
  async createMainWin(preload, filepath) {
    // 获取主屏幕的尺寸
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    // 将窗口吸附到屏幕的右侧
    const windowWidth = 300; // 假设窗口宽度是 800
    const windowHeight = 800;
    const xPos = width - windowWidth; // 计算窗口的 x 坐标，使其靠右侧
    const yPos = height - windowHeight; // 从屏幕顶部开始吸附

    const win = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: xPos,
      y: yPos,
      alwaysOnTop: true, // 使窗口始终在其他窗口之上
      webPreferences: {
        preload: preload, // 确保能与渲染进程通讯
        nodeIntegration: true,
        contextIsolation: false, // 确保可以正常使用 DOM 访问
      },
    });

    win.setMenuBarVisibility(false);
    await win.loadFile(filepath);

    // logManager.info("init mainWin event : minimize ......");
    // 当窗口最小化时隐藏到托盘
    win.on("minimize", (event) => {
      console.log("window.on minimize");
      event.preventDefault();
      win.hide(); // 最小化时隐藏到系统托盘
      // this.dotWin.show();
    });

    // 窗口展示时隐藏dotwin
    win.on("show", () => {
      console.log("window.on show");
      // this.dotWin.hide();
    });

    win.on("close", (event) => {
      event.preventDefault();
      if (win && !win.isDestroyed()) {
        win.hide();
      }
    });

    // win.on("move", () => {
    //   const bounds = win.getBounds();
    //   const screenBounds = screen.getPrimaryDisplay().workAreaSize;

    //   // 判断是否贴近屏幕边缘
    //   const edgeThreshold = 10;
    //   if (
    //     bounds.x <= edgeThreshold ||
    //     bounds.y <= edgeThreshold ||
    //     bounds.x + bounds.width >= screenBounds.width - edgeThreshold ||
    //     bounds.y + bounds.height >= screenBounds.height - edgeThreshold
    //   ) {
    //     win.hide();
    //     this.dotWin.show();
    //   }
    // });
    this.mainWin = win;
    return win;
  }
}

module.exports = new WindowManager();
