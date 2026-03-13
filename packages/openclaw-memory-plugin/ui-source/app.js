const $ = (selector) => document.querySelector(selector);

const appScrim = $("#appScrim");
const navRail = $("#navRail");
const navToggleBtn = $("#navToggleBtn");
const navCloseBtn = $("#navCloseBtn");
const levelTabs = $("#levelTabs");
const navLastIndexed = $("#navLastIndexed");

const statusPill = $("#statusPill");
const activityText = $("#activityText");
const overviewCards = $("#overviewCards");
const browserTitle = $("#browserTitle");
const browserMeta = $("#browserMeta");
const listQueryInput = $("#listQueryInput");
const listSearchBtn = $("#listSearchBtn");
const entryList = $("#entryList");

const refreshBtn = $("#refreshBtn");
const buildNowBtn = $("#buildNowBtn");
const settingsToggleBtn = $("#settingsToggleBtn");
const retrieveToggleBtn = $("#retrieveToggleBtn");
const detailToggleBtn = $("#detailToggleBtn");

const detailPanel = $("#detailPanel");
const detailCloseBtn = $("#detailCloseBtn");
const detailTitle = $("#detailTitle");
const detailMeta = $("#detailMeta");
const detailBody = $("#detailBody");

const settingsPanel = $("#settingsPanel");
const settingsCloseBtn = $("#settingsCloseBtn");
const saveSettingsBtn = $("#saveSettingsBtn");
const clearMemoryBtn = $("#clearMemoryBtn");
const autoIndexIntervalInput = $("#autoIndexIntervalInput");
const l1WindowModeSelect = $("#l1WindowModeSelect");
const l1WindowValueLabel = $("#l1WindowValueLabel");
const l1WindowValueInput = $("#l1WindowValueInput");
const l2TimeGranularitySelect = $("#l2TimeGranularitySelect");

const retrievePanel = $("#retrievePanel");
const retrieveCloseBtn = $("#retrieveCloseBtn");
const queryInput = $("#queryInput");
const retrieveBtn = $("#retrieveBtn");
const retrieveSummary = $("#retrieveSummary");
const retrieveTimeline = $("#retrieveTimeline");
const retrieveResult = $("#retrieveResult");

const LEVEL_CONFIG = {
  l1: {
    label: "L1 窗口",
    endpoint: "./api/l1",
    emptyText: "暂无 L1 窗口。",
  },
  l2_project: {
    label: "L2 项目",
    endpoint: "./api/l2/project",
    emptyText: "暂无 L2 项目索引。",
  },
  l2_time: {
    label: "L2 时间",
    endpoint: "./api/l2/time",
    emptyText: "暂无 L2 时间索引。",
  },
  l0: {
    label: "L0 会话",
    endpoint: "./api/l0",
    emptyText: "暂无 L0 会话。",
  },
  facts: {
    label: "全局画像",
    endpoint: "./api/facts",
    emptyText: "暂无全局事实。",
  },
};

const OVERVIEW_KEYS = {
  l1: "totalL1",
  l2_project: "totalL2Project",
  l2_time: "totalL2Time",
  l0: "totalL0",
  facts: "totalFacts",
};

const PROJECT_STATUS_LABELS = {
  planned: "计划中",
  in_progress: "进行中",
  blocked: "阻塞",
  on_hold: "暂停",
  done: "已完成",
  unknown: "未知",
};

