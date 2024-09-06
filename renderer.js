const { google } = require("googleapis");
const { ipcRenderer } = require("electron");

const CLIENT_ID =
  "356247018475-0hdovvr97o9beo47sjkn2e38eibl6epb.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const REDIRECT_URI = "http://localhost:12345"; // 使用本地重定向

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// 获取持久化的令牌
ipcRenderer.send("get-tokens");
ipcRenderer.on("tokens-retrieved", (event, tokens) => {
  if (tokens) {
    oauth2Client.setCredentials(tokens);
    listEvents();
  } else {
    // 用户未登录，显示授权按钮
    document.getElementById("authButton").style.display = "block";
  }
});

document.getElementById("authButton").addEventListener("click", () => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });

  ipcRenderer.send("open-auth-url", authUrl);
});

ipcRenderer.on("auth-code", async (event, code) => {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // 保存令牌
  ipcRenderer.send("save-tokens", tokens);
  listEvents();
});

async function listEvents() {
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: new Date().toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: "startTime",
  });

  const events = res.data.items;
  const eventList = document.getElementById("eventList");
  eventList.innerHTML = "";

  if (events.length) {
    ipcRenderer.send('calendar-events', events); // 发送事件到主进程
    events.forEach((event) => {
      const li = document.createElement("li");
      const start = event.start.dateTime || event.start.date;
      li.textContent = `${start}: ${event.summary}`;
      eventList.appendChild(li);
    });
  } else {
    const li = document.createElement("li");
    li.textContent = "No upcoming events found.";
    eventList.appendChild(li);
  }
}

function groupEventsByDate(events) {
  const groupedEvents = {
      today: [],
      tomorrow: [],
      upcoming: []
  };

  const now = new Date();
  const today = new Date(now.toDateString());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  events.forEach(event => {
      if (event.start && event.start.dateTime) {
          const eventStart = new Date(event.start.dateTime);

          if (eventStart.toDateString() === today.toDateString()) {
              groupedEvents.today.push(event);
          } else if (eventStart.toDateString() === tomorrow.toDateString()) {
              groupedEvents.tomorrow.push(event);
          } else {
              groupedEvents.upcoming.push({
                  date: `${eventStart.getMonth() + 1}月${eventStart.getDate()}号`,
                  events: [event]
              });
          }
      }
  });

  return groupedEvents;
}

// Example usage
function displayEvents(events) {
  const groupedEvents = groupEventsByDate(events);

  // Render grouped events in the UI
  renderGroupedEvents(groupedEvents);
}

setInterval(() => {
    listEvents();
}, 60 * 60 * 1000); // 每小时刷新一次事件