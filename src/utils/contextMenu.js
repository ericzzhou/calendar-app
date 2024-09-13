const { shell, Menu, clipboard } = require("electron");

// 创建右键菜单并复制会议链接
const createContextMenu = (eventLink) => {
  const menu = Menu.buildFromTemplate([
    {
      label: "打开会议",
      click: () => {
        shell.openExternal(eventLink);

        console.log(`会议已打开: ${eventLink}`);
      },
    },
    {
      label: "复制会议链接",
      click: () => {
        clipboard.writeText(eventLink); // 复制链接到剪贴板

        console.log(`会议链接已复制: ${eventLink}`);
      },
    },
  ]);

  menu.popup(); // 显示菜单
};

module.exports = createContextMenu;
