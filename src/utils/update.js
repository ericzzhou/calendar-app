const path = require("path");
const { app, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const logManager = require("./logManager");
const notification = require("./notification");

const log = require("electron-log");

// 配置日志文件路径
log.transports.file.file = path.join(app.getPath("userData"), "main.log");
log.transports.file.level = "debug";
autoUpdater.logger = log;

const checkForUpdates = async () => {
  logManager.info("检查更新");
  // autoUpdater.checkForUpdates();
  autoUpdater.checkForUpdatesAndNotify();
};
const checkUpdate = (serverUrl, callback) => {
  try {
    // autoUpdater.setFeedURL(feed);
    checkForUpdates();
    setInterval(async () => {
      checkForUpdates();
    }, 1000 * 60 * 60); // 60分钟检查一次
  } catch (error) {
    notification("错误", "自动更新失败，请检查日志");
    logManager.error("autoUpdate");
    logManager.error(error);
  }

  autoUpdater.on("checking-for-update", () => {
    // notification("更新", "正在检查程序更新");
    logManager.info("正在检查程序更新");
  });

  autoUpdater.on("update-available", () => {
    notification("更新", "发现新版本，正在下载");
    logManager.info("发现新版本，正在下载");
  });

  autoUpdater.on("update-not-available", () => {
    logManager.info("没有发现新版本 :(");
    // notification("更新", "没有发现新版本 :(");
  });

  autoUpdater.on("error", (error) => {
    notification("更新", "自动更新失败，请检查日志");
    logManager.error("autoUpdate");
    logManager.error(error);
  });

  autoUpdater.on("update-downloaded", (event, notes, name, date) => {
    logManager.info("下载完成，正在安装");
    logManager.info(`新版本名为${name}，发布于${date}`);
    logManager.info(`发行说明为：${notes}`);

    // notification("更新", "下载完成，正在安装");

    const dialogOpts = {
      type: "info",
      buttons: ["重启", "稍后"],
      title: "应用更新",
      message: process.platform === "win32" ? notes : name,
      detail: "一个新版本已经准备就绪，是否现在重启应用？",
    };

    dialog.showMessageBox(dialogOpts).then((returnValue) => {
      if (returnValue.response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on("download-progress", (progressObj) => {
    if (callback && typeof callback === "function") {
      callback(progressObj);
    }

    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + " - Downloaded " + progressObj.percent + "%";
    log_message =
      log_message +
      " (" +
      progressObj.transferred +
      "/" +
      progressObj.total +
      ")";
    logManager.info(log_message);
    // sendStatusToWindow(log_message);
  });
};

module.exports = checkUpdate;
