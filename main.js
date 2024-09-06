const { app, BrowserWindow, ipcMain, shell } = require('electron');
const http = require('http');
const url = require('url');
const schedule = require('node-schedule');
const { Notification } = require('electron');

let Store; // 延迟加载
let win;

async function createWindow() {
    win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('index.html');

    // 动态导入 electron-store
    Store = (await import('electron-store')).default;
    const store = new Store(); // 初始化 store
    console.log('Store loaded:', store.path); // 打印存储路径，确保加载成功

    ipcMain.on('save-tokens', (event, tokens) => {
        store.set('oauthTokens', tokens);
        console.log('Tokens saved successfully');
    });

    ipcMain.on('get-tokens', (event) => {
        const tokens = store.get('oauthTokens');
        event.reply('tokens-retrieved', tokens);
    });
}

ipcMain.on('open-auth-url', (event, authUrl) => {
    shell.openExternal(authUrl);

    const server = http.createServer((req, res) => {
        const queryObject = url.parse(req.url, true).query;
        if (queryObject.code) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Authorization successful! You can close this window.');

            win.webContents.send('auth-code', queryObject.code);
            server.close();
        }
    }).listen(12345, () => {
        console.log('Server listening on port 12345');
    });
    
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});


function scheduleNotification(event) {
  const eventStartTime = new Date(event.start.dateTime); // 假设 event.start.dateTime 是 ISO 时间格式
  const notificationTime = new Date(eventStartTime.getTime() - 10 * 60000); // 提前10分钟提醒

  schedule.scheduleJob(notificationTime, () => {
      const notification = new Notification({
          title: '会议提醒',
          body: `您的会议 "${event.summary}" 将在10分钟后开始。`,
      });
      notification.show();
  });

  console.log(`提醒已设置: ${event.summary} at ${notificationTime}`);
}


function processEvents(events) {
  events.forEach(event => {
      if (event.start && event.start.dateTime) {
          scheduleNotification(event); // 为每个事件设置提醒
      }
  });
}

// 从 Google Calendar 获取事件后调用 processEvents
ipcMain.on('calendar-events', (event, events) => {
  processEvents(events);
});
