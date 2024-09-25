const { ipcRenderer } = require("electron");

class RenderProcess {
  constructor() {
    this.events = [];

    /**
     * google oauth token
     */
    this.googleOauthToken = null;

    this.configuration = {
      eventInterval: 5, // 刷新事件间隔分钟
      notificationTime: 10, //事件提醒时间，提前x分钟
      defaultEventSize: 20, // 默认加载的事件数量
      defaultFontSize: 12, // 默认字体
    };

    this.countdownJobId = null;
  }

  /**
   * 监听主线程消息
   */
  listeningMainEvent() {
    ipcRenderer.on("html", async (event, html) => {
      document.getElementById("eventList").innerHTML = html;
      this.updateEventTimes();
    });

    ipcRenderer.on("configuration", async (event, value) => {
      console.log("configuration", value);
      this.configuration = value;
    });

    ipcRenderer.on("appInfomation", async (event, appInfo) => {
      const { appName, appVersion, appUserData, appStorePath, appReleaseNote } =
        appInfo;

      const storePathEle = document.getElementById("store-path");
      storePathEle.addEventListener("click", (e) => {
        e.preventDefault();
        this.sendEventToMain("open-file", appStorePath);
      });

      const userDataEle = document.getElementById("user-data");
      userDataEle.addEventListener("click", (e) => {
        e.preventDefault();
        this.sendEventToMain("open-file", appUserData);
      });

      const versionEle = document.getElementById("version");
      versionEle.innerText = appVersion;
      versionEle.addEventListener("click", (e) => {
        e.preventDefault();
        //         const releaseNote = `
        //         - 响应式 flex 布局事件列表
        //         - 会议持续时间色值改为灰色
        //         - 视觉样式调整
        //         - 优化右键菜单，新增编辑日历、打开日历附件、复制参会人功能
        // `
        alert(appReleaseNote);
      });
    });

    ipcRenderer.on("download-progress", (event, dowloadTips) => {
      const dom = document.getElementById("download-progress");
      if (!dom) {
        return;
      }

      dom.style.display = "block";
      dom.innerHTML = dowloadTips;
    });

    ipcRenderer.on("usage-stats", (event, stats) => {
      const msg = `CPU使用率: ${stats.cpu}%, 内存使用率: ${stats.memory}%`;
      console.log(msg);
      document.getElementById("usage-stats").innerHTML = msg;
    });
  }

  // 向主线程发通知
  sendEventToMain(eventName, params) {
    ipcRenderer.send(eventName, params);
  }

  /**
   * 监听页面事件
   */
  listeningPageEvent() {
    const containerEle = document.getElementsByClassName("container")[0];
    containerEle.addEventListener("click", (e) => {
      console.log(`clicked:`);
      console.log(e.target);
      console.log(e.target.id);
      e.preventDefault();
      // 点击google授权按钮进行授权
      if (e.target.id === "authButton") {
        this.sendEventToMain("open-google-auth-url");
      }
    });

    containerEle.addEventListener("contextmenu", (e) => {
      e.preventDefault();

      // 使用 closest 确保捕获到正确的目标元素，防止点击到子元素导致问题
      const targetElement = e.target.closest(".event-container");
      if (targetElement) {
        document.querySelectorAll(".event-container").forEach((el) => {
          el.classList.remove("highlighted");
        });
        targetElement.classList.add("highlighted");

        console.log(`触发事件的元素${e.target}`, e);
        e.preventDefault();
        // const link = targetElement.dataset.link;
        const event = targetElement.dataset.event;
        this.sendEventToMain("show-context-menu", event);
      }
    });

    document.getElementById("github").addEventListener("click", (e) => {
      e.preventDefault();
      this.sendEventToMain(
        "open-file",
        "https://github.com/ericzzhou/calendar-app"
      );
    });

    // const eventsContainer = document.getElementById("eventList");
    // eventsContainer.addEventListener("contextmenu", (e) => {
    //   // 使用 closest 确保捕获到正确的目标元素，防止点击到子元素导致问题
    //   const targetElement = e.target.closest(".event-container");
    //   if (targetElement) {
    //     document.querySelectorAll(".event-container").forEach((el) => {
    //       el.classList.remove("highlighted");
    //     });
    //     targetElement.classList.add("highlighted");

    //     console.log(`触发事件的元素${e.target}`, e);
    //     e.preventDefault();
    //     const link = targetElement.dataset.link;
    //     this.sendEventToMain("show-context-menu", link);
    //   }
    // });
  }

  /**
   * 计算会议开始时间
   * @param {*} startTime
   * @returns
   */
  calculateTimeToStart(startTime) {
    if (!startTime || startTime.length < 1) {
      return "";
    }

    // 今天
    const today = new Date();
    const now = new Date();
    const eventTime = new Date(startTime);
    const timeDifference = eventTime - now;

    const isToday =
      eventTime.getDate() === today.getDate() &&
      eventTime.getMonth() === today.getMonth() &&
      eventTime.getFullYear() === today.getFullYear();

    if (!isToday) {
      return "下一个";
    }

    if (timeDifference <= 0) {
      return "现在";
    }

    const minutes = Math.floor(timeDifference / (1000 * 60)); // 转换为分钟
    if (minutes < 60) {
      return `${minutes} 分钟后`;
    } else {
      const hours = (minutes / 60).toFixed(1); // 转换为小时并保留一位小数
      return `${hours} 小时后`;
    }
  }

  updateEventTimes() {
    console.log("刷新时间倒计时提示");
    const eventContainers = document.querySelectorAll(".event-con");

    let index = 0;
    eventContainers.forEach((eventEle) => {
      index++;

      const startTime = eventEle.dataset.starttime;
      const timeToStartElement = eventEle.querySelector(".time-to-start");
      const timeToStart = this.calculateTimeToStart(startTime);
      timeToStartElement.textContent = timeToStart;

      if (index <= 1) {
        timeToStartElement.style.display = "inline";
        return;
      }
    });
  }

  init() {
    this.listeningPageEvent();
    this.listeningMainEvent();

    this.countdownJobId = setInterval(() => {
      this.updateEventTimes();
    }, 1000 * 60); // 每分钟更新一次
  }
}

window.addEventListener("DOMContentLoaded", () => {
  console.log("DOMContentLoaded");
  const render = new RenderProcess();
  render.init();
});
