const { app, Tray, Menu ,dialog} = require("electron");
const path = require("path");
const notification = require("./notification");
const storeManager = require("./storeManager");
const eventManager = require("./eventManager");
const checkUpdate = require("./update");
const { convertBytesPerSecond } = require("./utils");
const logManager = require("./logManager");

let menuBarVisibility = false;
/***
 * 创建并返回系统托盘对象
 */
const createTray = (mainWin) => {
  const iconPath = path.join(
    __dirname,
    "../../",
    "build/icons/Martz90-Circle-Calendar.512.png"
  ); // 你自己的托盘图标路径

  const tray = new Tray(iconPath);

  // 双击托盘图标时显示主窗口
  tray.on("double-click", () => {
    if (mainWin) {
      mainWin.show();
    }
  });

  // 创建托盘菜单
  const trayMenu = Menu.buildFromTemplate([
    {
      label: "显示",
      click: () => {
        if (mainWin) {
          mainWin.show();
        }
      },
    },
    {
      label: "刷新日历数据",
      click: () => {
        if (mainWin) {
          console.log("refresh");
          eventManager.buildEventsHtml().then((eventsHtml) => {
            mainWin.webContents.send("html", eventsHtml);
          });
        }
      },
    },
    {
      label: "显示系统菜单",
      click: () => {
        if (mainWin) {
          menuBarVisibility = !menuBarVisibility;
          mainWin.setMenuBarVisibility(menuBarVisibility);
        }
      },
    },
    {
      label: "测试通知",
      click: () => {
        notification("通知标题", "通知正文", false, true);
      },
    },
    {
      label: "测试Dialog",
      click: () => {
        dialog.showMessageBox({
          type: "info",
          title: "会议即将开始",
          message: "会议 xxxx 即将在 10 分钟后开始",
          buttons: [],
          detail:"请提前准备"
        });
      },
    },
    {
      label: "重置默认设置",
      click: () => {
        storeManager.setDefaultConfiguration();
      },
    },
    {
      label: "检查更新",
      click: () => {
        try {
          checkUpdate("", (progressObj) => {
            const speedFormat = convertBytesPerSecond(
              progressObj.bytesPerSecond
            );

            const dowloadTips = `新版本：已下载 ${Number(
              progressObj.percent
            ).toFixed(2)}%，Speed：${speedFormat}`;
            mainWin.webContents.send(
              "download-progress",
              dowloadTips
            );
          });
        } catch (error) {
          logManager.error("检查更新失败");
          logManager.error(error);
        }
      },
    },
    {
      label: "完全退出",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip("日程提醒");
  tray.setContextMenu(trayMenu);

  return tray;
};

module.exports = createTray;
