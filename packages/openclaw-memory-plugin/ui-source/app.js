const $ = (selector) => document.querySelector(selector);

const overviewCards = $("#overviewCards");
const levelTabs = $("#levelTabs");
const browserTitle = $("#browserTitle");
const listHint = $("#listHint");
const listQueryInput = $("#listQueryInput");
const listSearchBtn = $("#listSearchBtn");
const entryList = $("#entryList");
const detailTitle = $("#detailTitle");
const detailMeta = $("#detailMeta");
const detailBody = $("#detailBody");
const statusPill = $("#statusPill");
const detailToggleBtn = $("#detailToggleBtn");
const detailCloseBtn = $("#detailCloseBtn");
const mobileScrim = $("#mobileScrim");

const queryInput = $("#queryInput");
const retrieveBtn = $("#retrieveBtn");
const retrieveSummary = $("#retrieveSummary");
const retrieveTimeline = $("#retrieveTimeline");
const retrieveResult = $("#retrieveResult");
const refreshBtn = $("#refreshBtn");
const clearMemoryBtn = $("#clearMemoryBtn");

const LEVEL_CONFIG = {
  l1: {
    label: "L1 窗口",
    endpoint: "./api/l1",
    emptyText: "暂无 L1 结构化窗口。",
    description: "会话被 heartbeat 抽取后的结构化窗口。",
  },
  l2_project: {
    label: "L2 项目",
    endpoint: "./api/l2/project",
    emptyText: "暂无 L2 项目索引。",
    description: "按项目名称持续聚合的项目画像。",
  },
  l2_time: {
    label: "L2 时间",
    endpoint: "./api/l2/time",
    emptyText: "暂无 L2 时间索引。",
    description: "按日期聚合的时间维摘要。",
  },
  l0: {
    label: "L0 会话",
    endpoint: "./api/l0",
    emptyText: "暂无 L0 原始会话。",
    description: "原始完整 session 日志。",
  },
  facts: {
    label: "全局画像",
    endpoint: "./api/facts",
    emptyText: "全局画像当前没有事实条目。",
    description: "单例 global_fact_record 中的动态事实列表。",
  },
};

