const $ = (selector) => document.querySelector(selector);

const overviewCards = $("#overviewCards");
const levelTabs = $("#levelTabs");
const listHint = $("#listHint");
const listQueryInput = $("#listQueryInput");
const listSearchBtn = $("#listSearchBtn");
const entryList = $("#entryList");
const detailTitle = $("#detailTitle");
const detailMeta = $("#detailMeta");
const detailBody = $("#detailBody");

const queryInput = $("#queryInput");
const retrieveBtn = $("#retrieveBtn");
const retrieveSummary = $("#retrieveSummary");
const retrieveResult = $("#retrieveResult");
const refreshBtn = $("#refreshBtn");

const LEVEL_CONFIG = {
  l2_time: {
    label: "L2 时间索引",
    endpoint: "./api/l2/time",
    emptyText: "暂无 L2 时间索引",
  },
  l2_project: {
    label: "L2 项目索引",
    endpoint: "./api/l2/project",
    emptyText: "暂无 L2 项目索引",
  },
  l1: {
    label: "L1 窗口索引",
    endpoint: "./api/l1",
    emptyText: "暂无 L1 窗口索引",
  },
  l0: {
    label: "L0 会话索引",
    endpoint: "./api/l0",
    emptyText: "暂无 L0 会话",
  },
  facts: {
    label: "动态事实",
    endpoint: "./api/facts",
    emptyText: "暂无事实画像",
  },
};

const state = {
  activeLevel: "l2_time",
  baseRaw: {
    l2_time: [],
    l2_project: [],
    l1: [],
    l0: [],
    facts: [],
  },
  baseItems: {
    l2_time: [],
    l2_project: [],
    l1: [],
    l0: [],
    facts: [],
  },
  visibleItems: [],
  selectedIndex: -1,
};

