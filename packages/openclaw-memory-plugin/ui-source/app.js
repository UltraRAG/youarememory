/* ── i18n ────────────────────────────────────────────────── */

const LOCALES = {
  zh: {
    "nav.l1": "L1 窗口",
    "nav.l2_project": "L2 项目",
    "nav.l2_time": "L2 时间",
    "nav.l0": "L0 会话",
    "nav.profile": "全局画像",
    "nav.lastIndexed": "最近索引",
    "nav.waiting": "等待索引",
    "topbar.title": "记忆看板",
    "topbar.idle": "等待操作",
    "topbar.refresh": "刷新",
    "topbar.build": "立即构建",
    "topbar.overview": "概览",
    "topbar.settings": "设置",
    "topbar.retrieve": "检索",
    "topbar.detail": "详情",
    "overview.title": "运行概览",
    "overview.scrollHint": "固定高度 · 可滚动",
    "stream.searchPlaceholder": "搜索当前层级",
    "stream.search": "搜索",
    "stream.items": "{0} 条",
    "detail.title": "记录详情",
    "detail.empty": "选择左侧记录查看详情",
    "settings.title": "索引设置",
    "settings.mode": "推理模式",
    "settings.mode.help": "选择更快回答还是更深检索。",
    "settings.mode.answer_first": "回答优先",
    "settings.mode.accuracy_first": "准确优先",
    "settings.maxLatency": "最大可接受时延（毫秒）",
    "settings.save": "保存设置",
    "settings.clear": "清空并重建",
    "retrieve.title": "检索调试",
    "retrieve.placeholder": "输入问题，例如：这个项目最近进展到哪一步了？",
    "retrieve.run": "开始检索",
    "retrieve.notYet": "尚未检索",
    "retrieve.context": "上下文",
    "status.refreshing": "刷新中…",
    "status.refreshed": "已刷新",
    "status.building": "构建中…",
    "status.built": "已构建 · L0 {0} / L1 {1} / L2T {2} / L2P {3} / 画像 {4}",
    "status.clearing": "清空中…",
    "status.cleared": "已清空本地记忆",
    "status.searching": "搜索中…",
    "status.searched": "搜索完成",
    "status.retrieving": "检索中…",
    "status.retrieved": "检索完成",
    "status.loading": "加载中…",
    "status.ready": "已就绪",
    "status.loadFail": "加载失败：{0}",
    "status.queryRequired": "请输入检索问题",
    "status.settingsSaved": "设置已保存 · {0}",
    "status.pending": "待索引 {0} · 开放 {1}",
    "level.l1.label": "L1 话题窗口",
    "level.l2_project.label": "L2 项目",
    "level.l2_time.label": "L2 时间",
    "level.l0.label": "L0 会话",
    "level.profile.label": "全局画像",
    "level.l1.empty": "暂无 L1 记录",
    "level.l2_project.empty": "暂无 L2 项目索引",
    "level.l2_time.empty": "暂无 L2 时间索引",
    "level.l0.empty": "暂无 L0 会话",
    "level.profile.empty": "暂无全局画像",
    "detail.summary": "摘要",
    "detail.situation": "时间情景",
    "detail.projects": "项目",
    "detail.facts": "事实",
    "detail.sourceL0": "来源 L0",
    "detail.sourceWindows": "来源窗口",
    "detail.progress": "最近进展",
    "detail.messages": "消息流",
    "detail.profileSummary": "画像摘要",
    "detail.noSummary": "暂无摘要",
    "detail.noSituation": "暂无情景摘要",
    "detail.noProjects": "暂无项目",
    "detail.noFacts": "暂无事实",
    "detail.noProgress": "暂无进展",
    "detail.noProfile": "暂无画像摘要",
    "detail.noMessages": "暂无用户消息",
    "entry.unnamed.time": "未命名时间桶",
    "entry.unnamed.project": "未命名项目",
    "entry.unnamed.window": "未命名窗口",
    "entry.unnamed.session": "未命名会话",
    "entry.globalProfile": "全局画像",
    "project.planned": "计划中",
    "project.in_progress": "进行中",
    "project.blocked": "阻塞",
    "project.on_hold": "暂停",
    "project.done": "已完成",
    "project.unknown": "未知",
    "project.statusLabel": "状态：{0}",
    "meta.date": "日期",
    "meta.source": "来源",
    "meta.update": "更新",
    "meta.projectKey": "项目键",
    "meta.status": "状态",
    "meta.session": "Session",
    "meta.start": "开始",
    "meta.end": "结束",
    "meta.time": "时间",
    "meta.messages": "消息",
    "meta.l1Count": "{0} 条 L1",
    "meta.sourceCount": "来源 {0}",
    "meta.l0Count": "L0 {0}",
    "meta.projectCount": "项目 {0}",
    "meta.msgCount": "{0} 条",
    "retrieve.noResult": "无结果",
    "overview.queued": "排队 Session",
    "overview.recallMs": "最近召回",
    "overview.recallMode": "召回模式",
    "overview.reasoningMode": "推理模式",
    "overview.recallPath": "回答路径",
    "overview.budgetStop": "预算截停",
    "overview.shadowDeep": "后台备案",
    "overview.recallTimeouts": "召回超时",
    "overview.recallInjected": "已注入记忆",
    "overview.recallEnough": "命中层级",
    "overview.slotOwner": "Memory Slot",
    "overview.dynamicRuntime": "动态记忆运行时",
    "overview.workspaceBootstrap": "Workspace Bootstrap",
    "overview.runtimeIssues": "运行时问题",
    "recall.llm": "LLM 快选",
    "recall.local_fallback": "本地降级",
    "recall.none": "无注入",
    "recall.path.auto": "自动回答",
    "recall.path.explicit": "显式深检索",
    "recall.path.shadow": "后台备案命中",
    "reasoning.answer_first": "回答优先",
    "reasoning.accuracy_first": "准确优先",
    "boundary.healthy": "正常",
    "boundary.conflicted": "未就绪",
    "boundary.present": "已存在",
    "boundary.absent": "未检测",
    "boundary.injected": "是",
    "boundary.notInjected": "否",
    "boundary.cacheHit": "缓存命中",
    "boundary.cacheMiss": "实时计算",
    "boundary.budgetStopped": "已截停",
    "boundary.budgetNotStopped": "未截停",
    "boundary.shadowQueued": "已排队",
    "boundary.shadowNotQueued": "未排队",
    "boundary.ownerMissing": "未绑定",
    "boundary.noConflict": "无问题",
    "boundary.runtimeYouAreMemory": "YouAreMemory",
    "boundary.runtimeMisconfigured": "配置异常",
    "boundary.workspaceBootstrap": "这是 OpenClaw 宿主注入的静态 Project Context，不是插件冲突",
    "boundary.conflictMemoryCore": "memory-core 还没完全关闭",
    "boundary.conflictSessionHook": "session-memory hook 还没完全关闭",
    "boundary.conflictMemorySearch": "OpenClaw 原生 memorySearch 还没关闭",
    "boundary.conflictMemoryFlush": "OpenClaw 原生 memoryFlush 还没关闭",
    "boundary.conflictPromptInjection": "插件 prompt 注入被宿主配置禁用了",
    "boundary.conflictRecallDisabled": "插件 recallEnabled 被关闭了",
    "status.conflictsDetected": "检测到动态记忆运行时问题 {0} 项",
    "enough.l2": "L2",
    "enough.l1": "L1",
    "enough.l0": "L0",
    "enough.profile": "画像",
    "enough.none": "无",
  },
  en: {
    "nav.l1": "L1 Window",
    "nav.l2_project": "L2 Project",
    "nav.l2_time": "L2 Time",
    "nav.l0": "L0 Session",
    "nav.profile": "Profile",
    "nav.lastIndexed": "Last indexed",
    "nav.waiting": "Waiting",
    "topbar.title": "Memory Board",
    "topbar.idle": "Idle",
    "topbar.refresh": "Refresh",
    "topbar.build": "Build",
    "topbar.overview": "Overview",
    "topbar.settings": "Settings",
    "topbar.retrieve": "Retrieve",
    "topbar.detail": "Detail",
    "overview.title": "Runtime Overview",
    "overview.scrollHint": "Fixed height · Scrollable",
    "stream.searchPlaceholder": "Search current level",
    "stream.search": "Search",
    "stream.items": "{0} items",
    "detail.title": "Detail",
    "detail.empty": "Select a record to view details",
    "settings.title": "Index Settings",
    "settings.mode": "Reasoning mode",
    "settings.mode.help": "Choose faster replies or deeper memory retrieval.",
    "settings.mode.answer_first": "Answer first",
    "settings.mode.accuracy_first": "Accuracy first",
    "settings.maxLatency": "Max acceptable latency (ms)",
    "settings.save": "Save",
    "settings.clear": "Clear & Rebuild",
    "retrieve.title": "Retrieve Debug",
    "retrieve.placeholder": "Enter a question, e.g. What's the latest progress?",
    "retrieve.run": "Run",
    "retrieve.notYet": "Not yet retrieved",
    "retrieve.context": "Context",
    "status.refreshing": "Refreshing…",
    "status.refreshed": "Refreshed",
    "status.building": "Building…",
    "status.built": "Built · L0 {0} / L1 {1} / L2T {2} / L2P {3} / Profile {4}",
    "status.clearing": "Clearing…",
    "status.cleared": "Local memory cleared",
    "status.searching": "Searching…",
    "status.searched": "Search complete",
    "status.retrieving": "Retrieving…",
    "status.retrieved": "Retrieval complete",
    "status.loading": "Loading…",
    "status.ready": "Ready",
    "status.loadFail": "Load failed: {0}",
    "status.queryRequired": "Please enter a query",
    "status.settingsSaved": "Saved · {0}",
    "status.pending": "Pending {0} · Open {1}",
    "level.l1.label": "L1 Topic Window",
    "level.l2_project.label": "L2 Project",
    "level.l2_time.label": "L2 Time",
    "level.l0.label": "L0 Session",
    "level.profile.label": "Global Profile",
    "level.l1.empty": "No L1 records",
    "level.l2_project.empty": "No L2 project indexes",
    "level.l2_time.empty": "No L2 time indexes",
    "level.l0.empty": "No L0 sessions",
    "level.profile.empty": "No profile data",
    "detail.summary": "Summary",
    "detail.situation": "Situation",
    "detail.projects": "Projects",
    "detail.facts": "Facts",
    "detail.sourceL0": "Source L0",
    "detail.sourceWindows": "Source Windows",
    "detail.progress": "Latest Progress",
    "detail.messages": "Messages",
    "detail.profileSummary": "Profile Summary",
    "detail.noSummary": "No summary",
    "detail.noSituation": "No situation info",
    "detail.noProjects": "No projects",
    "detail.noFacts": "No facts",
    "detail.noProgress": "No progress",
    "detail.noProfile": "No profile summary",
    "detail.noMessages": "No user messages",
    "entry.unnamed.time": "Unnamed time bucket",
    "entry.unnamed.project": "Unnamed project",
    "entry.unnamed.window": "Unnamed window",
    "entry.unnamed.session": "Unnamed session",
    "entry.globalProfile": "Global Profile",
    "project.planned": "Planned",
    "project.in_progress": "In Progress",
    "project.blocked": "Blocked",
    "project.on_hold": "On Hold",
    "project.done": "Done",
    "project.unknown": "Unknown",
    "project.statusLabel": "Status: {0}",
    "meta.date": "Date",
    "meta.source": "Source",
    "meta.update": "Updated",
    "meta.projectKey": "Project Key",
    "meta.status": "Status",
    "meta.session": "Session",
    "meta.start": "Start",
    "meta.end": "End",
    "meta.time": "Time",
    "meta.messages": "Messages",
    "meta.l1Count": "{0} L1",
    "meta.sourceCount": "Source {0}",
    "meta.l0Count": "L0 {0}",
    "meta.projectCount": "Projects {0}",
    "meta.msgCount": "{0} msgs",
    "retrieve.noResult": "No results",
    "overview.queued": "Queued Sessions",
    "overview.recallMs": "Last Recall",
    "overview.recallMode": "Recall Mode",
    "overview.reasoningMode": "Reasoning Mode",
    "overview.recallPath": "Reply Path",
    "overview.budgetStop": "Budget Stop",
    "overview.shadowDeep": "Shadow Deep",
    "overview.recallTimeouts": "Recall Timeouts",
    "overview.recallInjected": "Memory Injected",
    "overview.recallEnough": "Enough At",
    "overview.slotOwner": "Memory Slot",
    "overview.dynamicRuntime": "Dynamic Memory Runtime",
    "overview.workspaceBootstrap": "Workspace Bootstrap",
    "overview.runtimeIssues": "Runtime Issues",
    "recall.llm": "LLM Fast Path",
    "recall.local_fallback": "Local Fallback",
    "recall.none": "No Memory",
    "recall.path.auto": "Auto reply",
    "recall.path.explicit": "Explicit deep recall",
    "recall.path.shadow": "Shadow cache hit",
    "reasoning.answer_first": "Answer first",
    "reasoning.accuracy_first": "Accuracy first",
    "boundary.healthy": "Healthy",
    "boundary.conflicted": "Misconfigured",
    "boundary.present": "Present",
    "boundary.absent": "Absent",
    "boundary.injected": "Yes",
    "boundary.notInjected": "No",
    "boundary.cacheHit": "Cache hit",
    "boundary.cacheMiss": "Live",
    "boundary.budgetStopped": "Stopped",
    "boundary.budgetNotStopped": "Not stopped",
    "boundary.shadowQueued": "Queued",
    "boundary.shadowNotQueued": "Not queued",
    "boundary.ownerMissing": "Unbound",
    "boundary.noConflict": "No issues",
    "boundary.runtimeYouAreMemory": "YouAreMemory",
    "boundary.runtimeMisconfigured": "Misconfigured",
    "boundary.workspaceBootstrap": "This is OpenClaw host Project Context, not a plugin conflict",
    "boundary.conflictMemoryCore": "memory-core is still enabled somewhere",
    "boundary.conflictSessionHook": "session-memory hook is still enabled somewhere",
    "boundary.conflictMemorySearch": "Native memorySearch is still enabled somewhere",
    "boundary.conflictMemoryFlush": "Native memoryFlush is still enabled somewhere",
    "boundary.conflictPromptInjection": "Prompt injection is disabled for the plugin",
    "boundary.conflictRecallDisabled": "Plugin recallEnabled is disabled",
    "status.conflictsDetected": "Detected {0} dynamic-memory runtime issues",
    "enough.l2": "L2",
    "enough.l1": "L1",
    "enough.l0": "L0",
    "enough.profile": "Profile",
    "enough.none": "None",
  },
};

