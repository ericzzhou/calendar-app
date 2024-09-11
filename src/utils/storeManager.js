const fs = require("fs");
const notification = require("./notification");
const logManager = require("./logManager");

let Store;

_defaultConfiguration = {
  eventInterval: 5, // 刷新事件间隔分钟
  notificationTime: 10, //事件提醒时间，提前x分钟
  defaultEventSize: 20, // 默认加载的事件数量
  defaultFontSize: 12, // 默认字体
  serverUrl:"http://10.30.110.206:5432"
};

class StoreManager {
  constructor() {
    this.store = null;
    this.configuration = _defaultConfiguration;
  }

  /**
   * 获取配置
   * @param {*} key
   * @returns
   */
  async getStoreByKey(key) {
    if (!this.store) {
      // 动态导入 electron-store
      Store = (await import("electron-store")).default;
      this.store = new Store(); // 初始化 store
      // console.log("Store loaded:", this.store.path); // 打印存储路径，确保加载成功
    }
    return this.store.get(key);
  }

  /**
   * 获取系统配置，如果store里没有，则会返回默认配置
   * @returns
   */
  async getConfiguration() {
    const configuration = await this.getStoreByKey("configuration");
    if (configuration == null) {
      configuration = _defaultConfiguration;
      await this.setDefaultConfiguration();
    }
    return configuration;
  }

  /**
   * set 配置
   * @param {*} name
   * @param {*} value
   */
  async setStore(name, value) {
    if (!this.store) {
      // 动态导入 electron-store
      Store = (await import("electron-store")).default;
      this.store = new Store(); // 初始化 store
      // console.log("Store loaded:", this.store.path); // 打印存储路径，确保加载成功
    }

    this.store.set(name, value);
    console.log("Store set:", name, "=", value);
  }

  /**
   * 重置默认设置
   */
  async setDefaultConfiguration() {
    console.log("setDefaultConfiguration");
    this.configuration = _defaultConfiguration;
    await this.setStore("configuration", this.configuration);
    return _defaultConfiguration;
  }
  /**
   * 检测store配置文件修改
   */
  async watchStoreChanged(callback) {
    if (!this.store) {
      // 动态导入 electron-store
      Store = (await import("electron-store")).default;
      this.store = new Store(); // 初始化 store
      // console.log("Store loaded:", this.store.path); // 打印存储路径，确保加载成功
    }

    logManager.info("watching: 开始监控配置文件变化");
    fs.watchFile(this.store.path, async (curr, prev) => {
      logManager.info("watching: store changed");
      if (curr.mtime === prev.mtime) {
        logManager.info("watching: store changed but no change");
        return;
      }

      // 配置文件发生变化，提醒用户重启应用
      notification(
        "配置文件修改",
        "配置文件已修改，将会自动重启应用以加载新配置。"
      );

      const newConf = await this.getConfiguration();
      // logManager.info("newConf");
      // logManager.info(newConf);
      if (newConf == null) {
        newConf = await this.setDefaultConfiguration();
      }

      //   this.win.webContents.send("configuration", newConf);
      // logManager.info("watching: win.webContents.send configuration", newConf);
      // return newConf;
      if (callback) {
        callback(newConf);
      }
    });
  }

  async getStorePath() {
    if (!this.store) {
      // 动态导入 electron-store
      Store = (await import("electron-store")).default;
      this.store = new Store(); // 初始化 store
      // console.log("Store loaded:", this.store.path); // 打印存储路径，确保加载成功
    }

    return this.store.path;
  }
}

module.exports = new StoreManager();
