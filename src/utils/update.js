const path = require("path");
const { app, autoUpdater, dialog } = require("electron");
const log = require("electron-log");

// 配置日志文件路径
log.transports.file.file = path.join(app.getPath("userData"), "main.log");
const checkUpdate = (serverUrl) => {
  const feed = `${serverUrl}/update?platform=${
    process.platform
  }&version=${app.getVersion()}`;

  try {
    autoUpdater.setFeedURL(feed);

    setInterval(() => {
      autoUpdater.checkForUpdates();
    }, 60000 * 5); // 5分钟检查一次
  } catch (error) {
    this.notification("错误", "自动更新失败，请检查日志");
    log.error("autoUpdate");
    log.error(error);
  }

  autoUpdater.on("checking-for-update", () => {
    this.notification("更新", "正在检查程序更新");
    log.info("正在检查程序更新");
  });

  autoUpdater.on("update-available", () => {
    this.notification("更新", "发现新版本，正在下载");
    log.info("发现新版本，正在下载");
  });

  autoUpdater.on("update-not-available", () => {
    log.info("没有发现新版本 :(");
    this.notification("更新", "没有发现新版本 :(");
  });

  autoUpdater.on("error", (error) => {
    this.notification("更新", "自动更新失败，请检查日志");
    log.error("autoUpdate");
    log.error(error);
  });

  autoUpdater.on("update-downloaded", (event, notes, name, date) => {
    log.info("下载完成，正在安装");
    this.notification("更新", "下载完成，正在安装");

    log.info(`新版本名为${name}，发布于${date}`);
    this.notification("更新", `新版本名为${name}，发布于${date}`);

    log.info(`发行说明为：${notes}`);
    this.notification("更新", `发行说明为：${notes}`);

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
};

module.exports = checkUpdate;
