const { app } = require("electron");
const path = require("path");
const log = require("electron-log");

class LogManager {
  constructor() {
    // 配置日志文件路径
     this.log = log.transports.file.file = path.join(
      app.getPath("userData"),
      "main.log"
    );
  }

  info(message) {
    log.info(message);
  }

  error(message) {
    log.error(message);
  }

  debug(message) {
    log.debug(message);
  }
}
module.exports = new LogManager();