let currentLocale = localStorage.getItem("ym-locale") || "zh";

function t(key, ...args) {
  const dict = LOCALES[currentLocale] || LOCALES.zh;
  let str = dict[key] ?? LOCALES.zh[key] ?? key;
  for (let i = 0; i < args.length; i++) {
    str = str.replace(`{${i}}`, args[i]);
  }
  return str;
}

function translatePage() {
  document.documentElement.lang = currentLocale === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const attr = el.getAttribute("data-i18n-attr");
    if (attr) {
      el[attr] = t(key);
    } else {
      el.textContent = t(key);
    }
  });
  updateLangDropdown();
}

function updateLangDropdown() {
  const labels = { zh: "简体中文", en: "English" };
  if (langCurrentLabel) langCurrentLabel.textContent = labels[currentLocale] || labels.zh;
  document.querySelectorAll(".lang-option").forEach((opt) => {
    opt.classList.toggle("active", opt.dataset.locale === currentLocale);
  });
}

function setLocale(locale) {
  currentLocale = locale;
  localStorage.setItem("ym-locale", locale);
  translatePage();
  refreshRenderedContent();
}

/* ── Theme ───────────────────────────────────────────────── */

function getEffectiveTheme(pref) {
  if (pref === "auto") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

function applyTheme(pref) {
  localStorage.setItem("ym-theme", pref);
  const effective = getEffectiveTheme(pref);
  document.documentElement.dataset.theme = effective;
  document.querySelectorAll("#themeToggle button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themeValue === pref);
  });
}