const state = {
  activeLevel: "l1",
  activePanel: null,
  overview: {},
  settings: createDefaultSettings(),
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

function createDefaultSettings() {
  return {
    autoIndexIntervalMinutes: 60,
    l1WindowMode: "time",
    l1WindowMinutes: 120,
    l1WindowMaxL0: 8,
    l2TimeGranularity: "day",
  };
}

function shortText(value, max = 140) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function formatTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

function formatStatus(value) {
  return PROJECT_STATUS_LABELS[value] || value || "-";
}

function getOverviewCount(level) {
  const key = OVERVIEW_KEYS[level];
  return Number(state.overview?.[key] ?? 0);
}

function setPanel(name) {
  state.activePanel = name || null;
  if (state.activePanel) {
    document.body.dataset.panel = state.activePanel;
  } else {
    delete document.body.dataset.panel;
  }
}

function togglePanel(name) {
  setPanel(state.activePanel === name ? null : name);
}

function setNavOpen(open) {
  if (open) {
    document.body.dataset.nav = "open";
  } else {
    delete document.body.dataset.nav;
  }
}

function isNavDrawerLayout() {
  return window.matchMedia("(max-width: 1080px)").matches;
}

function closeTransientUi() {
  setPanel(null);
  setNavOpen(false);
}

function setActivity(message, tone = "idle") {
  if (!activityText) return;
  activityText.textContent = message;
  activityText.dataset.tone = tone;
}

function updateStatusPill(overview = {}) {
  const pending = Number(overview.pendingL0 ?? 0);
  const lastIndexed = overview.lastIndexedAt ? formatTime(overview.lastIndexedAt) : "等待索引";
  const status = pending > 0 ? `待索引 ${pending} · ${lastIndexed}` : lastIndexed;
  statusPill.textContent = status;
  statusPill.dataset.tone = pending > 0 ? "pending" : "ready";
  navLastIndexed.textContent = lastIndexed;
}

function createMetricCard(label, value, note) {
  const card = document.createElement("section");
  card.className = "metric-card";

  const metricLabel = document.createElement("div");
  metricLabel.className = "metric-label";
  metricLabel.textContent = label;

  const metricValue = document.createElement("div");
  metricValue.className = "metric-value";
  metricValue.textContent = String(value ?? 0);

  const metricNote = document.createElement("div");
  metricNote.className = "metric-note";
  metricNote.textContent = note;

  card.append(metricLabel, metricValue, metricNote);
  return card;
}

function renderOverview(overview = {}) {
  state.overview = overview || {};
  updateStatusPill(state.overview);
  overviewCards.innerHTML = "";
  overviewCards.append(
    createMetricCard("L0", overview.totalL0 ?? 0, "会话"),
    createMetricCard("待索引", overview.pendingL0 ?? 0, "等待处理"),
    createMetricCard("L1", overview.totalL1 ?? 0, "窗口"),
    createMetricCard("L2 时间", overview.totalL2Time ?? 0, "时间桶"),
    createMetricCard("L2 项目", overview.totalL2Project ?? 0, "项目"),
    createMetricCard("事实", overview.totalFacts ?? 0, overview.lastIndexedAt ? "已索引" : "未索引"),
  );
  renderNavCounts();
}

function applySettings(settings = {}) {
  state.settings = {
    ...createDefaultSettings(),
    ...(settings || {}),
  };
  autoIndexIntervalInput.value = String(state.settings.autoIndexIntervalMinutes ?? 60);
  l1WindowModeSelect.value = state.settings.l1WindowMode || "time";
  l2TimeGranularitySelect.value = state.settings.l2TimeGranularity || "day";
  renderL1WindowMode();
}

function renderL1WindowMode() {
  const mode = l1WindowModeSelect.value === "count" ? "count" : "time";
  if (mode === "count") {
    l1WindowValueLabel.textContent = "最大 L0 数";
    l1WindowValueInput.placeholder = "8";
    l1WindowValueInput.value = String(state.settings.l1WindowMaxL0 ?? 8);
    return;
  }
  l1WindowValueLabel.textContent = "窗口时长（分钟）";
  l1WindowValueInput.placeholder = "120";
  l1WindowValueInput.value = String(state.settings.l1WindowMinutes ?? 120);
}

function readSettingsForm() {
  const toInteger = (value, fallback) => {
    const parsed = Number.parseInt(String(value || "").trim(), 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
  };

  const l1WindowMode = l1WindowModeSelect.value === "count" ? "count" : "time";
  const l1WindowValue = toInteger(
    l1WindowValueInput.value,
    l1WindowMode === "count" ? state.settings.l1WindowMaxL0 : state.settings.l1WindowMinutes,
  );

  return {
    autoIndexIntervalMinutes: toInteger(
      autoIndexIntervalInput.value,
      state.settings.autoIndexIntervalMinutes,
    ),
    l1WindowMode,
    l1WindowMinutes: l1WindowMode === "time" ? l1WindowValue : state.settings.l1WindowMinutes,
    l1WindowMaxL0: l1WindowMode === "count" ? l1WindowValue : state.settings.l1WindowMaxL0,
    l2TimeGranularity: l2TimeGranularitySelect.value || state.settings.l2TimeGranularity,
  };
}

function renderNavCounts() {
  levelTabs.querySelectorAll("[data-count-for]").forEach((node) => {
    const level = node.getAttribute("data-count-for");
    if (!level) return;
    node.textContent = String(getOverviewCount(level));
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
      title: raw.dateKey || "未命名时间桶",
      subtitle: raw.summary || "暂无摘要",
      meta: `L1 ${raw.l1Source?.length ?? 0} · ${formatTime(raw.updatedAt)}`,
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
      meta: `${formatStatus(raw.currentStatus)} · L1 ${raw.l1Source?.length ?? 0}`,
      raw,
    };
  }

  if (level === "l1") {
    return {
      level,
      id: getRawId(level, raw),
      badge: "window",
      title: raw.timePeriod || raw.sessionKey || "L1 窗口",
      subtitle: raw.summary || "暂无摘要",
      meta: `${raw.sessionKey || "-"} · L0 ${raw.l0Source?.length ?? 0} · 项目 ${raw.projectDetails?.length ?? 0}`,
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
      title: formatTime(raw.timestamp),
      subtitle: shortText(preview, 120) || "无内容",
      meta: `${raw.sessionKey || "-"} · ${raw.indexed ? "已索引" : "待索引"} · ${raw.messages?.length ?? 0} 条`,
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
      meta: `置信度 ${(Number(raw.confidence || 0) * 100).toFixed(0)}% · L1 ${raw.sourceL1Ids?.length ?? 0}`,
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
  const seen = new Set();
  const merged = [];
  for (const record of [...records, ...state.baseRaw[level]]) {
    const key = getRawId(level, record);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(record);
  }
  setBaseLevelData(level, merged);
}

function updateDetailToggleState() {
  detailToggleBtn.disabled = !state.visibleItems[state.selectedIndex];
}

function renderBrowserHeader(extra = "") {
  browserTitle.textContent = LEVEL_CONFIG[state.activeLevel].label;
  const current = state.visibleItems.length;
  const total = getOverviewCount(state.activeLevel);
  browserMeta.textContent = extra
    ? `${current} / ${total} 条 · ${extra}`
    : `${current} / ${total} 条`;
}

function renderEntryList() {
  entryList.innerHTML = "";

  if (state.visibleItems.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = LEVEL_CONFIG[state.activeLevel].emptyText;
    entryList.appendChild(empty);
    updateDetailToggleState();
    return;
  }

  state.visibleItems.forEach((item, index) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `entry-card${index === state.selectedIndex ? " active" : ""}`;
    button.dataset.index = String(index);

    const topline = document.createElement("div");
    topline.className = "entry-topline";

    const title = document.createElement("div");
    title.className = "entry-title";
    title.textContent = item.title;

    const badge = document.createElement("span");
    badge.className = "entry-badge";
    badge.textContent = item.badge;

    const subtitle = document.createElement("div");
    subtitle.className = "entry-subtitle";
    subtitle.textContent = shortText(item.subtitle, 180);

    const meta = document.createElement("div");
    meta.className = "entry-meta";
    meta.textContent = item.meta;

    topline.append(title, badge);
    button.append(topline, subtitle, meta);
    li.appendChild(button);
    entryList.appendChild(li);
  });

  updateDetailToggleState();
}

function createMetaChip(label, value) {
  const chip = document.createElement("div");
  chip.className = "meta-chip";

  const key = document.createElement("span");
  key.className = "meta-label";
  key.textContent = label;

  const val = document.createElement("span");
  val.className = "meta-value";
  val.textContent = value || "-";

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

  const list = document.createElement("div");
  list.className = "tag-list";

  if (!Array.isArray(tags) || tags.length === 0) {
    const empty = document.createElement("p");
    empty.className = "detail-empty";
    empty.textContent = "无";
    section.append(title, empty);
    detailBody.appendChild(section);
    return;
  }

  tags.forEach((tag) => {
    const node = document.createElement("span");
    node.className = "tag";
    node.textContent = String(tag);
    list.appendChild(node);
  });

  section.append(title, list);
  detailBody.appendChild(section);
}

function appendFactsSection(facts = []) {
  const section = document.createElement("section");
  section.className = "detail-section";

  const title = document.createElement("h4");
  title.textContent = "事实";
  section.appendChild(title);

  if (!Array.isArray(facts) || facts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "detail-empty";
    empty.textContent = "无";
    section.appendChild(empty);
    detailBody.appendChild(section);
    return;
  }

  const list = document.createElement("ul");
  list.className = "mini-list";
  facts.forEach((fact) => {
    const item = document.createElement("li");
    item.textContent = `${fact.factKey}: ${fact.factValue}（${(Number(fact.confidence || 0) * 100).toFixed(0)}%）`;
    list.appendChild(item);
  });

  section.appendChild(list);
  detailBody.appendChild(section);
}

function appendProjectsSection(projects = []) {
  const section = document.createElement("section");
  section.className = "detail-section";

  const title = document.createElement("h4");
  title.textContent = "项目";
  section.appendChild(title);

  if (!Array.isArray(projects) || projects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "detail-empty";
    empty.textContent = "无";
    section.appendChild(empty);
    detailBody.appendChild(section);
    return;
  }

  const stack = document.createElement("div");
  stack.className = "project-stack";

  projects.forEach((project) => {
    const card = document.createElement("article");
    card.className = "project-card";

    const heading = document.createElement("strong");
    heading.textContent = `${project.name} · ${formatStatus(project.status)}`;

    const summary = document.createElement("p");
    summary.textContent = project.summary || "-";

    const progress = document.createElement("p");
    progress.textContent = `进展：${project.latestProgress || "-"}`;

    card.append(heading, summary, progress);
    stack.appendChild(card);
  });

  section.appendChild(stack);
  detailBody.appendChild(section);
}

function appendMessagesSection(messages = []) {
  const section = document.createElement("section");
  section.className = "detail-section";

  const title = document.createElement("h4");
  title.textContent = "消息";
  section.appendChild(title);

  if (!Array.isArray(messages) || messages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "detail-empty";
    empty.textContent = "无";
    section.appendChild(empty);
    detailBody.appendChild(section);
    return;
  }

  const list = document.createElement("div");
  list.className = "message-list";

  messages.forEach((message) => {
    const item = document.createElement("div");
    item.className = "message-item";
    item.classList.toggle("is-user", message.role === "user");
    item.classList.toggle("is-assistant", message.role === "assistant");

    const role = document.createElement("span");
    role.className = "message-role";
    role.textContent = String(message.role || "unknown");

    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = message.content || "";

    item.append(role, content);
    list.appendChild(item);
  });

  section.appendChild(list);
  detailBody.appendChild(section);
}

function renderEmptyDetail() {
  detailTitle.textContent = "记录详情";
  detailMeta.innerHTML = "";
  detailBody.innerHTML = "";

  const empty = document.createElement("div");
  empty.className = "detail-empty";
  empty.textContent = "选择一条记录查看字段。";
  detailBody.appendChild(empty);
}

function renderDetail() {
  const selected = state.visibleItems[state.selectedIndex];
  detailMeta.innerHTML = "";
  detailBody.innerHTML = "";

  if (!selected) {
    renderEmptyDetail();
    updateDetailToggleState();
    return;
  }

  const raw = selected.raw;
  detailTitle.textContent = selected.title;

  if (selected.level === "l2_time") {
    detailMeta.append(
      createMetaChip("层级", "L2 时间"),
      createMetaChip("索引", raw.l2IndexId),
      createMetaChip("时间桶", raw.dateKey),
      createMetaChip("更新", formatTime(raw.updatedAt)),
    );
    appendSection("摘要", raw.summary || "-");
    appendTagSection("关联 L1", raw.l1Source || []);
    updateDetailToggleState();
    return;
  }

  if (selected.level === "l2_project") {
    detailMeta.append(
      createMetaChip("层级", "L2 项目"),
      createMetaChip("索引", raw.l2IndexId),
      createMetaChip("项目", raw.projectName),
      createMetaChip("状态", formatStatus(raw.currentStatus)),
    );
    appendSection("摘要", raw.summary || "-");
    appendSection("最新进展", raw.latestProgress || "-");
    appendTagSection("关联 L1", raw.l1Source || []);
    updateDetailToggleState();
    return;
  }

  if (selected.level === "l1") {
    detailMeta.append(
      createMetaChip("层级", "L1 窗口"),
      createMetaChip("索引", raw.l1IndexId),
      createMetaChip("Session", raw.sessionKey),
      createMetaChip("时间段", raw.timePeriod),
    );
    detailMeta.append(
      createMetaChip("开始", formatTime(raw.startedAt)),
      createMetaChip("结束", formatTime(raw.endedAt)),
      createMetaChip("创建", formatTime(raw.createdAt)),
    );
    appendSection("摘要", raw.summary || "-");
    appendSection("时间信息", raw.situationTimeInfo || "-");
    appendFactsSection(raw.facts || []);
    appendProjectsSection(raw.projectDetails || []);
    appendTagSection("关联 L0", raw.l0Source || []);
    updateDetailToggleState();
    return;
  }

  if (selected.level === "l0") {
    detailMeta.append(
      createMetaChip("层级", "L0 会话"),
      createMetaChip("索引", raw.l0IndexId),
      createMetaChip("Session", raw.sessionKey),
      createMetaChip("时间", formatTime(raw.timestamp)),
    );
    appendSection("来源", raw.source || "-");
    appendSection("索引状态", raw.indexed ? "已索引" : "待索引");
    appendMessagesSection(raw.messages || []);
    updateDetailToggleState();
    return;
  }

  if (selected.level === "facts") {
    detailMeta.append(
      createMetaChip("层级", "全局事实"),
      createMetaChip("记录", state.globalFact.recordId),
      createMetaChip("键", raw.factKey),
      createMetaChip("更新", formatTime(raw.updatedAt)),
    );
    appendSection("值", raw.factValue || "-");
    appendSection("置信度", `${(Number(raw.confidence || 0) * 100).toFixed(0)}%`);
    appendTagSection("来源 L1", raw.sourceL1Ids || []);
    updateDetailToggleState();
    return;
  }

  renderEmptyDetail();
  updateDetailToggleState();
}

function setVisibleItems(items, extra = "") {
  state.visibleItems = Array.isArray(items) ? items : [];
  state.selectedIndex = state.visibleItems.length > 0 ? 0 : -1;
  renderEntryList();
  renderDetail();
  renderBrowserHeader(extra);
}

function switchLevel(level) {
  if (!LEVEL_CONFIG[level]) return;
  state.activeLevel = level;
  listQueryInput.value = "";

  levelTabs.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.getAttribute("data-level") === level);
  });

  setVisibleItems(state.baseItems[level] || []);
  if (isNavDrawerLayout()) {
    setNavOpen(false);
  }
}