const state = {
  activeLevel: "l1",
  overview: {},
  globalFact: createEmptyGlobalFact(),
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

function createEmptyGlobalFact() {
  return {
    recordId: "global_fact_record",
    facts: [],
    createdAt: "",
    updatedAt: "",
  };
}

function shortText(value, max = 140) {
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

function isMobileLayout() {
  return window.matchMedia("(max-width: 1180px)").matches;
}

function openDetailDrawer() {
  if (!isMobileLayout()) return;
  document.body.classList.add("detail-open");
}

function closeDetailDrawer() {
  document.body.classList.remove("detail-open");
}

function updateStatusPill(overview = {}) {
  if (!statusPill) return;
  if (overview.lastIndexedAt) {
    statusPill.textContent = `最近索引 ${formatTime(overview.lastIndexedAt)}`;
    return;
  }
  statusPill.textContent = "等待索引";
}

function createMetricCard(label, value, note) {
  const card = document.createElement("div");
  card.className = "overview-card";

  const labelNode = document.createElement("div");
  labelNode.className = "overview-label";
  labelNode.textContent = label;

  const valueNode = document.createElement("div");
  valueNode.className = "overview-value";
  valueNode.textContent = String(value ?? 0);

  const noteNode = document.createElement("div");
  noteNode.className = "overview-note";
  noteNode.textContent = note;

  card.append(labelNode, valueNode, noteNode);
  return card;
}

function renderOverview(overview = {}) {
  state.overview = overview || {};
  updateStatusPill(state.overview);
  overviewCards.innerHTML = "";
  overviewCards.append(
    createMetricCard("L0 会话", overview.totalL0 ?? 0, "完整原始 session"),
    createMetricCard("L1 窗口", overview.totalL1 ?? 0, "结构化摘要层"),
    createMetricCard("L2 时间", overview.totalL2Time ?? 0, "日期聚合索引"),
    createMetricCard("L2 项目", overview.totalL2Project ?? 0, "项目聚合索引"),
    createMetricCard(
      "动态事实",
      overview.totalFacts ?? 0,
      overview.lastIndexedAt ? `更新于 ${formatTime(overview.lastIndexedAt)}` : "等待重建",
    ),
  );
}

function renderNavCounts() {
  levelTabs?.querySelectorAll("[data-count-for]").forEach((node) => {
    const level = node.getAttribute("data-count-for");
    if (!level) return;
    const count = Array.isArray(state.baseRaw[level]) ? state.baseRaw[level].length : 0;
    node.textContent = String(count);
  });
}

function getRawId(level, raw) {
  if (!raw) return "";
  if (level === "l2_time") return raw.l2IndexId || raw.dateKey || "";
  if (level === "l2_project") return raw.l2IndexId || raw.projectName || "";
  if (level === "l1") return raw.l1IndexId || raw.timePeriod || "";
  if (level === "l0") return raw.l0IndexId || raw.sessionKey || "";
  if (level === "facts") return raw.factKey || "";
  return "";
}

function normalizeEntry(level, raw) {
  if (!raw) return null;

  if (level === "l2_time") {
    return {
      level,
      id: getRawId(level, raw),
      badge: "time",
      title: raw.dateKey || "未命名日期",
      subtitle: raw.summary || "暂无摘要",
      meta: `关联 L1 ${raw.l1Source?.length ?? 0} 条 · 更新于 ${formatTime(raw.updatedAt)}`,
      raw,
    };
  }

  if (level === "l2_project") {
    return {
      level,
      id: getRawId(level, raw),
      badge: "project",
      title: raw.projectName || "未命名项目",
      subtitle: raw.latestProgress || raw.summary || "暂无进展",
      meta: `${raw.currentStatus || "状态未知"} · 关联 L1 ${raw.l1Source?.length ?? 0} 条`,
      raw,
    };
  }

  if (level === "l1") {
    return {
      level,
      id: getRawId(level, raw),
      badge: "window",
      title: raw.timePeriod || "L1 窗口",
      subtitle: raw.summary || "暂无摘要",
      meta: `facts ${raw.facts?.length ?? 0} · projects ${raw.projectTags?.length ?? 0} · source ${raw.l0Source?.length ?? 0}`,
      raw,
    };
  }

  if (level === "l0") {
    const userMessages = Array.isArray(raw.messages)
      ? raw.messages.filter((message) => message.role === "user").map((message) => message.content)
      : [];
    const preview = userMessages[userMessages.length - 1] || raw.messages?.[0]?.content || "";
    return {
      level,
      id: getRawId(level, raw),
      badge: "raw",
      title: raw.sessionKey || "未命名会话",
      subtitle: shortText(preview, 110) || "无会话内容",
      meta: `${formatTime(raw.timestamp)} · ${raw.indexed ? "已索引" : "待索引"} · ${raw.messages?.length ?? 0} 条消息`,
      raw,
    };
  }

  if (level === "facts") {
    return {
      level,
      id: getRawId(level, raw),
      badge: "fact",
      title: raw.factKey || "未命名事实",
      subtitle: raw.factValue || "暂无内容",
      meta: `置信度 ${(Number(raw.confidence || 0) * 100).toFixed(0)}% · 来源 L1 ${raw.sourceL1Ids?.length ?? 0} 条`,
      raw,
    };
  }

  return null;
}

function toEntries(level, records = []) {
  return (Array.isArray(records) ? records : [])
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

function updateDetailToggleState() {
  if (!detailToggleBtn) return;
  const selected = state.visibleItems[state.selectedIndex];
  const enabled = Boolean(selected) || (state.activeLevel === "facts" && state.globalFact);
  detailToggleBtn.disabled = !enabled;
}

function renderListHint(extra = "") {
  const config = LEVEL_CONFIG[state.activeLevel];
  browserTitle.textContent = config.label;
  const count = state.visibleItems.length;
  listHint.textContent = `${config.description} 当前展示 ${count} 条${extra ? `，${extra}` : ""}`;
}

function renderEntryList() {
  entryList.innerHTML = "";
  if (state.visibleItems.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
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

    const top = document.createElement("div");
    top.className = "entry-topline";

    const title = document.createElement("div");
    title.className = "entry-title";
    title.textContent = item.title;

    const badge = document.createElement("span");
    badge.className = "entry-badge";
    badge.textContent = item.badge;

    top.append(title, badge);

    const subtitle = document.createElement("div");
    subtitle.className = "entry-subtitle";
    subtitle.textContent = shortText(item.subtitle, 180);

    const meta = document.createElement("div");
    meta.className = "entry-meta";
    meta.textContent = item.meta;

    button.append(top, subtitle, meta);
    li.appendChild(button);
    entryList.appendChild(li);
  });
}

function createMetaItem(label, value) {
  const chip = document.createElement("div");
  chip.className = "meta-chip";

  const key = document.createElement("span");
  key.className = "meta-label";
  key.textContent = label;

  const val = document.createElement("span");
  val.className = "meta-value";
  val.textContent = value;

  chip.append(key, val);
  return chip;
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
  messages.forEach((message) => {
    const line = document.createElement("div");
    line.className = "message-item";

    const role = document.createElement("span");
    role.className = "message-role";
    role.textContent = message.role || "unknown";

    const content = document.createElement("span");
    content.className = "message-content";
    content.textContent = message.content || "";

    line.append(role, content);
    list.appendChild(line);
  });

  section.appendChild(list);
  detailBody.appendChild(section);
}

function appendGlobalFactBanner() {
  const banner = document.createElement("section");
  banner.className = "fact-banner";

  const title = document.createElement("strong");
  title.textContent = "global_fact_record";

  const copy = document.createElement("p");
  copy.className = "muted";
  copy.textContent = `当前维护 ${state.globalFact?.facts?.length ?? 0} 条动态事实，最近更新于 ${formatTime(state.globalFact?.updatedAt)}`;

  banner.append(title, copy);
  detailBody.appendChild(banner);
}

function renderDefaultDetail() {
  detailTitle.textContent = state.activeLevel === "facts" ? "全局画像" : "请选择条目";
  if (state.activeLevel === "facts") {
    detailMeta.append(
      createMetaItem("记录 ID", state.globalFact?.recordId || "global_fact_record"),
      createMetaItem("事实数量", String(state.globalFact?.facts?.length ?? 0)),
      createMetaItem("最近更新", formatTime(state.globalFact?.updatedAt)),
    );
    appendGlobalFactBanner();
    appendSection("说明", "左侧没有命中的事实条目时，仍可在这里查看单例全局画像的状态。");
    return;
  }
  appendSection("说明", "点击主面板中的任意记录，即可在这里查看索引字段、关联来源和消息内容。");
}

function renderDetail() {
  detailMeta.innerHTML = "";
  detailBody.innerHTML = "";

  const selected = state.visibleItems[state.selectedIndex];
  if (!selected) {
    renderDefaultDetail();
    updateDetailToggleState();
    return;
  }

  const raw = selected.raw;
  detailTitle.textContent = selected.title;

  if (selected.level === "l2_time") {
    detailMeta.append(
      createMetaItem("层级", "L2 时间"),
      createMetaItem("索引 ID", raw.l2IndexId || "-"),
      createMetaItem("日期", raw.dateKey || "-"),
      createMetaItem("更新时间", formatTime(raw.updatedAt)),
    );
    appendSection("摘要", raw.summary || "-");
    appendTagSection("关联 L1 IDs", raw.l1Source || []);
    updateDetailToggleState();
    return;
  }

  if (selected.level === "l2_project") {
    detailMeta.append(
      createMetaItem("层级", "L2 项目"),
      createMetaItem("索引 ID", raw.l2IndexId || "-"),
      createMetaItem("项目名", raw.projectName || "-"),
      createMetaItem("状态", raw.currentStatus || "-"),
    );
    appendSection("项目摘要", raw.summary || "-");
    appendSection("最新进展", raw.latestProgress || "-");
    appendTagSection("关联 L1 IDs", raw.l1Source || []);
    updateDetailToggleState();
    return;
  }

  if (selected.level === "l1") {
    detailMeta.append(
      createMetaItem("层级", "L1 窗口"),
      createMetaItem("索引 ID", raw.l1IndexId || "-"),
      createMetaItem("时间段", raw.timePeriod || "-"),
      createMetaItem("创建时间", formatTime(raw.createdAt)),
    );
    appendSection("窗口摘要", raw.summary || "-");
    appendSection("时间信息", raw.situationTimeInfo || "-");
    appendTagSection("项目标签", raw.projectTags || []);
    appendFactsSection(raw.facts || []);
    appendTagSection("关联 L0 IDs", raw.l0Source || []);
    updateDetailToggleState();
    return;
  }

  if (selected.level === "l0") {
    detailMeta.append(
      createMetaItem("层级", "L0 会话"),
      createMetaItem("索引 ID", raw.l0IndexId || "-"),
      createMetaItem("会话键", raw.sessionKey || "-"),
      createMetaItem("会话时间", formatTime(raw.timestamp)),
    );
    appendSection("来源", raw.source || "-");
    appendSection("索引状态", raw.indexed ? "已被 heartbeat 消费" : "尚未进入 heartbeat");
    appendMessagesSection(raw.messages || []);
    updateDetailToggleState();
    return;
  }

  if (selected.level === "facts") {
    detailMeta.append(
      createMetaItem("层级", "Global Fact"),
      createMetaItem("记录 ID", state.globalFact?.recordId || "global_fact_record"),
      createMetaItem("事实键", raw.factKey || "-"),
      createMetaItem("更新时间", formatTime(raw.updatedAt)),
    );
    appendGlobalFactBanner();
    appendSection("事实值", raw.factValue || "-");
    appendSection("置信度", `${(Number(raw.confidence || 0) * 100).toFixed(0)}%`);
    appendTagSection("来源 L1 IDs", raw.sourceL1Ids || []);
    appendSection("加入画像时间", formatTime(raw.createdAt));
  }

  updateDetailToggleState();
}

function setVisibleItems(items) {
  state.visibleItems = Array.isArray(items) ? items : [];
  state.selectedIndex = state.visibleItems.length > 0 ? 0 : -1;
  renderEntryList();
  renderDetail();
  renderListHint();
}

function switchLevel(nextLevel) {
  if (!LEVEL_CONFIG[nextLevel]) return;
  state.activeLevel = nextLevel;
  if (listQueryInput) listQueryInput.value = "";

  levelTabs?.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.getAttribute("data-level") === nextLevel);
  });

  setVisibleItems(state.baseItems[nextLevel] || []);
}