function initTheme() {
  const pref = localStorage.getItem("ym-theme") || "light";
  applyTheme(pref);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const current = localStorage.getItem("ym-theme") || "light";
    if (current === "auto") applyTheme("auto");
  });
}

/* ── DOM refs ────────────────────────────────────────────── */

const $ = (sel) => document.querySelector(sel);

const appScrim = $("#appScrim");
const navRail = $("#navRail");
const navToggleBtn = $("#navToggleBtn");
const navCloseBtn = $("#navCloseBtn");
const levelTabs = $("#levelTabs");
const navLastIndexed = $("#navLastIndexed");

const statusPill = $("#statusPill");
const activityText = $("#activityText");
const overviewToggleBtn = $("#overviewToggleBtn");
const overviewCloseBtn = $("#overviewCloseBtn");
const overviewCards = $("#overviewCards");
const overviewScroll = $("#overviewScroll");
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
const reasoningModeInput = $("#reasoningModeInput");
const maxAutoReplyLatencyInput = $("#maxAutoReplyLatencyInput");
const latencyFieldWrap = $("#latencyFieldWrap");

const retrievePanel = $("#retrievePanel");
const retrieveCloseBtn = $("#retrieveCloseBtn");
const queryInput = $("#queryInput");
const retrieveBtn = $("#retrieveBtn");
const retrieveSummary = $("#retrieveSummary");
const retrieveTimeline = $("#retrieveTimeline");
const retrieveResult = $("#retrieveResult");

