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

const retrievePanel = $("#retrievePanel");
const retrieveCloseBtn = $("#retrieveCloseBtn");
const queryInput = $("#queryInput");
const retrieveBtn = $("#retrieveBtn");
const retrieveSummary = $("#retrieveSummary");
const retrieveTimeline = $("#retrieveTimeline");
const retrieveResult = $("#retrieveResult");

const LEVEL_CONFIG = {
  l1: {
    label: "L1 话题窗口",
    endpoint: "./api/l1",
    emptyText: "暂无 L1 记录。",
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
  profile: {
    label: "全局画像",
    endpoint: "./api/profile",
    emptyText: "暂无全局画像。",
  },
};

const OVERVIEW_KEYS = {
  l1: "totalL1",
  l2_project: "totalL2Project",
  l2_time: "totalL2Time",
  l0: "totalL0",
  profile: "totalProfiles",
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
  globalProfile: createEmptyProfile(),
  baseRaw: {
    l2_time: [],
    l2_project: [],
    l1: [],
    l0: [],
    profile: [],
  },
  baseItems: {
    l2_time: [],
    l2_project: [],
    l1: [],
    l0: [],
    profile: [],
  },
  visibleItems: [],
  selectedIndex: -1,
};

function createEmptyProfile() {
  return {
    recordId: "global_profile_record",
    profileText: "",
    sourceL1Ids: [],
    createdAt: "",
    updatedAt: "",
  };
}

function createDefaultSettings() {
  return {
    autoIndexIntervalMinutes: 60,
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
  activityText.textContent = message;
  activityText.dataset.tone = tone;
}

function updateStatusPill(overview = {}) {
  const pending = Number(overview.pendingL0 ?? 0);
  const openTopics = Number(overview.openTopics ?? 0);
  const lastIndexed = overview.lastIndexedAt ? formatTime(overview.lastIndexedAt) : "等待索引";
  const status = pending > 0
    ? `待索引 ${pending} · 开放话题 ${openTopics}`
    : `${lastIndexed}`;
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
    createMetricCard("开放话题", overview.openTopics ?? 0, "未闭合"),
    createMetricCard("L1", overview.totalL1 ?? 0, "话题窗口"),
    createMetricCard("L2 时间", overview.totalL2Time ?? 0, "按天"),
    createMetricCard("L2 项目", overview.totalL2Project ?? 0, "项目"),
    createMetricCard("画像", overview.totalProfiles ?? 0, overview.lastIndexedAt ? "已更新" : "未生成"),
  );
  renderNavCounts();
}

function applySettings(settings = {}) {
  state.settings = {
    ...createDefaultSettings(),
    ...(settings || {}),
  };
  autoIndexIntervalInput.value = String(state.settings.autoIndexIntervalMinutes ?? 60);
}

function readSettingsForm() {
  const parsed = Number.parseInt(String(autoIndexIntervalInput.value || "").trim(), 10);
  return {
    autoIndexIntervalMinutes: Number.isFinite(parsed)
      ? Math.max(0, parsed)
      : state.settings.autoIndexIntervalMinutes,
  };
}

function renderNavCounts() {
  levelTabs.querySelectorAll("[data-count-for]").forEach((node) => {
    const level = node.getAttribute("data-count-for");
    if (!level) return;
    node.textContent = String(getOverviewCount(level));
  });
}

function unwrapRaw(level, raw) {
  if (!raw) return raw;
  if ((level === "l2_time" || level === "l2_project") && raw.item) return raw.item;
  return raw;
}

function getRawId(level, raw) {
  if (!raw) return "";
  if (level === "l2_time") return raw.l2IndexId || raw.dateKey || "";
  if (level === "l2_project") return raw.l2IndexId || raw.projectKey || raw.projectName || "";
  if (level === "l1") return raw.l1IndexId || raw.timePeriod || "";
  if (level === "l0") return raw.l0IndexId || raw.sessionKey || "";
  if (level === "profile") return raw.recordId || "global_profile_record";
  return "";
}

function normalizeEntry(level, rawInput) {
  const raw = unwrapRaw(level, rawInput);
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
      badge: formatStatus(raw.currentStatus),
      title: raw.projectName || "未命名项目",
      subtitle: raw.latestProgress || raw.summary || "暂无进展",
      meta: `来源 ${raw.l1Source?.length ?? 0} · ${formatTime(raw.updatedAt)}`,
      raw,
    };
  }

  if (level === "l1") {
    return {
      level,
      id: getRawId(level, raw),
      badge: "topic",
      title: raw.timePeriod || "未命名窗口",
      subtitle: raw.summary || "暂无摘要",
      meta: `L0 ${raw.l0Source?.length ?? 0} · 项目 ${raw.projectDetails?.length ?? 0}`,
      raw,
    };
  }

  if (level === "l0") {
    const userMessages = (raw.messages || []).filter((message) => message.role === "user").map((message) => message.content);
    return {
      level,
      id: getRawId(level, raw),
      badge: "raw",
      title: raw.sessionKey || "未命名会话",
      subtitle: shortText(userMessages[userMessages.length - 1] || "暂无用户消息", 180),
      meta: formatTime(raw.timestamp),
      raw,
    };
  }

  if (level === "profile") {
    return {
      level,
      id: getRawId(level, raw),
      badge: "profile",
      title: "全局画像",
      subtitle: raw.profileText || "暂无画像摘要",
      meta: `L1 ${raw.sourceL1Ids?.length ?? 0} · ${formatTime(raw.updatedAt)}`,
      raw,
    };
  }

  return null;
}