function createRetrieveCard(titleText, countText, lines) {
  const card = document.createElement("div");
  card.className = "retrieval-card-item";

  const top = document.createElement("div");
  top.className = "retrieval-topline";

  const title = document.createElement("div");
  title.className = "retrieval-title";
  title.textContent = titleText;

  const badge = document.createElement("span");
  badge.className = "retrieval-count";
  badge.textContent = countText;

  top.append(title, badge);
  card.appendChild(top);

  if (!lines || lines.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "没有命中。";
    card.appendChild(empty);
    return card;
  }

  const list = document.createElement("ul");
  list.className = "retrieval-list";
  lines.forEach((line) => {
    const item = document.createElement("li");
    item.textContent = line;
    list.appendChild(item);
  });
  card.appendChild(list);
  return card;
}

function renderRetrieveCards(payload, factHits = []) {
  retrieveTimeline.innerHTML = "";

  if (!payload) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "在上方输入问题后，这里会展示 facts、L2、L1、L0 四层推理轨迹。";
    retrieveTimeline.appendChild(empty);
    retrieveResult.textContent = "";
    return;
  }

  const factLines = (factHits || []).map(
    (fact) => `${fact.factKey}: ${shortText(fact.factValue, 88)}（${(Number(fact.confidence || 0) * 100).toFixed(0)}%）`,
  );
  const l2Lines = (payload.l2Results || []).map((hit) =>
    hit.level === "l2_time"
      ? `[time:${hit.item.dateKey}] ${shortText(hit.item.summary, 96)}`
      : `[project:${hit.item.projectName}] ${shortText(hit.item.latestProgress || hit.item.summary, 96)}`,
  );
  const l1Lines = (payload.l1Results || []).map((hit) => `[${hit.item.timePeriod}] ${shortText(hit.item.summary, 100)}`);
  const l0Lines = (payload.l0Results || []).map((hit) => {
    const userMessages = (hit.item.messages || []).filter((message) => message.role === "user").map((message) => message.content);
    return `[${formatTime(hit.item.timestamp)}] ${shortText(userMessages[userMessages.length - 1] || "", 100)}`;
  });

  retrieveTimeline.append(
    createRetrieveCard("Global Facts", `${factHits.length} hit`, factLines),
    createRetrieveCard("L2 Indexes", `${payload.l2Results?.length || 0} hit`, l2Lines),
    createRetrieveCard("L1 Windows", `${payload.l1Results?.length || 0} hit`, l1Lines),
    createRetrieveCard("L0 Raw Sessions", `${payload.l0Results?.length || 0} hit`, l0Lines),
  );

  retrieveResult.textContent = payload.context || JSON.stringify(payload, null, 2);
}