const themeToggle = $("#themeToggle");
const langDropdown = $("#langDropdown");
const langTrigger = $("#langTrigger");
const langCurrentLabel = $("#langCurrentLabel");
const langMenu = $("#langMenu");

/* ── Level config ────────────────────────────────────────── */

const LEVEL_KEYS = ["l1", "l2_project", "l2_time", "l0", "profile"];

function getLevelConfig(level) {
  const endpoints = {
    l1: "./api/l1",
    l2_project: "./api/l2/project",
    l2_time: "./api/l2/time",
    l0: "./api/l0",
    profile: "./api/profile",
  };
  return {
    label: t(`level.${level}.label`),
    endpoint: endpoints[level],
    emptyText: t(`level.${level}.empty`),
  };
}

const OVERVIEW_KEYS = {
  l1: "totalL1",
  l2_project: "totalL2Project",
  l2_time: "totalL2Time",
  l0: "totalL0",
  profile: "totalProfiles",
};

function formatStatus(value) {
  return t(`project.${value}`) || value || "-";
}

/* ── State ───────────────────────────────────────────────── */

const state = {
  activeLevel: "l1",
  activePanel: null,
  overview: {},
  settings: {
    reasoningMode: "answer_first",
    maxAutoReplyLatencyMs: 1800,
  },
  globalProfile: { recordId: "global_profile_record", profileText: "", sourceL1Ids: [], createdAt: "", updatedAt: "" },
  baseRaw: { l2_time: [], l2_project: [], l1: [], l0: [], profile: [] },
  baseItems: { l2_time: [], l2_project: [], l1: [], l0: [], profile: [] },
  visibleItems: [],
  selectedIndex: -1,
};

/* ── Helpers ──────────────────────────────────────────────── */

function shortText(value, max = 140) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function formatTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const locale = currentLocale === "en" ? "en-US" : "zh-CN";
  return parsed.toLocaleString(locale, { hour12: false });
}

function getOverviewCount(level) {
  return Number(state.overview?.[OVERVIEW_KEYS[level]] ?? 0);
}

/* ── Panel / nav state ───────────────────────────────────── */

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
  if (open) document.body.dataset.nav = "open";
  else delete document.body.dataset.nav;
}

function isNavDrawerLayout() {
  return window.matchMedia("(max-width: 960px)").matches;
}

function closeTransientUi() {
  setPanel(null);
  setNavOpen(false);
}

function setActivity(key, tone = "idle", ...args) {
  activityText.textContent = t(key, ...args);
  activityText.dataset.tone = tone;
}

/* ── Status pill ─────────────────────────────────────────── */

function updateStatusPill(overview = {}) {
  const pending = Number(overview.pendingL0 ?? 0);
  const openTopics = Number(overview.openTopics ?? 0);
  const lastIndexed = overview.lastIndexedAt ? formatTime(overview.lastIndexedAt) : t("nav.waiting");
  const conflictCount = Array.isArray(overview.runtimeIssues) ? overview.runtimeIssues.length : 0;
  if (conflictCount > 0) {
    statusPill.textContent = t("status.conflictsDetected", conflictCount);
    statusPill.dataset.tone = "warning";
  } else {
    statusPill.textContent = pending > 0
      ? t("status.pending", pending, openTopics)
      : lastIndexed;
    statusPill.dataset.tone = pending > 0 ? "pending" : "ready";
  }
  navLastIndexed.textContent = lastIndexed;
}

function formatConflictSummary(conflict) {
  const text = String(conflict || "");
  if (!text) return t("boundary.noConflict");
  if (text.includes("allowPromptInjection")) return t("boundary.conflictPromptInjection");
  if (text.includes("recallEnabled=false")) return t("boundary.conflictRecallDisabled");
  if (text.includes("plugins.entries.memory-core.enabled")) return t("boundary.conflictMemoryCore");
  if (text.includes("session-memory")) return t("boundary.conflictSessionHook");
  if (text.includes("memorySearch")) return t("boundary.conflictMemorySearch");
  if (text.includes("memoryFlush")) return t("boundary.conflictMemoryFlush");
  return text;
}

/* ── Overview ────────────────────────────────────────────── */

function createMetricCard(label, value, note, tone = "default") {
  const card = document.createElement("section");
  card.className = "metric-card";
  card.dataset.tone = tone;

  const lbl = document.createElement("div");
  lbl.className = "metric-label";
  lbl.textContent = label;

  const val = document.createElement("div");
  val.className = "metric-value";
  val.textContent = String(value ?? 0);

  const nt = document.createElement("div");
  nt.className = "metric-note";
  nt.textContent = note;

  card.append(lbl, val, nt);
  return card;
}