function shortText(value, max = 120) {
  if (!value) return "";
  const text = String(value).trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function formatTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

function createMetricCard(label, value, note) {
  const card = document.createElement("div");
  card.className = "card";

  const valueNode = document.createElement("div");
  valueNode.className = "value";
  valueNode.textContent = String(value ?? 0);

  const labelNode = document.createElement("div");
  labelNode.className = "label";
  labelNode.textContent = label;

  const noteNode = document.createElement("div");
  noteNode.className = "note";
  noteNode.textContent = note;

  card.append(valueNode, labelNode, noteNode);
  return card;
}

function renderOverview(overview = {}) {
  overviewCards.innerHTML = "";
  overviewCards.append(
    createMetricCard("L0 会话", overview.totalL0 ?? 0, "原始会话消息"),
    createMetricCard("L1 窗口", overview.totalL1 ?? 0, "中层摘要窗口"),
    createMetricCard("L2 时间", overview.totalL2Time ?? 0, "按日期聚合"),
    createMetricCard("L2 项目", overview.totalL2Project ?? 0, "按项目聚合"),
    createMetricCard("事实", overview.totalFacts ?? 0, overview.lastIndexedAt ? `更新于 ${formatTime(overview.lastIndexedAt)}` : "等待索引"),
  );
}

function getRawId(level, raw) {
  if (!raw) return "";
  if (level === "l2_time") return raw.l2IndexId || raw.dateKey;
  if (level === "l2_project") return raw.l2IndexId || raw.projectName;
  if (level === "l1") return raw.l1IndexId || raw.timePeriod;
  if (level === "l0") return raw.l0IndexId || raw.sessionKey;
  if (level === "facts") return raw.factId || raw.factKey;
  return "";
}

function normalizeEntry(level, raw) {
  if (!raw) return null;

  if (level === "l2_time") {
    return {
      level,
      id: getRawId(level, raw),
      title: raw.dateKey || "未命名日期",
      subtitle: raw.summary || "暂无摘要",
      meta: `关联 L1: ${raw.l1Source?.length ?? 0}`,
      raw,
    };
  }
  if (level === "l2_project") {
    return {
      level,
      id: getRawId(level, raw),
      title: raw.projectName || "未命名项目",
      subtitle: raw.latestProgress || raw.summary || "暂无进展",
      meta: raw.currentStatus || "状态未知",
      raw,
    };
  }
  if (level === "l1") {
    return {
      level,
      id: getRawId(level, raw),
      title: raw.timePeriod || "L1 窗口",
      subtitle: raw.summary || "暂无摘要",
      meta: `facts ${raw.facts?.length ?? 0} · source ${raw.l0Source?.length ?? 0}`,
      raw,
    };
  }
  if (level === "l0") {
    const firstMessage = raw.messages?.[0]?.content || "";
    return {
      level,
      id: getRawId(level, raw),
      title: raw.sessionKey || "未命名会话",
      subtitle: shortText(firstMessage, 80) || "无会话内容",
      meta: formatTime(raw.timestamp),
      raw,
    };
  }
  if (level === "facts") {
    return {
      level,
      id: getRawId(level, raw),
      title: raw.factKey || "未命名事实",
      subtitle: raw.factValue || "暂无内容",
      meta: `置信度 ${(Number(raw.confidence || 0) * 100).toFixed(0)}%`,
      raw,
    };
  }
  return null;
}

function toEntries(level, records = []) {
  return records
    .map((record) => normalizeEntry(level, record))
    .filter(Boolean);
}

function setBaseLevelData(level, records = []) {
  state.baseRaw[level] = Array.isArray(records) ? records : [];
  state.baseItems[level] = toEntries(level, state.baseRaw[level]);
}

function mergeBaseLevelData(level, records = []) {
  if (!Array.isArray(records) || records.length === 0) return;
  const merged = [];
  const seen = new Set();
  for (const record of [...records, ...state.baseRaw[level]]) {
    const key = getRawId(level, record);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(record);
  }
  setBaseLevelData(level, merged);
}

function setVisibleItems(items) {
  state.visibleItems = Array.isArray(items) ? items : [];
  state.selectedIndex = state.visibleItems.length > 0 ? 0 : -1;
  renderEntryList();
  renderDetail();
  renderListHint();
}

function renderListHint(extra = "") {
  const levelLabel = LEVEL_CONFIG[state.activeLevel].label;
  const count = state.visibleItems.length;
  listHint.textContent = `${levelLabel} · ${count} 条${extra ? ` · ${extra}` : ""}`;
}

function renderEntryList() {
  entryList.innerHTML = "";
  if (state.visibleItems.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = LEVEL_CONFIG[state.activeLevel].emptyText;
    entryList.appendChild(empty);
    return;
  }

  state.visibleItems.forEach((item, index) => {
    const li = document.createElement("li");

    const button = document.createElement("button");
    button.type = "button";
    button.className = `entry-card${index === state.selectedIndex ? " active" : ""}`;
    button.dataset.index = String(index);

    const title = document.createElement("div");
    title.className = "entry-title";
    title.textContent = item.title;

    const subtitle = document.createElement("div");
    subtitle.className = "entry-subtitle";
    subtitle.textContent = shortText(item.subtitle, 120);

    const meta = document.createElement("div");
    meta.className = "entry-meta";
    meta.textContent = item.meta;

    button.append(title, subtitle, meta);
    li.appendChild(button);
    entryList.appendChild(li);
  });
}

function createMetaItem(label, value) {
  const node = document.createElement("div");
  node.className = "meta-item";

  const key = document.createElement("span");
  key.className = "meta-label";
  key.textContent = label;

  const val = document.createElement("span");
  val.className = "meta-value";
  val.textContent = value;

  node.append(key, val);
  return node;
}

function appendSection(titleText, contentText) {
  const section = document.createElement("section");
  section.className = "detail-section";

  const title = document.createElement("h4");
  title.textContent = titleText;

  const content = document.createElement("p");
  content.textContent = contentText || "-";

  section.append(title, content);
  detailBody.appendChild(section);
}

function appendTagSection(titleText, tags = []) {
  const section = document.createElement("section");
  section.className = "detail-section";

  const title = document.createElement("h4");
  title.textContent = titleText;

  const tagList = document.createElement("div");
  tagList.className = "tag-list";
  if (!Array.isArray(tags) || tags.length === 0) {
    const empty = document.createElement("span");
    empty.className = "muted";
    empty.textContent = "无";
    tagList.appendChild(empty);
  } else {
    tags.forEach((tag) => {
      const tagNode = document.createElement("span");
      tagNode.className = "tag";
      tagNode.textContent = String(tag);
      tagList.appendChild(tagNode);
    });
  }

  section.append(title, tagList);
  detailBody.appendChild(section);
}

function appendFactsSection(facts = []) {
  const section = document.createElement("section");
  section.className = "detail-section";

  const title = document.createElement("h4");
  title.textContent = "提取事实";
  section.appendChild(title);

  if (!Array.isArray(facts) || facts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "无";
    section.appendChild(empty);
    detailBody.appendChild(section);
    return;
  }

  const list = document.createElement("ul");
  list.className = "mini-list";
  facts.forEach((fact) => {
    const item = document.createElement("li");
    const confidence = Number(fact.confidence || 0);
    item.textContent = `${fact.factKey}: ${fact.factValue}（${(confidence * 100).toFixed(0)}%）`;
    list.appendChild(item);
  });
  section.appendChild(list);
  detailBody.appendChild(section);
}

function appendMessagesSection(messages = []) {
  const section = document.createElement("section");
  section.className = "detail-section";

  const title = document.createElement("h4");
  title.textContent = "会话消息";
  section.appendChild(title);

  if (!Array.isArray(messages) || messages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "无消息";
    section.appendChild(empty);
    detailBody.appendChild(section);
    return;
  }

  const list = document.createElement("div");
  list.className = "message-list";
  messages.forEach((msg) => {
    const line = document.createElement("div");
    line.className = "message-item";

    const role = document.createElement("span");
    role.className = "message-role";
    role.textContent = msg.role || "unknown";

    const content = document.createElement("span");
    content.className = "message-content";
    content.textContent = msg.content || "";

    line.append(role, content);
    list.appendChild(line);
  });
  section.appendChild(list);
  detailBody.appendChild(section);
}

function renderDetail() {
  detailMeta.innerHTML = "";
  detailBody.innerHTML = "";

  const selected = state.visibleItems[state.selectedIndex];
  if (!selected) {
    detailTitle.textContent = "请选择条目";
    appendSection("说明", "左侧点击任意条目，即可查看详细字段。");
    return;
  }

  const raw = selected.raw;
  detailTitle.textContent = selected.title;

  if (selected.level === "l2_time") {
    detailMeta.append(
      createMetaItem("层级", "L2 时间"),
      createMetaItem("索引ID", raw.l2IndexId || "-"),
      createMetaItem("日期", raw.dateKey || "-"),
      createMetaItem("更新时间", formatTime(raw.updatedAt)),
    );
    appendSection("摘要", raw.summary || "-");
    appendTagSection("关联 L1 IDs", raw.l1Source || []);
    return;
  }

  if (selected.level === "l2_project") {
    detailMeta.append(
      createMetaItem("层级", "L2 项目"),
      createMetaItem("索引ID", raw.l2IndexId || "-"),
      createMetaItem("项目名", raw.projectName || "-"),
      createMetaItem("状态", raw.currentStatus || "-"),
    );
    appendSection("最新进展", raw.latestProgress || "-");
    appendSection("项目摘要", raw.summary || "-");
    appendTagSection("关联 L1 IDs", raw.l1Source || []);
    return;
  }

  if (selected.level === "l1") {
    detailMeta.append(
      createMetaItem("层级", "L1 窗口"),
      createMetaItem("索引ID", raw.l1IndexId || "-"),
      createMetaItem("时间段", raw.timePeriod || "-"),
      createMetaItem("创建时间", formatTime(raw.createdAt)),
    );
    appendSection("窗口摘要", raw.summary || "-");
    appendSection("时间信息", raw.situationTimeInfo || "-");
    appendTagSection("项目标签", raw.projectTags || []);
    appendFactsSection(raw.facts || []);
    appendTagSection("关联 L0 IDs", raw.l0Source || []);
    return;
  }

  if (selected.level === "l0") {
    detailMeta.append(
      createMetaItem("层级", "L0 会话"),
      createMetaItem("索引ID", raw.l0IndexId || "-"),
      createMetaItem("会话键", raw.sessionKey || "-"),
      createMetaItem("会话时间", formatTime(raw.timestamp)),
    );
    appendSection("来源", raw.source || "-");
    appendSection("是否已索引", raw.indexed ? "是" : "否");
    appendMessagesSection(raw.messages || []);
    return;
  }

  if (selected.level === "facts") {
    detailMeta.append(
      createMetaItem("层级", "事实"),
      createMetaItem("事实ID", raw.factId || "-"),
      createMetaItem("事实键", raw.factKey || "-"),
      createMetaItem("更新时间", formatTime(raw.updatedAt)),
    );
    appendSection("事实值", raw.factValue || "-");
    appendSection("置信度", `${(Number(raw.confidence || 0) * 100).toFixed(0)}%`);
    appendSection("来源 L1", raw.sourceL1Id || "-");
  }
}

function switchLevel(nextLevel) {
  if (!LEVEL_CONFIG[nextLevel]) return;
  state.activeLevel = nextLevel;
  listQueryInput.value = "";

  levelTabs?.querySelectorAll(".tab").forEach((tab) => {
    const isActive = tab.dataset.level === nextLevel;
    tab.classList.toggle("active", isActive);
  });

  setVisibleItems(state.baseItems[nextLevel] || []);
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }
  return response.json();
}