async function fetchJson(path, init) {
  const response = await fetch(path, init);
  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }
  return response.json();
}

function resetLocalCache() {
  state.globalFact = createEmptyGlobalFact();
  setBaseLevelData("l2_time", []);
  setBaseLevelData("l2_project", []);
  setBaseLevelData("l1", []);
  setBaseLevelData("l0", []);
  setBaseLevelData("facts", []);
  renderNavCounts();
  setVisibleItems([]);
}

async function loadSnapshot() {
  const snapshot = await fetchJson("./api/snapshot?limit=30");
  state.globalFact = snapshot.globalFact || createEmptyGlobalFact();
  renderOverview(snapshot.overview || {});

  setBaseLevelData("l2_time", snapshot.recentTimeIndexes || []);
  setBaseLevelData("l2_project", snapshot.recentProjectIndexes || []);
  setBaseLevelData("l1", snapshot.recentL1Windows || []);
  setBaseLevelData("l0", snapshot.recentSessions || []);
  setBaseLevelData("facts", state.globalFact.facts || []);
  renderNavCounts();
  switchLevel(state.activeLevel);
}

async function clearAllMemory() {
  const confirmed = window.confirm(
    "将清空所有 L0/L1/L2 与全局画像。由于新版 GlobalFactRecord 不自动迁移旧 facts，建议清空后重新建立索引。确认继续？",
  );
  if (!confirmed) return;

  retrieveSummary.textContent = "清空中...";
  renderRetrieveCards(null, []);
  if (clearMemoryBtn) clearMemoryBtn.disabled = true;
  if (refreshBtn) refreshBtn.disabled = true;

  try {
    const payload = await fetchJson("./api/clear", { method: "POST" });
    const cleared = payload?.cleared ?? {};
    const total = Number(cleared.l0 ?? 0)
      + Number(cleared.l1 ?? 0)
      + Number(cleared.l2Time ?? 0)
      + Number(cleared.l2Project ?? 0)
      + Number(cleared.facts ?? 0);

    resetLocalCache();
    await loadSnapshot();
    retrieveSummary.textContent = `已清空 ${total} 条记录（L0 ${cleared.l0 ?? 0} / L1 ${cleared.l1 ?? 0} / L2-Time ${cleared.l2Time ?? 0} / L2-Project ${cleared.l2Project ?? 0} / Facts ${cleared.facts ?? 0}）`;
    closeDetailDrawer();
  } catch (error) {
    retrieveSummary.textContent = `清空失败: ${String(error)}`;
  } finally {
    if (clearMemoryBtn) clearMemoryBtn.disabled = false;
    if (refreshBtn) refreshBtn.disabled = false;
  }
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
  state.visibleItems = entries;
  state.selectedIndex = entries.length > 0 ? 0 : -1;
  renderEntryList();
  renderDetail();
  renderListHint(`关键词：${query}`);
}