function renderOverview(overview = {}) {
  state.overview = overview || {};
  updateStatusPill(state.overview);
  overviewCards.innerHTML = "";
  const runtimeIssues = Array.isArray(overview.runtimeIssues)
    ? overview.runtimeIssues.filter(Boolean)
    : [];
  const memoryRuntimeHealthy = Boolean(overview.memoryRuntimeHealthy);
  const slotOwner = String(overview.slotOwner || "").trim();
  const dynamicMemoryRuntime = String(overview.dynamicMemoryRuntime || "").trim();
  const workspaceBootstrapPresent = Boolean(overview.workspaceBootstrapPresent);
  const lastRecallInjected = Boolean(overview.lastRecallInjected);
  const lastRecallEnoughAt = overview.lastRecallEnoughAt || "none";
  const lastRecallCacheHit = Boolean(overview.lastRecallCacheHit);
  const lastRecallPath = overview.lastRecallPath || "explicit";
  const currentReasoningMode = overview.currentReasoningMode || state.settings.reasoningMode || "answer_first";
  const lastRecallBudgetLimited = Boolean(overview.lastRecallBudgetLimited);
  const lastShadowDeepQueued = Boolean(overview.lastShadowDeepQueued);
  const primaryConflict = formatConflictSummary(runtimeIssues[0]);
  overviewCards.append(
    createMetricCard("L0", overview.totalL0 ?? 0, t("nav.l0")),
    createMetricCard(t("status.pending", "", "").split("·")[0].trim() || "Pending", overview.pendingL0 ?? 0, ""),
    createMetricCard(t("overview.queued"), overview.queuedSessions ?? 0, ""),
    createMetricCard("L1", overview.totalL1 ?? 0, t("nav.l1")),
    createMetricCard("L2T", overview.totalL2Time ?? 0, t("nav.l2_time")),
    createMetricCard("L2P", overview.totalL2Project ?? 0, t("nav.l2_project")),
    createMetricCard(t("nav.profile"), overview.totalProfiles ?? 0, overview.lastIndexedAt ? "✓" : "–"),
    createMetricCard(t("overview.reasoningMode"), t(`reasoning.${currentReasoningMode}`), ""),
    createMetricCard(t("overview.recallMs"), overview.lastRecallMs ?? 0, "ms"),
    createMetricCard(t("overview.recallMode"), t(`recall.${overview.lastRecallMode || "none"}`), ""),
    createMetricCard(t("overview.recallPath"), t(`recall.path.${lastRecallPath}`), ""),
    createMetricCard(
      t("overview.budgetStop"),
      lastRecallBudgetLimited ? t("boundary.budgetStopped") : t("boundary.budgetNotStopped"),
      "",
      lastRecallBudgetLimited ? "warning" : "default",
    ),
    createMetricCard(
      t("overview.shadowDeep"),
      lastShadowDeepQueued ? t("boundary.shadowQueued") : t("boundary.shadowNotQueued"),
      "",
      lastShadowDeepQueued ? "warning" : "default",
    ),
    createMetricCard(t("overview.recallTimeouts"), overview.recallTimeouts ?? 0, ""),
    createMetricCard(
      t("overview.recallInjected"),
      lastRecallInjected ? t("boundary.injected") : t("boundary.notInjected"),
      lastRecallCacheHit ? t("boundary.cacheHit") : t("boundary.cacheMiss"),
      lastRecallInjected ? "success" : "default",
    ),
    createMetricCard(
      t("overview.recallEnough"),
      t(`enough.${lastRecallEnoughAt}`),
      "",
    ),
    createMetricCard(
      t("overview.slotOwner"),
      slotOwner || t("boundary.ownerMissing"),
      memoryRuntimeHealthy ? t("boundary.healthy") : t("boundary.conflicted"),
      memoryRuntimeHealthy ? "success" : "danger",
    ),
    createMetricCard(
      t("overview.dynamicRuntime"),
      dynamicMemoryRuntime || t("boundary.runtimeMisconfigured"),
      memoryRuntimeHealthy ? t("boundary.runtimeYouAreMemory") : primaryConflict,
      memoryRuntimeHealthy ? "success" : "danger",
    ),
    createMetricCard(
      t("overview.workspaceBootstrap"),
      workspaceBootstrapPresent ? t("boundary.present") : t("boundary.absent"),
      workspaceBootstrapPresent ? t("boundary.workspaceBootstrap") : "",
      "default",
    ),
    createMetricCard(
      t("overview.runtimeIssues"),
      runtimeIssues.length,
      primaryConflict,
      runtimeIssues.length > 0 ? "danger" : "default",
    ),
  );
  if (overviewScroll) {
    overviewScroll.scrollTop = 0;
  }
  renderNavCounts();
}

/* ── Settings ────────────────────────────────────────────── */

function applySettings(settings = {}) {
  state.settings = {
    reasoningMode: "answer_first",
    maxAutoReplyLatencyMs: 1800,
    ...(settings || {}),
  };
  reasoningModeInput.value = state.settings.reasoningMode || "answer_first";
  maxAutoReplyLatencyInput.value = String(state.settings.maxAutoReplyLatencyMs ?? 1800);
  updateSettingsVisibility();
}

function readSettingsForm() {
  const parsedLatency = Number.parseInt(String(maxAutoReplyLatencyInput.value || "").trim(), 10);
  const reasoningMode = reasoningModeInput.value === "accuracy_first" ? "accuracy_first" : "answer_first";
  return {
    reasoningMode,
    maxAutoReplyLatencyMs: Number.isFinite(parsedLatency)
      ? Math.max(300, parsedLatency)
      : state.settings.maxAutoReplyLatencyMs,
  };
}

function updateSettingsVisibility() {
  const answerFirst = (reasoningModeInput?.value || state.settings.reasoningMode) === "answer_first";
  if (latencyFieldWrap) {
    latencyFieldWrap.hidden = !answerFirst;
  }
}

/* ── Nav counts ──────────────────────────────────────────── */

function renderNavCounts() {
  levelTabs.querySelectorAll("[data-count-for]").forEach((node) => {
    const level = node.getAttribute("data-count-for");
    if (level) node.textContent = String(getOverviewCount(level));
  });
}