function extractSeedQueries(snapshot) {
  const values = [];
  for (const project of snapshot.recentProjectIndexes || []) {
    if (project.projectName) values.push(project.projectName);
    if (project.currentStatus) values.push(project.currentStatus);
  }
  for (const time of snapshot.recentTimeIndexes || []) {
    if (time.summary) values.push(shortText(time.summary, 20));
  }
  for (const fact of snapshot.recentFacts || []) {
    if (fact.factKey) values.push(fact.factKey);
  }

  const unique = [];
  const seen = new Set();
  values
    .map((value) => String(value).trim())
    .filter((value) => value.length >= 2)
    .forEach((value) => {
      if (seen.has(value)) return;
      seen.add(value);
      unique.push(value);
    });

  return unique.slice(0, 8);
}

async function bootstrapL1(snapshot) {
  const queries = extractSeedQueries(snapshot);
  if (queries.length === 0) return [];

  const merged = [];
  const seen = new Set();
  for (const query of queries) {
    try {
      const hits = await fetchJson(`./api/l1?q=${encodeURIComponent(query)}&limit=10`);
      for (const hit of hits || []) {
        const key = getRawId("l1", hit);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        merged.push(hit);
      }
    } catch {
      // ignore per-query failures
    }
  }
  return merged;
}

