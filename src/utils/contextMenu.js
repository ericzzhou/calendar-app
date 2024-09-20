const { shell, Menu, clipboard } = require("electron");
const notification = require("./notification");

// 创建右键菜单并复制会议链接
const createContextMenu = (event) => {
  // console.log(event);
  const { hangoutLink, attendees, htmlLink, attachments } = JSON.parse(event);
  const menu = Menu.buildFromTemplate([
    {
      label: "打开会议",
      click: () => {
        shell.openExternal(hangoutLink);

        console.log(`会议已打开: ${hangoutLink}`);
      },
    },
    {
      label: "复制会议链接",
      click: () => {
        clipboard.writeText(hangoutLink); // 复制链接到剪贴板

        console.log(`会议链接已复制: ${hangoutLink}`);
      },
    },
    {
      label: "打开谷歌日历",
      click: () => {
        shell.openExternal("https://calendar.google.com/calendar/u/0/r/month");
      },
    },
    {
      label: "复制参会人到剪贴板",
      click: () => {
        const emailString = attendees
          .map((attendee) => `- ${attendee.email}`)
          .join("\r\n");
        clipboard.writeText(emailString); // 复制链接到剪贴板
      },
    },
    {
      label: "编辑日历",
      click: () => {
        shell.openExternal(htmlLink);
      },
    },
    {
      label: "打开日历附件",
      click: () => {
        if (!attachments || attachments.length <= 0) {
          notification("打开失败", "该会议没有附件", false, false);
          return;
        }
        const atts = attachments.filter(
          (attachment) => attachment.fileUrl && attachment.fileUrl.trim()
        );

        const fileUrl = atts.length > 0 ? atts[0].fileUrl : null;
        if (fileUrl) {
          shell.openExternal(fileUrl);
        } else {
          notification("打开失败", "该会议没有附件", false, false);
        }
      },
    },
  ]);

  menu.popup(); // 显示菜单
};

module.exports = createContextMenu;