function createRetrieveBlock(titleText, countText, lines) {
  const card = document.createElement("section");
  card.className = "retrieval-block";

  const head = document.createElement("div");
  head.className = "retrieval-head";

  const title = document.createElement("strong");
  title.textContent = titleText;

  const count = document.createElement("span");
  count.className = "retrieval-count";
  count.textContent = countText;

  head.append(title, count);
  card.appendChild(head);

  if (!lines || lines.length === 0) {
    const empty = document.createElement("div");
    empty.className = "detail-empty";
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

function renderRetrieve(payload, factHits = []) {
  retrieveTimeline.innerHTML = "";

  if (!payload) {
    retrieveSummary.textContent = "尚未检索";
    retrieveResult.textContent = "";

    const empty = document.createElement("div");
    empty.className = "detail-empty";
    empty.textContent = "输入问题后查看召回路径。";
    retrieveTimeline.appendChild(empty);
    return;
  }

  const factLines = factHits.map(
    (fact) => `${fact.factKey}: ${shortText(fact.factValue, 88)}（${(Number(fact.confidence || 0) * 100).toFixed(0)}%）`,
  );
  const l2Lines = (payload.l2Results || []).map((hit) => (
    hit.level === "l2_time"
      ? `[${hit.item.dateKey}] ${shortText(hit.item.summary, 96)}`
      : `[${hit.item.projectName}] ${shortText(hit.item.latestProgress || hit.item.summary, 96)}`
  ));
  const l1Lines = (payload.l1Results || []).map((hit) => (
    `[${hit.item.timePeriod}] ${shortText(hit.item.summary, 100)}`
  ));
  const l0Lines = (payload.l0Results || []).map((hit) => {
    const userMessages = (hit.item.messages || [])
      .filter((message) => message.role === "user")
      .map((message) => message.content);
    const preview = userMessages[userMessages.length - 1] || hit.item.messages?.[0]?.content || "";
    return `[${formatTime(hit.item.timestamp)}] ${shortText(preview, 100)}`;
  });

  retrieveSummary.textContent =
    `意图 ${payload.intent} · 停在 ${String(payload.enoughAt || "none").toUpperCase()}`;
  retrieveTimeline.append(
    createRetrieveBlock("Global Facts", `${factHits.length} hit`, factLines),
    createRetrieveBlock("L2", `${payload.l2Results?.length || 0} hit`, l2Lines),
    createRetrieveBlock("L1", `${payload.l1Results?.length || 0} hit`, l1Lines),
    createRetrieveBlock("L0", `${payload.l0Results?.length || 0} hit`, l0Lines),
  );
  retrieveResult.textContent = payload.context || JSON.stringify(payload, null, 2);
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }
  return response.json();
}

async function postJson(url, payload = {}) {
  return fetchJson(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function resetLocalCache() {
  state.globalFact = createEmptyGlobalFact();
  setBaseLevelData("l2_time", []);
  setBaseLevelData("l2_project", []);
  setBaseLevelData("l1", []);
  setBaseLevelData("l0", []);
  setBaseLevelData("facts", []);
}

async function loadSnapshot() {
  const snapshot = await fetchJson("./api/snapshot?limit=30");
  state.globalFact = snapshot.globalFact || createEmptyGlobalFact();
  renderOverview(snapshot.overview || {});
  applySettings(snapshot.settings || createDefaultSettings());

  setBaseLevelData("l2_time", snapshot.recentTimeIndexes || []);
  setBaseLevelData("l2_project", snapshot.recentProjectIndexes || []);
  setBaseLevelData("l1", snapshot.recentL1Windows || []);
  setBaseLevelData("l0", snapshot.recentSessions || []);
  setBaseLevelData("facts", state.globalFact.facts || []);

  switchLevel(state.activeLevel);
}

async function searchCurrentLevel() {
  const query = listQueryInput.value.trim();
  if (!query) {
    setVisibleItems(state.baseItems[state.activeLevel] || []);
    return;
  }

  const payload = await fetchJson(
    `${LEVEL_CONFIG[state.activeLevel].endpoint}?q=${encodeURIComponent(query)}&limit=30`,
  );
  const records = state.activeLevel.startsWith("l2")
    ? (payload || []).map((hit) => hit.item || hit)
    : payload || [];
  setVisibleItems(toEntries(state.activeLevel, records), `搜索：${query}`);
}

async function refreshSnapshot() {
  setActivity("刷新中...", "busy");
  await loadSnapshot();
  setActivity("已刷新", "success");
}

async function saveSettings() {
  const payload = readSettingsForm();
  saveSettingsBtn.disabled = true;
  setActivity("保存设置中...", "busy");
  try {
    const settings = await postJson("./api/settings", payload);
    applySettings(settings);
    await loadSnapshot();
    const l1Value = settings.l1WindowMode === "count"
      ? `${settings.l1WindowMaxL0} 条`
      : `${settings.l1WindowMinutes} 分钟`;
    setActivity(
      `设置已保存 · 自动 ${settings.autoIndexIntervalMinutes} 分钟 · L1 ${l1Value} · L2 ${settings.l2TimeGranularity}`,
      "success",
    );
  } finally {
    saveSettingsBtn.disabled = false;
  }
}

async function runIndexBuild() {
  buildNowBtn.disabled = true;
  refreshBtn.disabled = true;
  setActivity("正在构建索引...", "busy");
  try {
    const stats = await postJson("./api/index/run");
    await loadSnapshot();
    setActivity(
      `已构建 · L0 ${stats.l0Captured ?? 0} / L1 ${stats.l1Created ?? 0} / L2 时间 ${stats.l2TimeUpdated ?? 0} / L2 项目 ${stats.l2ProjectUpdated ?? 0}`,
      "success",
    );
  } finally {
    buildNowBtn.disabled = false;
    refreshBtn.disabled = false;
  }
}

async function clearAllMemory() {
  const confirmed = window.confirm("将清空所有索引与全局事实，确认继续？");
  if (!confirmed) return;

  clearMemoryBtn.disabled = true;
  refreshBtn.disabled = true;
  setActivity("清空中...", "danger");

  try {
    const payload = await postJson("./api/clear");
    const cleared = payload?.cleared ?? {};
    resetLocalCache();
    renderRetrieve(null, []);
    await loadSnapshot();
    setPanel(null);
    setActivity(
      `已清空 · L0 ${cleared.l0 ?? 0} / L1 ${cleared.l1 ?? 0} / L2 时间 ${cleared.l2Time ?? 0} / L2 项目 ${cleared.l2Project ?? 0} / 事实 ${cleared.facts ?? 0}`,
      "danger",
    );
  } finally {
    clearMemoryBtn.disabled = false;
    refreshBtn.disabled = false;
  }
}

async function runRetrieve() {
  const query = queryInput.value.trim();
  if (!query) {
    setActivity("请输入检索问题。", "warning");
    renderRetrieve(null, []);
    return;
  }

  retrieveBtn.disabled = true;
  setPanel("retrieve");
  setActivity("检索中...", "busy");

  try {
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

    mergeBaseLevelData("l2_time", l2Time);
    mergeBaseLevelData("l2_project", l2Project);
    mergeBaseLevelData("l1", (payload.l1Results || []).map((hit) => hit.item).filter(Boolean));
    mergeBaseLevelData("l0", (payload.l0Results || []).map((hit) => hit.item).filter(Boolean));
    mergeBaseLevelData("facts", factHits || []);

    if (!listQueryInput.value.trim()) {
      setVisibleItems(state.baseItems[state.activeLevel] || []);
    }

    renderRetrieve(payload, factHits || []);
    setActivity(
      `检索完成 · Facts ${factHits?.length || 0} / L2 ${payload.l2Results?.length || 0} / L1 ${payload.l1Results?.length || 0} / L0 ${payload.l0Results?.length || 0}`,
      "success",
    );
  } finally {
    retrieveBtn.disabled = false;
  }
}

levelTabs.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest(".nav-item");
  if (!(button instanceof HTMLButtonElement)) return;
  const level = button.getAttribute("data-level");
  if (!level) return;
  switchLevel(level);
});

entryList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest(".entry-card");
  if (!(button instanceof HTMLButtonElement)) return;
  const index = Number.parseInt(button.dataset.index || "-1", 10);
  if (!Number.isInteger(index) || index < 0 || index >= state.visibleItems.length) return;

  state.selectedIndex = index;
  renderEntryList();
  renderDetail();
  setPanel("detail");
});

