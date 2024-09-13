const { app, Tray, Menu } = require("electron");
const path = require("path");
const notification = require("./notification");
const storeManager = require("./storeManager");
const eventManager = require("./eventManager");

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
          mainWin.setMenuBarVisibility(true);
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
      label: "重置默认设置",
      click: () => {
        storeManager.setDefaultConfiguration();
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
