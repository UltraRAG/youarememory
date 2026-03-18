import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PLUGIN_ID = "clawxmemory-openclaw";
const LEGACY_PLUGIN_ID = "youarememory-openclaw";
const WORKSPACE_NAME = "@clawxmemory/clawxmemory-openclaw";
const DEFAULT_DATA_DIR = path.join(os.homedir(), ".openclaw", "clawxmemory");
const LEGACY_DEFAULT_DATA_DIR = path.join(os.homedir(), ".openclaw", "youarememory");
const DEFAULT_UI_PATH_PREFIX = "/clawxmemory";
const LEGACY_UI_PATH_PREFIX = "/youarememory";
const RESTART_TIMEOUT_MS = process.platform === "win32" ? 15_000 : 8_000;
const RESTART_KILL_GRACE_MS = 1_000;
const HEALTH_TIMEOUT_MS = process.platform === "win32" ? 45_000 : 20_000;
const HEALTH_POLL_MS = process.platform === "win32" ? 1_000 : 750;
const SHORT_COMMAND_TIMEOUT_MS = 3_000;
const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
};

function resolveRepoRoot(importMetaUrl) {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "..");
}

function resolveUiUrl() {
  return `http://127.0.0.1:39393/clawxmemory/?v=${Date.now()}`;
}

function resolveStateDir() {
  if (process.env.OPENCLAW_STATE_DIR?.trim()) {
    return path.resolve(process.env.OPENCLAW_STATE_DIR.trim());
  }
  return path.join(os.homedir(), ".openclaw");
}

function resolveConfigPath() {
  return path.join(resolveStateDir(), "openclaw.json");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printStep(label) {
  console.log(`\n${paint(">", ANSI.cyan, ANSI.bold)} ${paint(label, ANSI.bold)}`);
}

function supportsColor() {
  return Boolean(process.stdout?.isTTY) && process.env.NO_COLOR !== "1";
}

function paint(text, ...styles) {
  if (!supportsColor() || styles.length === 0) return text;
  return `${styles.join("")}${text}${ANSI.reset}`;
}

function printBanner(title, subtitle = "") {
  console.log("");
  console.log(paint(title, ANSI.bold, ANSI.cyan));
  if (subtitle) {
    console.log(paint(subtitle, ANSI.dim));
  }
}

function printSuccess(label, detail = "") {
  console.log(`${paint("OK", ANSI.green, ANSI.bold)} ${label}${detail ? ` ${paint(detail, ANSI.dim)}` : ""}`);
}

function printWarn(label, detail = "") {
  console.warn(`${paint("WARN", ANSI.yellow, ANSI.bold)} ${label}${detail ? ` ${paint(detail, ANSI.dim)}` : ""}`);
}

function printInfo(label, detail = "") {
  console.log(`${paint("INFO", ANSI.cyan, ANSI.bold)} ${label}${detail ? ` ${paint(detail, ANSI.dim)}` : ""}`);
}

function summarizeOutput(text, max = 600) {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
}

function parseJsonFromMixedOutput(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function commandToString(command, args) {
  return [command, ...args].join(" ");
}

function resolveSpawn(command, args) {
  if (process.platform !== "win32") {
    return { command, args };
  }
  return {
    command: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", command, ...args],
  };
}

function runCommand(command, args, options = {}) {
  const {
    cwd,
    inherit = false,
    timeoutMs,
    tolerateNonZero = false,
    env,
  } = options;

  return new Promise((resolve, reject) => {
    const resolved = resolveSpawn(command, args);
    const child = spawn(resolved.command, resolved.args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: inherit ? "inherit" : "pipe",
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let closed = false;

    if (!inherit) {
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(result);
    };

    const timeoutId = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
          setTimeout(() => {
            if (!closed) {
              child.kill("SIGKILL");
            }
          }, RESTART_KILL_GRACE_MS).unref();
        }, timeoutMs)
      : null;

    child.on("error", (error) => {
      if (settled) return;
      clearTimeout(timeoutId);
      reject(error);
    });

    child.on("close", (code, signal) => {
      closed = true;
      const result = {
        code: typeof code === "number" ? code : 1,
        signal,
        stdout,
        stderr,
        timedOut,
      };
      if (!tolerateNonZero && result.code !== 0 && !timedOut) {
        const snippet = summarizeOutput(`${stderr}\n${stdout}`);
        reject(new Error(`${commandToString(command, args)} failed (${result.code})${snippet ? `\n${snippet}` : ""}`));
        return;
      }
      finish(result);
    });
  });
}

async function runLoggedCommand(label, command, args, options = {}) {
  printStep(label);
  return runCommand(command, args, options);
}

async function readGatewayStatus(repoRoot) {
  const result = await runCommand("openclaw", ["gateway", "status", "--json"], {
    cwd: repoRoot,
    timeoutMs: SHORT_COMMAND_TIMEOUT_MS,
    tolerateNonZero: true,
  });
  const payload = parseJsonFromMixedOutput(`${result.stdout}\n${result.stderr}`);
  return {
    raw: result,
    payload,
  };
}

async function waitForGatewayHealthy(repoRoot) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await readGatewayStatus(repoRoot);
    const payload = status.payload;
    const uiReady = await isUiReachable();
    const serviceLoaded = payload?.service?.loaded === true;
    const runtimeStatus = typeof payload?.service?.runtime?.status === "string"
      ? payload.service.runtime.status.trim().toLowerCase()
      : "";
    const runtimeState = typeof payload?.service?.runtime?.state === "string"
      ? payload.service.runtime.state.trim().toLowerCase()
      : "";
    const runtimeRunning = runtimeStatus === "running" || runtimeState === "running";
    const rpcOk = payload?.rpc?.ok === true;
    if (uiReady || (serviceLoaded && runtimeRunning) || rpcOk) {
      return {
        payload,
        via: uiReady ? "ui" : rpcOk ? "rpc" : "service",
      };
    }
    await sleep(HEALTH_POLL_MS);
  }
  return null;
}

