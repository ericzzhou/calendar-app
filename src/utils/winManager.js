const { app, BrowserWindow, ipcMain, shell, screen } = require("electron");
class WindowManager {
  constructor() {
    this.window = null;
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
    this.window.on("closed", () => {
      this.window = null;
    });
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
    const yPos = 30; // 从屏幕顶部开始吸附

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
    return win;
  }
}

module.exports = new WindowManager();