async function loadSnapshot() {
  const snapshot = await fetchJson("./api/snapshot?limit=30");
  renderOverview(snapshot.overview);

  setBaseLevelData("l2_time", snapshot.recentTimeIndexes || []);
  setBaseLevelData("l2_project", snapshot.recentProjectIndexes || []);
  setBaseLevelData("l0", snapshot.recentSessions || []);
  setBaseLevelData("facts", snapshot.recentFacts || []);

  const l1Bootstrap = await bootstrapL1(snapshot);
  setBaseLevelData("l1", l1Bootstrap);

  switchLevel(state.activeLevel);
}

async function searchCurrentLevel() {
  const query = listQueryInput.value.trim();
  if (!query) {
    setVisibleItems(state.baseItems[state.activeLevel] || []);
    return;
  }

  const { endpoint } = LEVEL_CONFIG[state.activeLevel];
  const payload = await fetchJson(`${endpoint}?q=${encodeURIComponent(query)}&limit=30`);
  const records = state.activeLevel.startsWith("l2")
    ? (payload || []).map((hit) => hit.item || hit)
    : payload || [];
  const entries = toEntries(state.activeLevel, records);
  setVisibleItems(entries);
  renderListHint(`关键词: ${query}`);
}

async function runRetrieve() {
  const query = queryInput.value.trim();
  if (!query) {
    retrieveSummary.textContent = "请输入检索问题。";
    retrieveResult.textContent = "";
    return;
  }

  retrieveSummary.textContent = "检索中...";
  retrieveResult.textContent = "";

  const payload = await fetchJson(`./api/retrieve?q=${encodeURIComponent(query)}&limit=8`);
  const l2Time = [];
  const l2Project = [];
  for (const hit of payload.l2Results || []) {
    if (hit.level === "l2_time") l2Time.push(hit.item);
    if (hit.level === "l2_project") l2Project.push(hit.item);
  }

  const l1 = (payload.l1Results || []).map((hit) => hit.item).filter(Boolean);
  const l0 = (payload.l0Results || []).map((hit) => hit.item).filter(Boolean);

  mergeBaseLevelData("l2_time", l2Time);
  mergeBaseLevelData("l2_project", l2Project);
  mergeBaseLevelData("l1", l1);
  mergeBaseLevelData("l0", l0);

  if (!listQueryInput.value.trim()) {
    setVisibleItems(state.baseItems[state.activeLevel] || []);
  }

  retrieveSummary.textContent = `intent: ${payload.intent} · enoughAt: ${payload.enoughAt} · L2(${payload.l2Results?.length || 0}) / L1(${payload.l1Results?.length || 0}) / L0(${payload.l0Results?.length || 0})`;
  retrieveResult.textContent = payload.context || JSON.stringify(payload, null, 2);
}

levelTabs?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const level = target.dataset.level;
  if (!level) return;
  switchLevel(level);
});

entryList?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const card = target.closest(".entry-card");
  if (!(card instanceof HTMLButtonElement)) return;
  const index = Number.parseInt(card.dataset.index || "-1", 10);
  if (!Number.isInteger(index) || index < 0 || index >= state.visibleItems.length) return;
  state.selectedIndex = index;
  renderEntryList();
  renderDetail();
});

listSearchBtn?.addEventListener("click", () => {
  searchCurrentLevel().catch((error) => {
    renderListHint(`查询失败: ${String(error)}`);
  });
});

listQueryInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  searchCurrentLevel().catch((error) => {
    renderListHint(`查询失败: ${String(error)}`);
  });
});

retrieveBtn?.addEventListener("click", () => {
  runRetrieve().catch((error) => {
    retrieveSummary.textContent = `检索失败: ${String(error)}`;
  });
});

queryInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  runRetrieve().catch((error) => {
    retrieveSummary.textContent = `检索失败: ${String(error)}`;
  });
});

refreshBtn?.addEventListener("click", () => {
  retrieveSummary.textContent = "刷新中...";
  loadSnapshot()
    .then(() => {
      retrieveSummary.textContent = "已刷新";
    })
    .catch((error) => {
      retrieveSummary.textContent = `刷新失败: ${String(error)}`;
    });
});

loadSnapshot().catch((error) => {
  retrieveSummary.textContent = `加载失败: ${String(error)}`;
});