async function runRetrieve() {
  const query = queryInput.value.trim();
  if (!query) {
    retrieveSummary.textContent = "请输入检索问题。";
    renderRetrieveCards(null, []);
    return;
  }

  retrieveSummary.textContent = "检索中...";
  retrieveResult.textContent = "";

  const [payload, factHits] = await Promise.all([
    fetchJson(`./api/retrieve?q=${encodeURIComponent(query)}&limit=8`),
    fetchJson(`./api/facts?q=${encodeURIComponent(query)}&limit=5`),
  ]);

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
  mergeBaseLevelData("facts", factHits || []);
  renderNavCounts();

  if (!listQueryInput.value.trim()) {
    setVisibleItems(state.baseItems[state.activeLevel] || []);
  }

  retrieveSummary.textContent =
    `意图 ${payload.intent} · 停在 ${payload.enoughAt.toUpperCase()} · Facts ${factHits?.length || 0}` +
    ` / L2 ${payload.l2Results?.length || 0} / L1 ${payload.l1Results?.length || 0} / L0 ${payload.l0Results?.length || 0}`;
  renderRetrieveCards(payload, factHits || []);
}

levelTabs?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest(".nav-item");
  if (!(button instanceof HTMLButtonElement)) return;
  const level = button.getAttribute("data-level");
  if (!level) return;
  switchLevel(level);
  closeDetailDrawer();
});