function normalizeEntryList(level, raws = []) {
  return (raws || [])
    .map((raw) => normalizeEntry(level, raw))
    .filter(Boolean);
}

function createEmptyState(text) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = text;
  return empty;
}

function renderEntryList() {
  entryList.innerHTML = "";
  if (state.visibleItems.length === 0) {
    entryList.append(createEmptyState(LEVEL_CONFIG[state.activeLevel].emptyText));
    state.selectedIndex = -1;
    renderDetail();
    browserMeta.textContent = "0 条";
    return;
  }

  browserMeta.textContent = `${state.visibleItems.length} 条`;
  if (state.selectedIndex < 0 || state.selectedIndex >= state.visibleItems.length) {
    state.selectedIndex = 0;
  }

  state.visibleItems.forEach((item, index) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "entry-card";
    if (index === state.selectedIndex) button.classList.add("active");

    const topline = document.createElement("div");
    topline.className = "entry-topline";

    const title = document.createElement("div");
    title.className = "entry-title";
    title.textContent = item.title;

    const badge = document.createElement("span");
    badge.className = "entry-badge";
    badge.textContent = item.badge;

    topline.append(title, badge);

    const subtitle = document.createElement("div");
    subtitle.className = "entry-subtitle";
    subtitle.textContent = shortText(item.subtitle, 200);

    const meta = document.createElement("div");
    meta.className = "entry-meta";
    meta.textContent = item.meta;

    button.append(topline, subtitle, meta);
    button.addEventListener("click", () => {
      state.selectedIndex = index;
      renderEntryList();
      renderDetail();
      setPanel("detail");
      if (isNavDrawerLayout()) setNavOpen(false);
    });
    li.append(button);
    entryList.append(li);
  });

  renderDetail();
}

function createMetaChip(label, value) {
  const chip = document.createElement("span");
  chip.className = "meta-chip";
  const metaLabel = document.createElement("span");
  metaLabel.className = "meta-label";
  metaLabel.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  chip.append(metaLabel, strong);
  return chip;
}

function createDetailSection(title, body) {
  const section = document.createElement("section");
  section.className = "detail-section";
  const heading = document.createElement("h4");
  heading.textContent = title;
  section.append(heading);
  if (typeof body === "string") {
    const paragraph = document.createElement("p");
    paragraph.textContent = body;
    section.append(paragraph);
  } else if (body) {
    section.append(body);
  }
  return section;
}