listSearchBtn.addEventListener("click", () => {
  searchCurrentLevel().catch((error) => {
    setActivity(`搜索失败: ${String(error)}`, "danger");
  });
});

listQueryInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  searchCurrentLevel().catch((error) => {
    setActivity(`搜索失败: ${String(error)}`, "danger");
  });
});

refreshBtn.addEventListener("click", () => {
  refreshSnapshot().catch((error) => {
    setActivity(`刷新失败: ${String(error)}`, "danger");
  });
});

buildNowBtn.addEventListener("click", () => {
  runIndexBuild().catch((error) => {
    setActivity(`构建失败: ${String(error)}`, "danger");
    buildNowBtn.disabled = false;
    refreshBtn.disabled = false;
  });
});

settingsToggleBtn.addEventListener("click", () => {
  togglePanel("settings");
});

retrieveToggleBtn.addEventListener("click", () => {
  togglePanel("retrieve");
});

detailToggleBtn.addEventListener("click", () => {
  if (!state.visibleItems[state.selectedIndex]) return;
  togglePanel("detail");
});

detailCloseBtn.addEventListener("click", () => setPanel(null));
settingsCloseBtn.addEventListener("click", () => setPanel(null));
retrieveCloseBtn.addEventListener("click", () => setPanel(null));
saveSettingsBtn.addEventListener("click", () => {
  saveSettings().catch((error) => {
    setActivity(`保存失败: ${String(error)}`, "danger");
    saveSettingsBtn.disabled = false;
  });
});