/* ── Entry normalization ─────────────────────────────────── */

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
      level, id: getRawId(level, raw), badge: "time",
      title: raw.dateKey || t("entry.unnamed.time"),
      subtitle: raw.summary || t("detail.noSummary"),
      meta: `L1 ${raw.l1Source?.length ?? 0} · ${formatTime(raw.updatedAt)}`,
      raw,
    };
  }

  if (level === "l2_project") {
    return {
      level, id: getRawId(level, raw), badge: formatStatus(raw.currentStatus),
      title: raw.projectName || t("entry.unnamed.project"),
      subtitle: raw.latestProgress || raw.summary || t("detail.noProgress"),
      meta: `${t("meta.sourceCount", raw.l1Source?.length ?? 0)} · ${formatTime(raw.updatedAt)}`,
      raw,
    };
  }

  if (level === "l1") {
    return {
      level, id: getRawId(level, raw), badge: "topic",
      title: raw.timePeriod || t("entry.unnamed.window"),
      subtitle: raw.summary || t("detail.noSummary"),
      meta: `${t("meta.l0Count", raw.l0Source?.length ?? 0)} · ${t("meta.projectCount", raw.projectDetails?.length ?? 0)}`,
      raw,
    };
  }

  if (level === "l0") {
    const userMsgs = (raw.messages || []).filter((m) => m.role === "user").map((m) => m.content);
    return {
      level, id: getRawId(level, raw), badge: "raw",
      title: raw.sessionKey || t("entry.unnamed.session"),
      subtitle: shortText(userMsgs[userMsgs.length - 1] || t("detail.noMessages"), 180),
      meta: formatTime(raw.timestamp),
      raw,
    };
  }

  if (level === "profile") {
    return {
      level, id: getRawId(level, raw), badge: "profile",
      title: t("entry.globalProfile"),
      subtitle: raw.profileText || t("detail.noProfile"),
      meta: `L1 ${raw.sourceL1Ids?.length ?? 0} · ${formatTime(raw.updatedAt)}`,
      raw,
    };
  }

  return null;
}

function normalizeEntryList(level, raws = []) {
  return (raws || []).map((r) => normalizeEntry(level, r)).filter(Boolean);
}

/* ── Empty state ─────────────────────────────────────────── */

function createEmptyState(text) {
  const el = document.createElement("div");
  el.className = "empty-state";
  el.textContent = text;
  return el;
}

/* ── Entry list render ───────────────────────────────────── */

function renderEntryList() {
  entryList.innerHTML = "";
  const config = getLevelConfig(state.activeLevel);
  if (state.visibleItems.length === 0) {
    entryList.append(createEmptyState(config.emptyText));
    state.selectedIndex = -1;
    renderDetail();
    browserMeta.textContent = "0";
    return;
  }

  browserMeta.textContent = t("stream.items", state.visibleItems.length);
  if (state.selectedIndex < 0 || state.selectedIndex >= state.visibleItems.length) {
    state.selectedIndex = 0;
  }

  state.visibleItems.forEach((item, idx) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "entry-card";
    if (idx === state.selectedIndex) btn.classList.add("active");

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

    btn.append(topline, subtitle, meta);
    btn.addEventListener("click", () => {
      state.selectedIndex = idx;
      renderEntryList();
      renderDetail();
      setPanel("detail");
      if (isNavDrawerLayout()) setNavOpen(false);
    });
    li.append(btn);
    entryList.append(li);
  });

  renderDetail();
}

/* ── Detail render helpers ───────────────────────────────── */

function createMetaChip(label, value) {
  const chip = document.createElement("span");
  chip.className = "meta-chip";
  const lbl = document.createElement("span");
  lbl.className = "meta-label";
  lbl.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  chip.append(lbl, strong);
  return chip;
}

function createDetailSection(title, body) {
  const section = document.createElement("section");
  section.className = "detail-section";
  const h = document.createElement("h4");
  h.textContent = title;
  section.append(h);
  if (typeof body === "string") {
    const p = document.createElement("p");
    p.textContent = body;
    section.append(p);
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
  projects.forEach((proj) => {
    const card = document.createElement("div");
    card.className = "project-card";
    const title = document.createElement("strong");
    title.textContent = proj.name || t("entry.unnamed.project");
    const status = document.createElement("p");
    status.textContent = t("project.statusLabel", formatStatus(proj.status));
    const summary = document.createElement("p");
    summary.textContent = proj.summary || t("detail.noSummary");
    card.append(title, status, summary);
    if (proj.latestProgress) {
      const progress = document.createElement("p");
      progress.textContent = proj.latestProgress;
      card.append(progress);
    }
    stack.append(card);
  });
  return stack;
}

function createMessageList(messages = []) {
  const list = document.createElement("div");
  list.className = "message-list";
  messages.forEach((msg) => {
    const item = document.createElement("div");
    const roleClass = msg.role === "user" ? " is-user" : msg.role === "assistant" ? " is-assistant" : "";
    item.className = `message-item${roleClass}`;
    const role = document.createElement("div");
    role.className = "message-role";
    role.textContent = msg.role;
    const content = document.createElement("p");
    content.className = "message-content";
    content.textContent = msg.content || "";
    item.append(role, content);
    list.append(item);
  });
  return list;
}

/* ── Detail render ───────────────────────────────────────── */

function renderDetail() {
  detailMeta.innerHTML = "";
  detailBody.innerHTML = "";

  const entry = state.visibleItems[state.selectedIndex];
  if (!entry) {
    detailTitle.textContent = t("detail.title");
    detailBody.append(createEmptyState(t("detail.empty")));
    return;
  }

  const { level, raw } = entry;
  detailTitle.textContent = entry.title;

  if (level === "l2_time") {
    detailMeta.append(
      createMetaChip(t("meta.date"), raw.dateKey || "-"),
      createMetaChip(t("meta.source"), t("meta.l1Count", raw.l1Source?.length ?? 0)),
      createMetaChip(t("meta.update"), formatTime(raw.updatedAt)),
    );
    detailBody.append(
      createDetailSection(t("detail.summary"), raw.summary || t("detail.noSummary")),
      createDetailSection(t("detail.sourceWindows"), createTagList(raw.l1Source || [])),
    );
    return;
  }

  if (level === "l2_project") {
    detailMeta.append(
      createMetaChip(t("meta.projectKey"), raw.projectKey || "-"),
      createMetaChip(t("meta.status"), formatStatus(raw.currentStatus)),
      createMetaChip(t("meta.update"), formatTime(raw.updatedAt)),
    );
    detailBody.append(
      createDetailSection(t("detail.summary"), raw.summary || t("detail.noSummary")),
      createDetailSection(t("detail.progress"), raw.latestProgress || t("detail.noProgress")),
      createDetailSection(t("detail.sourceWindows"), createTagList(raw.l1Source || [])),
    );
    return;
  }

  if (level === "l1") {
    detailMeta.append(
      createMetaChip(t("meta.session"), raw.sessionKey || "-"),
      createMetaChip(t("meta.start"), formatTime(raw.startedAt)),
      createMetaChip(t("meta.end"), formatTime(raw.endedAt)),
    );
    detailBody.append(
      createDetailSection(t("detail.summary"), raw.summary || t("detail.noSummary")),
      createDetailSection(t("detail.situation"), raw.situationTimeInfo || t("detail.noSituation")),
      createDetailSection(t("detail.projects"), raw.projectDetails?.length ? createProjectStack(raw.projectDetails) : t("detail.noProjects")),
      createDetailSection(
        t("detail.facts"),
        raw.facts?.length ? createTagList(raw.facts.map((f) => `${f.factKey}: ${f.factValue}`)) : t("detail.noFacts"),
      ),
      createDetailSection(t("detail.sourceL0"), createTagList(raw.l0Source || [])),
    );
    return;
  }

  if (level === "l0") {
    detailMeta.append(
      createMetaChip(t("meta.session"), raw.sessionKey || "-"),
      createMetaChip(t("meta.time"), formatTime(raw.timestamp)),
      createMetaChip(t("meta.messages"), t("meta.msgCount", raw.messages?.length ?? 0)),
    );
    detailBody.append(
      createDetailSection(t("detail.messages"), createMessageList(raw.messages || [])),
    );
    return;
  }

  if (level === "profile") {
    detailMeta.append(
      createMetaChip(t("meta.source"), t("meta.l1Count", raw.sourceL1Ids?.length ?? 0)),
      createMetaChip(t("meta.update"), formatTime(raw.updatedAt)),
    );
    detailBody.append(
      createDetailSection(t("detail.profileSummary"), raw.profileText || t("detail.noProfile")),
      createDetailSection(t("detail.sourceWindows"), createTagList(raw.sourceL1Ids || [])),
    );
  }
}

/* ── Nav ─────────────────────────────────────────────────── */

function renderActiveNav() {
  levelTabs.querySelectorAll("[data-level]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-level") === state.activeLevel);
  });
}