function createTagList(items = []) {
  const wrap = document.createElement("div");
  wrap.className = "tag-list";
  (items || []).forEach((item) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = String(item);
    wrap.append(tag);
  });
  return wrap;
}

function createProjectStack(projects = []) {
  const stack = document.createElement("div");
  stack.className = "project-stack";
  projects.forEach((project) => {
    const card = document.createElement("div");
    card.className = "project-card";
    const title = document.createElement("strong");
    title.textContent = project.name || "未命名项目";
    const status = document.createElement("p");
    status.textContent = `状态：${formatStatus(project.status)}`;
    const summary = document.createElement("p");
    summary.textContent = project.summary || "暂无摘要";
    const progress = document.createElement("p");
    progress.textContent = project.latestProgress || "暂无进展";
    card.append(title, status, summary, progress);
    stack.append(card);
  });
  return stack;
}

function createMessageList(messages = []) {
  const list = document.createElement("div");
  list.className = "message-list";
  messages.forEach((message) => {
    const item = document.createElement("div");
    item.className = "message-item";
    const role = document.createElement("div");
    role.className = "message-role";
    role.textContent = message.role;
    const paragraph = document.createElement("p");
    paragraph.textContent = message.content || "";
    item.append(role, paragraph);
    list.append(item);
  });
  return list;
}

function renderDetail() {
  detailMeta.innerHTML = "";
  detailBody.innerHTML = "";

  const entry = state.visibleItems[state.selectedIndex];
  if (!entry) {
    detailTitle.textContent = "记录详情";
    detailBody.append(createEmptyState("选择左侧记录查看详情。"));
    return;
  }

  const { level, raw } = entry;
  detailTitle.textContent = entry.title;

  if (level === "l2_time") {
    detailMeta.append(
      createMetaChip("日期", raw.dateKey || "-"),
      createMetaChip("来源", `${raw.l1Source?.length ?? 0} 条 L1`),
      createMetaChip("更新", formatTime(raw.updatedAt)),
    );
    detailBody.append(
      createDetailSection("摘要", raw.summary || "暂无摘要"),
      createDetailSection("来源窗口", createTagList(raw.l1Source || [])),
    );
    return;
  }

  if (level === "l2_project") {
    detailMeta.append(
      createMetaChip("项目键", raw.projectKey || "-"),
      createMetaChip("状态", formatStatus(raw.currentStatus)),
      createMetaChip("更新", formatTime(raw.updatedAt)),
    );
    detailBody.append(
      createDetailSection("摘要", raw.summary || "暂无摘要"),
      createDetailSection("最近进展", raw.latestProgress || "暂无进展"),
      createDetailSection("来源窗口", createTagList(raw.l1Source || [])),
    );
    return;
  }

  if (level === "l1") {
    detailMeta.append(
      createMetaChip("Session", raw.sessionKey || "-"),
      createMetaChip("开始", formatTime(raw.startedAt)),
      createMetaChip("结束", formatTime(raw.endedAt)),
    );
    detailBody.append(
      createDetailSection("摘要", raw.summary || "暂无摘要"),
      createDetailSection("时间情景", raw.situationTimeInfo || "暂无情景摘要"),
      createDetailSection("项目", raw.projectDetails?.length ? createProjectStack(raw.projectDetails) : "暂无项目"),
      createDetailSection(
        "事实",
        raw.facts?.length
          ? createTagList(raw.facts.map((fact) => `${fact.factKey}: ${fact.factValue}`))
          : "暂无事实",
      ),
      createDetailSection("来源 L0", createTagList(raw.l0Source || [])),
    );
    return;
  }

  if (level === "l0") {
    detailMeta.append(
      createMetaChip("Session", raw.sessionKey || "-"),
      createMetaChip("时间", formatTime(raw.timestamp)),
      createMetaChip("消息", `${raw.messages?.length ?? 0} 条`),
    );
    detailBody.append(
      createDetailSection("消息流", createMessageList(raw.messages || [])),
    );
    return;
  }

  if (level === "profile") {
    detailMeta.append(
      createMetaChip("来源", `${raw.sourceL1Ids?.length ?? 0} 条 L1`),
      createMetaChip("更新", formatTime(raw.updatedAt)),
    );
    detailBody.append(
      createDetailSection("画像摘要", raw.profileText || "暂无画像摘要"),
      createDetailSection("来源窗口", createTagList(raw.sourceL1Ids || [])),
    );
  }
}

