const $ = (selector) => document.querySelector(selector);

const overviewCards = $("#overviewCards");
const timeList = $("#timeList");
const projectList = $("#projectList");
const factList = $("#factList");
const sessionList = $("#sessionList");
const retrieveResult = $("#retrieveResult");
const queryInput = $("#queryInput");
const refreshBtn = $("#refreshBtn");
const retrieveBtn = $("#retrieveBtn");

function createCard(label, value) {
  const div = document.createElement("div");
  div.className = "card";
  div.innerHTML = `<div class="value">${value}</div><div class="label">${label}</div>`;
  return div;
}

function renderList(container, items, toLine) {
  container.innerHTML = "";
  if (!items || items.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "暂无数据";
    container.appendChild(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = toLine(item);
    container.appendChild(li);
  }
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }
  return response.json();
}

async function loadSnapshot() {
  const snapshot = await fetchJson("./api/snapshot?limit=20");
  const { overview } = snapshot;
  overviewCards.innerHTML = "";
  overviewCards.append(
    createCard("L0", overview.totalL0 ?? 0),
    createCard("L1", overview.totalL1 ?? 0),
    createCard("L2-Time", overview.totalL2Time ?? 0),
    createCard("L2-Project", overview.totalL2Project ?? 0),
    createCard("Facts", overview.totalFacts ?? 0),
  );

  renderList(timeList, snapshot.recentTimeIndexes, (item) => `${item.dateKey} | ${item.summary}`);
  renderList(projectList, snapshot.recentProjectIndexes, (item) => `${item.projectName} | ${item.currentStatus} | ${item.latestProgress}`);
  renderList(factList, snapshot.recentFacts, (item) => `${item.factKey}: ${item.factValue}`);
  renderList(sessionList, snapshot.recentSessions, (item) => `${item.timestamp} | ${item.sessionKey}`);
}

async function runRetrieve() {
  const query = queryInput.value.trim();
  if (!query) {
    retrieveResult.textContent = "请输入检索问题。";
    return;
  }
  retrieveResult.textContent = "检索中...";
  try {
    const payload = await fetchJson(`./api/retrieve?q=${encodeURIComponent(query)}&limit=6`);
    retrieveResult.textContent = payload.context || JSON.stringify(payload, null, 2);
  } catch (error) {
    retrieveResult.textContent = `检索失败: ${String(error)}`;
  }
}

refreshBtn?.addEventListener("click", () => {
  loadSnapshot().catch((error) => {
    retrieveResult.textContent = `刷新失败: ${String(error)}`;
  });
});

retrieveBtn?.addEventListener("click", () => {
  runRetrieve().catch((error) => {
    retrieveResult.textContent = `检索失败: ${String(error)}`;
  });
});

loadSnapshot().catch((error) => {
  retrieveResult.textContent = `加载失败: ${String(error)}`;
});