entryList?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest(".entry-card");
  if (!(button instanceof HTMLButtonElement)) return;
  const index = Number.parseInt(button.dataset.index || "-1", 10);
  if (!Number.isInteger(index) || index < 0 || index >= state.visibleItems.length) return;
  state.selectedIndex = index;
  renderEntryList();
  renderDetail();
  openDetailDrawer();
});

listSearchBtn?.addEventListener("click", () => {
  searchCurrentLevel().catch((error) => {
    renderListHint(`过滤失败：${String(error)}`);
  });
});

listQueryInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  searchCurrentLevel().catch((error) => {
    renderListHint(`过滤失败：${String(error)}`);
  });
});

retrieveBtn?.addEventListener("click", () => {
  runRetrieve().catch((error) => {
    retrieveSummary.textContent = `检索失败: ${String(error)}`;
  });
});

queryInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  runRetrieve().catch((error) => {
    retrieveSummary.textContent = `检索失败: ${String(error)}`;
  });
});

refreshBtn?.addEventListener("click", () => {
  retrieveSummary.textContent = "刷新中...";
  loadSnapshot()
    .then(() => {
      retrieveSummary.textContent = "已刷新快照";
    })
    .catch((error) => {
      retrieveSummary.textContent = `刷新失败: ${String(error)}`;
    });
});

clearMemoryBtn?.addEventListener("click", () => {
  clearAllMemory().catch((error) => {
    retrieveSummary.textContent = `清空失败: ${String(error)}`;
    if (clearMemoryBtn) clearMemoryBtn.disabled = false;
    if (refreshBtn) refreshBtn.disabled = false;
  });
});

detailToggleBtn?.addEventListener("click", () => {
  openDetailDrawer();
});

detailCloseBtn?.addEventListener("click", () => {
  closeDetailDrawer();
});

mobileScrim?.addEventListener("click", () => {
  closeDetailDrawer();
});

window.addEventListener("resize", () => {
  if (!isMobileLayout()) {
    closeDetailDrawer();
  }
});

renderRetrieveCards(null, []);
loadSnapshot().catch((error) => {
  retrieveSummary.textContent = `加载失败: ${String(error)}`;
});