function renderActiveNav() {
  levelTabs.querySelectorAll("[data-level]").forEach((button) => {
    const level = button.getAttribute("data-level");
    button.classList.toggle("active", level === state.activeLevel);
  });
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

function syncBaseItems() {
  Object.keys(state.baseRaw).forEach((level) => {
    state.baseItems[level] = normalizeEntryList(level, state.baseRaw[level]);
  });
}

async function loadSnapshot() {
  const snapshot = await fetchJson("./api/snapshot?limit=24");
  renderOverview(snapshot.overview || {});
  applySettings(snapshot.settings || {});
  state.globalProfile = snapshot.globalProfile || createEmptyProfile();
  state.baseRaw.l2_time = snapshot.recentTimeIndexes || [];
  state.baseRaw.l2_project = snapshot.recentProjectIndexes || [];
  state.baseRaw.l1 = snapshot.recentL1Windows || [];
  state.baseRaw.l0 = snapshot.recentSessions || [];
  state.baseRaw.profile = state.globalProfile.profileText ? [state.globalProfile] : [];
  syncBaseItems();
}

async function loadLevel(level, query = "") {
  const config = LEVEL_CONFIG[level];
  browserTitle.textContent = config.label;
  renderActiveNav();

  if (query.trim()) {
    const payload = await fetchJson(`${config.endpoint}?q=${encodeURIComponent(query)}&limit=40`);
    state.visibleItems = normalizeEntryList(level, payload || []);
  } else {
    state.visibleItems = state.baseItems[level] || [];
  }
  renderEntryList();
}

async function refreshDashboard(message = "已刷新", tone = "success") {
  setActivity("刷新中…");
  await loadSnapshot();
  await loadLevel(state.activeLevel, listQueryInput.value || "");
  setActivity(message, tone);
}

function renderRetrieveBlock(title, count, items) {
  const block = document.createElement("section");
  block.className = "retrieval-block";
  const head = document.createElement("div");
  head.className = "retrieval-head";
  head.innerHTML = `<strong>${title}</strong><span class="retrieval-count">${count}</span>`;
  block.append(head);
  if (!items.length) {
    block.append(createEmptyState("无结果"));
    return block;
  }
  const list = document.createElement("ul");
  list.className = "mini-list";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.append(li);
  });
  block.append(list);
  return block;
}

function renderRetrieveResult(data) {
  retrieveTimeline.innerHTML = "";
  retrieveSummary.textContent = `intent=${data.intent || "general"} · enoughAt=${data.enoughAt || "none"}`;
  retrieveResult.textContent = data.context || "";

  if (data.profile?.profileText) {
    retrieveTimeline.append(
      renderRetrieveBlock("全局画像", 1, [shortText(data.profile.profileText, 180)]),
    );
  }

  retrieveTimeline.append(
    renderRetrieveBlock(
      "L2",
      data.l2Results?.length ?? 0,
      (data.l2Results || []).map((item) => {
        if (item.level === "l2_time") return `${item.item.dateKey} · ${shortText(item.item.summary, 120)}`;
        return `${item.item.projectName} · ${shortText(item.item.latestProgress || item.item.summary, 120)}`;
      }),
    ),
    renderRetrieveBlock(
      "L1",
      data.l1Results?.length ?? 0,
      (data.l1Results || []).map((item) => `${item.item.timePeriod} · ${shortText(item.item.summary, 120)}`),
    ),
    renderRetrieveBlock(
      "L0",
      data.l0Results?.length ?? 0,
      (data.l0Results || []).map((item) => {
        const users = (item.item.messages || []).filter((message) => message.role === "user").map((message) => message.content);
        return `${formatTime(item.item.timestamp)} · ${shortText(users[users.length - 1] || "", 120)}`;
      }),
    ),
  );
}

