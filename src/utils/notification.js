const { dialog } = require("electron");
const notifier = require("node-notifier");
const path = require("path");

/**
 * 发送通知
 * @param {*} title 消息标题
 * @param {*} message 消息正文
 * @param {*} sound 是否播放声音
 * @param {*} wait 是否等待用户反馈
 */
const notification = (title, message, sound = false, wait = false) => {
  const storeManager = require("./storeManager");
  storeManager.getConfiguration().then((conf) => {
    if (conf && conf.storeReminder === true) {
      dialog.showMessageBox({
        type: "info",
        title: title,
        message: message,
        buttons: []
      });
    } else {
      notifier.notify(
        {
          title: title,
          message: message,
          icon: path.join(
            __dirname,
            "../../",
            "build/icons/Martz90-Circle-Calendar.512.png"
          ),
          sound: sound, // 是否播放声音
          wait: wait, // 是否等待用户反馈
          appID: "Calendar-app" // 直接在这里设置 appID
        },
        function(error, response) {
          console.log(error, response);
        }
      );
    }
  });
};

module.exports = notification;