clearMemoryBtn.addEventListener("click", () => {
  clearAllMemory().catch((error) => {
    setActivity(`清空失败: ${String(error)}`, "danger");
    clearMemoryBtn.disabled = false;
    refreshBtn.disabled = false;
  });
});

l1WindowModeSelect.addEventListener("change", () => {
  renderL1WindowMode();
});

retrieveBtn.addEventListener("click", () => {
  runRetrieve().catch((error) => {
    setActivity(`检索失败: ${String(error)}`, "danger");
    retrieveBtn.disabled = false;
  });
});

queryInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  runRetrieve().catch((error) => {
    setActivity(`检索失败: ${String(error)}`, "danger");
    retrieveBtn.disabled = false;
  });
});

navToggleBtn.addEventListener("click", () => {
  setNavOpen(true);
});

navCloseBtn.addEventListener("click", () => {
  setNavOpen(false);
});

appScrim.addEventListener("click", () => {
  closeTransientUi();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeTransientUi();
  }
});

window.addEventListener("resize", () => {
  if (!isNavDrawerLayout()) {
    setNavOpen(false);
  }
});

renderRetrieve(null, []);
setActivity("等待操作", "idle");
loadSnapshot().catch((error) => {
  setActivity(`加载失败: ${String(error)}`, "danger");
});