async function restartGatewayService(repoRoot) {
  printStep("Restart gateway");
  return runCommand("openclaw", ["gateway", "restart"], {
    cwd: repoRoot,
    timeoutMs: RESTART_TIMEOUT_MS,
    tolerateNonZero: true,
  });
}

async function startGatewayService(repoRoot) {
  printStep("Start gateway");
  return runCommand("openclaw", ["gateway", "start"], {
    cwd: repoRoot,
    timeoutMs: RESTART_TIMEOUT_MS,
    tolerateNonZero: true,
  });
}

async function ensurePluginLoaded(repoRoot) {
  const result = await runCommand("openclaw", ["plugins", "info", PLUGIN_ID], {
    cwd: repoRoot,
    timeoutMs: SHORT_COMMAND_TIMEOUT_MS,
    tolerateNonZero: true,
  });
  const combined = `${result.stdout}\n${result.stderr}`;
  if (/Status:\s+loaded/i.test(combined)) {
    return {
      loaded: true,
      output: combined,
      via: "plugins-info",
    };
  }
  const uiReady = await isUiReachable();
  return {
    loaded: uiReady,
    output: combined,
    via: uiReady ? "ui" : "unknown",
  };
}

async function readOpenClawConfig() {
  try {
    const raw = await readFile(resolveConfigPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeOpenClawConfig(config) {
  await writeFile(resolveConfigPath(), `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

async function verifyMemorySlotBound() {
  const config = await readOpenClawConfig();
  return config?.plugins?.slots?.memory === PLUGIN_ID;
}

async function verifyPluginEnabled() {
  const config = await readOpenClawConfig();
  return config?.plugins?.entries?.[PLUGIN_ID]?.enabled === true;
}

async function verifyPromptInjectionEnabled() {
  const config = await readOpenClawConfig();
  return config?.plugins?.entries?.[PLUGIN_ID]?.hooks?.allowPromptInjection === true;
}

async function verifyMemoryCoreDisabled() {
  const config = await readOpenClawConfig();
  return config?.plugins?.entries?.["memory-core"]?.enabled === false;
}

async function verifySessionMemoryDisabled() {
  const config = await readOpenClawConfig();
  return config?.hooks?.internal?.entries?.["session-memory"]?.enabled === false;
}

async function verifyAgentMemorySearchDisabled() {
  const config = await readOpenClawConfig();
  return config?.agents?.defaults?.memorySearch?.enabled === false;
}

async function verifyCompactionMemoryFlushDisabled() {
  const config = await readOpenClawConfig();
  return config?.agents?.defaults?.compaction?.memoryFlush?.enabled === false;
}

function ensureObject(parent, key) {
  const current = parent[key];
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    parent[key] = {};
  }
  return parent[key];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function normalizePluginConfigBranding(pluginConfig) {
  if (!pluginConfig || typeof pluginConfig !== "object" || Array.isArray(pluginConfig)) return;
  if (pluginConfig.dataDir === LEGACY_DEFAULT_DATA_DIR) {
    pluginConfig.dataDir = DEFAULT_DATA_DIR;
  }
  if (pluginConfig.dbPath === path.join(LEGACY_DEFAULT_DATA_DIR, "memory.sqlite")) {
    pluginConfig.dbPath = path.join(DEFAULT_DATA_DIR, "memory.sqlite");
  }
  if (pluginConfig.skillsDir === path.join(LEGACY_DEFAULT_DATA_DIR, "skills")) {
    pluginConfig.skillsDir = path.join(DEFAULT_DATA_DIR, "skills");
  }
  if (pluginConfig.uiPathPrefix === LEGACY_UI_PATH_PREFIX) {
    pluginConfig.uiPathPrefix = DEFAULT_UI_PATH_PREFIX;
  }
}

async function ensurePluginLoadPath(pluginPath) {
  printStep("Register plugin source path");
  const config = (await readOpenClawConfig()) ?? {};
  const plugins = config.plugins && typeof config.plugins === "object" ? config.plugins : {};
  const load = plugins.load && typeof plugins.load === "object" ? plugins.load : {};
  const normalizedPluginPath = path.resolve(pluginPath);
  const currentPaths = Array.isArray(load.paths)
    ? load.paths.filter((entry) => typeof entry === "string" && entry.trim())
    : [];
  const dedupedPaths = currentPaths.filter((entry) => path.resolve(entry) !== normalizedPluginPath);
  load.paths = [normalizedPluginPath, ...dedupedPaths];
  plugins.load = load;
  config.plugins = plugins;
  await writeOpenClawConfig(config);
}

async function applyManagedPluginConfig(pluginPath, { resetInstallMetadata = false } = {}) {
  printStep("Sync OpenClaw config");
  const config = (await readOpenClawConfig()) ?? {};
  const plugins = ensureObject(config, "plugins");
  const load = ensureObject(plugins, "load");
  const slots = ensureObject(plugins, "slots");
  const entries = ensureObject(plugins, "entries");
  const pluginEntry = ensureObject(entries, PLUGIN_ID);
  const pluginHooks = ensureObject(pluginEntry, "hooks");
  const pluginConfig = ensureObject(pluginEntry, "config");
  const internalHooks = ensureObject(ensureObject(ensureObject(config, "hooks"), "internal"), "entries");
  const sessionMemory = ensureObject(internalHooks, "session-memory");
  const agents = ensureObject(config, "agents");
  const defaults = ensureObject(agents, "defaults");
  const memorySearch = ensureObject(defaults, "memorySearch");
  const compaction = ensureObject(defaults, "compaction");
  const memoryFlush = ensureObject(compaction, "memoryFlush");
  const memoryCore = ensureObject(entries, "memory-core");
  const normalizedPluginPath = path.resolve(pluginPath);
  const currentPaths = Array.isArray(load.paths)
    ? load.paths.filter((entry) => typeof entry === "string" && entry.trim())
    : [];

  normalizePluginConfigBranding(pluginConfig);

  load.paths = [normalizedPluginPath, ...currentPaths.filter((entry) => path.resolve(entry) !== normalizedPluginPath)];
  slots.memory = PLUGIN_ID;
  pluginEntry.enabled = true;
  pluginHooks.allowPromptInjection = true;
  memoryCore.enabled = false;
  sessionMemory.enabled = false;
  memorySearch.enabled = false;
  memoryFlush.enabled = false;

  delete entries[LEGACY_PLUGIN_ID];

  if (plugins.installs && typeof plugins.installs === "object") {
    delete plugins.installs[LEGACY_PLUGIN_ID];
    if (resetInstallMetadata) {
      delete plugins.installs[PLUGIN_ID];
    }
    if (Object.keys(plugins.installs).length === 0) {
      delete plugins.installs;
    }
  }

  await writeOpenClawConfig(config);

  const checks = await Promise.all([
    verifyMemorySlotBound(),
    verifyPluginEnabled(),
    verifyPromptInjectionEnabled(),
    verifyMemoryCoreDisabled(),
    verifySessionMemoryDisabled(),
    verifyAgentMemorySearchDisabled(),
    verifyCompactionMemoryFlushDisabled(),
  ]);

  if (checks.some((item) => item !== true)) {
    throw new Error("managed OpenClaw config update did not persist the expected state");
  }

  printSuccess("Config synced", "memory slot bound, prompt injection enabled, native memory disabled");
}

async function isUiReachable() {
  try {
    const response = await fetch("http://127.0.0.1:39393/clawxmemory/", {
      signal: AbortSignal.timeout(SHORT_COMMAND_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function removePluginInstallMetadata() {
  printStep("Remove existing plugin link metadata");
  const config = await readOpenClawConfig();
  if (!config?.plugins?.installs?.[PLUGIN_ID]) {
    return;
  }
  delete config.plugins.installs[PLUGIN_ID];
  if (Object.keys(config.plugins.installs).length === 0) {
    delete config.plugins.installs;
  }
  await writeOpenClawConfig(config);
}

async function runConfigMutation(repoRoot, label, command, args, verifyState) {
  printStep(label);
  const result = await runCommand(command, args, {
    cwd: repoRoot,
    timeoutMs: SHORT_COMMAND_TIMEOUT_MS,
    tolerateNonZero: true,
  });
  const applied = await verifyState();
  if (!applied) {
    const snippet = summarizeOutput(`${result.stderr}\n${result.stdout}`);
    throw new Error(`${label} failed\n${snippet || "state verification failed"}`);
  }
  if (result.timedOut) {
    console.warn(`warning: \`${commandToString(command, args)}\` timed out, but the config state was applied.`);
  } else if (result.code !== 0) {
    console.warn(`warning: \`${commandToString(command, args)}\` exited with ${result.code}, but the config state was applied.`);
  }
}

function maybeOpenBrowser(url) {
  if (process.env.CLAWXMEMORY_OPEN_BROWSER === "0") return;
  if (process.platform === "darwin") {
    const child = spawn("open", [url], { stdio: "ignore", detached: true });
    child.unref();
    return;
  }
  if (process.platform === "linux") {
    const child = spawn("xdg-open", [url], { stdio: "ignore", detached: true });
    child.unref();
  }
}

async function buildPlugin(repoRoot) {
  await runLoggedCommand(
    "Build memory plugin",
    "npm",
    ["run", "build", "--workspace", WORKSPACE_NAME],
    { cwd: repoRoot, inherit: true },
  );
  printSuccess("Plugin build complete");
}

async function runReloadFlow(repoRoot, options = {}) {
  printBanner("ClawXMemory Plugin Reload", "Link config, restart gateway, and verify the memory runtime.");
  const { skipBuild = false, resetInstallMetadata = false } = options;
  if (!skipBuild) {
    await buildPlugin(repoRoot);
  }
  await applyManagedPluginConfig(path.join(repoRoot, "packages", "openclaw-memory-plugin"), { resetInstallMetadata });

  const restart = await restartGatewayService(repoRoot);
  let health = await waitForGatewayHealthy(repoRoot);
  let recoveredVia = "restart";
  if (!health) {
    printWarn("Gateway did not report healthy after restart", "trying a follow-up start");
    const start = await startGatewayService(repoRoot);
    health = await waitForGatewayHealthy(repoRoot);
    if (health) {
      recoveredVia = start.timedOut ? "start-timeout" : "start";
    }
  }
  if (!health) {
    const snippet = summarizeOutput(`${restart.stderr}\n${restart.stdout}`);
    throw new Error(
      [
        "gateway restart did not become healthy",
        restart.timedOut ? "restart command timed out" : `restart exit code ${restart.code}`,
        snippet || "no restart output captured",
      ].join("\n"),
    );
  }

  if (restart.timedOut) {
    printWarn("`openclaw gateway restart` timed out, but the gateway recovered.");
  } else if (restart.code !== 0) {
    printWarn(`\`openclaw gateway restart\` exited with ${restart.code}, but the gateway recovered.`);
  }
  printSuccess("Gateway ready", `health source=${health.via}; recovery=${recoveredVia}`);

  printStep("Verify plugin status");
  const plugin = await ensurePluginLoaded(repoRoot);
  if (!plugin.loaded) {
    throw new Error(`plugin failed to load\n${summarizeOutput(plugin.output, 1200)}`);
  }
  if (plugin.via !== "plugins-info") {
    printWarn("`openclaw plugins info` was noisy, but the plugin UI endpoint is reachable.");
  }
  printSuccess("Plugin loaded", `verified via ${plugin.via}`);

  const url = resolveUiUrl();
  maybeOpenBrowser(url);

  console.log("");
  printSuccess("Memory plugin reloaded");
  printInfo("Gateway", `ws://127.0.0.1:${health?.payload?.gateway?.port ?? "18789"}`);
  printInfo("UI", url);
}

export async function reloadMemoryPlugin({ importMetaUrl, skipBuild = false } = {}) {
  const repoRoot = resolveRepoRoot(importMetaUrl);
  await runReloadFlow(repoRoot, { skipBuild });
}

export async function relinkMemoryPlugin({ importMetaUrl } = {}) {
  const repoRoot = resolveRepoRoot(importMetaUrl);
  const installDir = path.join(resolveStateDir(), "extensions", PLUGIN_ID);

  printBanner("ClawXMemory Plugin Relink", "Build, relink, update config, and restart the gateway.");
  await buildPlugin(repoRoot);

  printStep("Clean extension directory");
  await rm(installDir, { recursive: true, force: true });
  printSuccess("Extension directory cleaned", installDir);

  await runReloadFlow(repoRoot, { skipBuild: true, resetInstallMetadata: true });
}