/* ── API ─────────────────────────────────────────────────── */

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/* ── Data loading ────────────────────────────────────────── */

function syncBaseItems() {
  for (const level of Object.keys(state.baseRaw)) {
    state.baseItems[level] = normalizeEntryList(level, state.baseRaw[level]);
  }
}

async function loadSnapshot() {
  const snap = await fetchJson("./api/snapshot?limit=24");
  renderOverview(snap.overview || {});
  applySettings(snap.settings || {});
  state.globalProfile = snap.globalProfile || state.globalProfile;
  state.baseRaw.l2_time = snap.recentTimeIndexes || [];
  state.baseRaw.l2_project = snap.recentProjectIndexes || [];
  state.baseRaw.l1 = snap.recentL1Windows || [];
  state.baseRaw.l0 = snap.recentSessions || [];
  state.baseRaw.profile = state.globalProfile.profileText ? [state.globalProfile] : [];
  syncBaseItems();
}

async function loadLevel(level, query = "") {
  const config = getLevelConfig(level);
  browserTitle.textContent = config.label;
  renderActiveNav();

  if (query.trim()) {
    const data = await fetchJson(`${config.endpoint}?q=${encodeURIComponent(query)}&limit=40`);
    state.visibleItems = normalizeEntryList(level, data || []);
  } else {
    state.visibleItems = state.baseItems[level] || [];
  }
  renderEntryList();
}

async function refreshDashboard(msgKey = "status.refreshed", tone = "success", ...args) {
  setActivity("status.refreshing");
  await loadSnapshot();
  await loadLevel(state.activeLevel, listQueryInput.value || "");
  setActivity(msgKey, tone, ...args);
}

function refreshRenderedContent() {
  renderOverview(state.overview);
  const config = getLevelConfig(state.activeLevel);
  browserTitle.textContent = config.label;
  syncBaseItems();
  if (!listQueryInput.value.trim()) {
    state.visibleItems = state.baseItems[state.activeLevel] || [];
  }
  renderEntryList();
}

/* ── Retrieve ────────────────────────────────────────────── */

function renderRetrieveBlock(title, count, items) {
  const block = document.createElement("section");
  block.className = "retrieval-block";
  const head = document.createElement("div");
  head.className = "retrieval-head";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const countEl = document.createElement("span");
  countEl.className = "retrieval-count";
  countEl.textContent = count;
  head.append(strong, countEl);
  block.append(head);
  if (!items.length) {
    block.append(createEmptyState(t("retrieve.noResult")));
    return block;
  }
  const list = document.createElement("ul");
  list.className = "mini-list";
  items.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    list.append(li);
  });
  block.append(list);
  return block;
}