async function runRetrieve() {
  const query = String(queryInput.value || "").trim();
  if (!query) {
    setActivity("请输入检索问题", "warning");
    return;
  }
  setActivity("检索中…");
  retrieveSummary.textContent = "检索中…";
  retrieveTimeline.innerHTML = "";
  retrieveResult.textContent = "";
  const data = await fetchJson(`./api/retrieve?q=${encodeURIComponent(query)}&limit=6`);
  renderRetrieveResult(data);
  setActivity("检索完成", "success");
}

async function saveSettings() {
  const payload = readSettingsForm();
  const settings = await postJson("./api/settings", payload);
  applySettings(settings);
  setActivity(`设置已保存 · 自动构建 ${settings.autoIndexIntervalMinutes} 分钟`, "success");
}

async function buildNow() {
  setActivity("构建中…");
  const stats = await postJson("./api/index/run");
  await refreshDashboard(
    `已构建 · L0 ${stats.l0Captured ?? 0} / L1 ${stats.l1Created ?? 0} / L2 时间 ${stats.l2TimeUpdated ?? 0} / L2 项目 ${stats.l2ProjectUpdated ?? 0} / 画像 ${stats.profileUpdated ?? 0}`,
    "success",
  );
}

async function clearMemory() {
  setActivity("清空并重建中…", "warning");
  await postJson("./api/clear");
  await refreshDashboard("已清空本地记忆", "warning");
}

async function searchCurrentLevel() {
  setActivity("搜索中…");
  await loadLevel(state.activeLevel, listQueryInput.value || "");
  setActivity("搜索完成", "success");
}

levelTabs.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest("[data-level]");
  if (!button) return;
  const level = button.getAttribute("data-level");
  if (!level || !LEVEL_CONFIG[level]) return;
  state.activeLevel = level;
  if (isNavDrawerLayout()) setNavOpen(false);
  await loadLevel(level, listQueryInput.value || "");
});

refreshBtn.addEventListener("click", () => {
  void refreshDashboard();
});

buildNowBtn.addEventListener("click", () => {
  void buildNow();
});

saveSettingsBtn.addEventListener("click", () => {
  void saveSettings();
});

clearMemoryBtn.addEventListener("click", () => {
  void clearMemory();
});

listSearchBtn.addEventListener("click", () => {
  void searchCurrentLevel();
});

listQueryInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void searchCurrentLevel();
  }
});

retrieveBtn.addEventListener("click", () => {
  void runRetrieve();
});

queryInput.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    void runRetrieve();
  }
});

settingsToggleBtn.addEventListener("click", () => togglePanel("settings"));
retrieveToggleBtn.addEventListener("click", () => togglePanel("retrieve"));
detailToggleBtn.addEventListener("click", () => togglePanel("detail"));
settingsCloseBtn.addEventListener("click", () => setPanel(null));
retrieveCloseBtn.addEventListener("click", () => setPanel(null));
detailCloseBtn.addEventListener("click", () => setPanel(null));
navToggleBtn.addEventListener("click", () => setNavOpen(true));
navCloseBtn.addEventListener("click", () => setNavOpen(false));
appScrim.addEventListener("click", () => closeTransientUi());
window.addEventListener("resize", () => {
  if (!isNavDrawerLayout()) setNavOpen(false);
});

async function bootstrap() {
  setActivity("加载中…");
  await loadSnapshot();
  await loadLevel(state.activeLevel);
  renderDetail();
  setActivity("已就绪", "success");
}

bootstrap().catch((error) => {
  console.error(error);
  setActivity(`加载失败：${String(error)}`, "danger");
});