function renderRetrieveResult(data) {
  retrieveTimeline.innerHTML = "";
  const debugBits = data.debug
    ? ` · mode=${data.debug.mode} · path=${data.debug.path || "explicit"} · ${data.debug.elapsedMs}ms${data.debug.cacheHit ? " · cache" : ""}${data.debug.budgetLimited ? " · budget" : ""}`
    : "";
  retrieveSummary.textContent = `intent=${data.intent || "general"} · enoughAt=${data.enoughAt || "none"}${debugBits}`;
  retrieveResult.textContent = data.context || "";

  if (data.profile?.profileText) {
    retrieveTimeline.append(
      renderRetrieveBlock(t("nav.profile"), 1, [shortText(data.profile.profileText, 180)]),
    );
  }

  retrieveTimeline.append(
    renderRetrieveBlock("L2", data.l2Results?.length ?? 0,
      (data.l2Results || []).map((r) =>
        r.level === "l2_time"
          ? `${r.item.dateKey} · ${shortText(r.item.summary, 120)}`
          : `${r.item.projectName} · ${shortText(r.item.latestProgress || r.item.summary, 120)}`)),
    renderRetrieveBlock("L1", data.l1Results?.length ?? 0,
      (data.l1Results || []).map((r) => `${r.item.timePeriod} · ${shortText(r.item.summary, 120)}`)),
    renderRetrieveBlock("L0", data.l0Results?.length ?? 0,
      (data.l0Results || []).map((r) => {
        const users = (r.item.messages || []).filter((m) => m.role === "user").map((m) => m.content);
        return `${formatTime(r.item.timestamp)} · ${shortText(users[users.length - 1] || "", 120)}`;
      })),
  );
}

/* ── Actions ─────────────────────────────────────────────── */

async function runRetrieve() {
  const query = String(queryInput.value || "").trim();
  if (!query) { setActivity("status.queryRequired", "warning"); return; }
  setActivity("status.retrieving");
  retrieveSummary.textContent = "…";
  retrieveTimeline.innerHTML = "";
  retrieveResult.textContent = "";
  const data = await fetchJson(`./api/retrieve?q=${encodeURIComponent(query)}&limit=6`);
  renderRetrieveResult(data);
  setActivity("status.retrieved", "success");
}

async function saveSettings() {
  const payload = readSettingsForm();
  const settings = await postJson("./api/settings", payload);
  applySettings(settings);
  const modeLabel = t(`reasoning.${settings.reasoningMode || "answer_first"}`);
  const summary = settings.reasoningMode === "answer_first"
    ? `${modeLabel} · ${settings.maxAutoReplyLatencyMs}ms`
    : modeLabel;
  setActivity("status.settingsSaved", "success", summary);
}

async function buildNow() {
  setActivity("status.building");
  const s = await postJson("./api/index/run");
  await refreshDashboard("status.built", "success", s.l0Captured ?? 0, s.l1Created ?? 0, s.l2TimeUpdated ?? 0, s.l2ProjectUpdated ?? 0, s.profileUpdated ?? 0);
}

async function clearMemory() {
  setActivity("status.clearing", "warning");
  await postJson("./api/clear");
  await refreshDashboard("status.cleared", "warning");
}

async function searchCurrentLevel() {
  setActivity("status.searching");
  await loadLevel(state.activeLevel, listQueryInput.value || "");
  setActivity("status.searched", "success");
}

/* ── Event listeners ─────────────────────────────────────── */

levelTabs.addEventListener("click", async (e) => {
  const btn = e.target instanceof Element ? e.target.closest("[data-level]") : null;
  if (!btn) return;
  const level = btn.getAttribute("data-level");
  if (!level || !LEVEL_KEYS.includes(level)) return;
  state.activeLevel = level;
  if (isNavDrawerLayout()) setNavOpen(false);
  await loadLevel(level, listQueryInput.value || "");
});

refreshBtn.addEventListener("click", () => void refreshDashboard());
buildNowBtn.addEventListener("click", () => void buildNow());
overviewToggleBtn.addEventListener("click", () => togglePanel("overview"));
saveSettingsBtn.addEventListener("click", () => void saveSettings());
clearMemoryBtn.addEventListener("click", () => void clearMemory());
listSearchBtn.addEventListener("click", () => void searchCurrentLevel());
listQueryInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); void searchCurrentLevel(); } });
retrieveBtn.addEventListener("click", () => void runRetrieve());
queryInput.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void runRetrieve(); } });

settingsToggleBtn.addEventListener("click", () => togglePanel("settings"));
retrieveToggleBtn.addEventListener("click", () => togglePanel("retrieve"));
detailToggleBtn.addEventListener("click", () => togglePanel("detail"));
reasoningModeInput.addEventListener("change", () => updateSettingsVisibility());
overviewCloseBtn.addEventListener("click", () => setPanel(null));
settingsCloseBtn.addEventListener("click", () => setPanel(null));
retrieveCloseBtn.addEventListener("click", () => setPanel(null));
detailCloseBtn.addEventListener("click", () => setPanel(null));
navToggleBtn.addEventListener("click", () => setNavOpen(true));
navCloseBtn.addEventListener("click", () => setNavOpen(false));
appScrim.addEventListener("click", () => closeTransientUi());
window.addEventListener("resize", () => { if (!isNavDrawerLayout()) setNavOpen(false); });

themeToggle.addEventListener("click", (e) => {
  const btn = e.target instanceof Element ? e.target.closest("[data-theme-value]") : null;
  if (btn) applyTheme(btn.dataset.themeValue);
});

langTrigger.addEventListener("click", (e) => {
  e.stopPropagation();
  langDropdown.classList.toggle("open");
});

langMenu.addEventListener("click", (e) => {
  const opt = e.target instanceof Element ? e.target.closest("[data-locale]") : null;
  if (!opt) return;
  langDropdown.classList.remove("open");
  setLocale(opt.dataset.locale);
});

document.addEventListener("click", (e) => {
  if (langDropdown && !langDropdown.contains(e.target)) {
    langDropdown.classList.remove("open");
  }
});

/* ── Bootstrap ───────────────────────────────────────────── */

async function bootstrap() {
  initTheme();
  translatePage();
  setActivity("status.loading");
  await loadSnapshot();
  await loadLevel(state.activeLevel);
  renderDetail();
  if ((state.overview.runtimeIssues || []).length > 0) {
    setActivity("status.conflictsDetected", "warning", state.overview.runtimeIssues.length);
  } else {
    setActivity("status.ready", "success");
  }
}

bootstrap().catch((err) => {
  console.error(err);
  setActivity("status.loadFail", "danger", String(err));
});
