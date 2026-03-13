import { spawn } from "node:child_process";
import { access, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PLUGIN_ID = "youarememory-openclaw";
const WORKSPACE_NAME = "@youarememory/youarememory-openclaw";
const RESTART_TIMEOUT_MS = 8_000;
const RESTART_KILL_GRACE_MS = 1_000;
const HEALTH_TIMEOUT_MS = 20_000;
const HEALTH_POLL_MS = 750;
const SHORT_COMMAND_TIMEOUT_MS = 3_000;

function resolveRepoRoot(importMetaUrl) {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "..");
}

function resolveUiUrl() {
  return `http://127.0.0.1:39393/youarememory/?v=${Date.now()}`;
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
  console.log(`\n==> ${label}`);
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

function runCommand(command, args, options = {}) {
  const {
    cwd,
    inherit = false,
    timeoutMs,
    tolerateNonZero = false,
    env,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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
    const serviceLoaded = payload?.service?.loaded === true;
    const runtimeRunning = payload?.service?.runtime?.status === "running";
    const rpcOk = payload?.rpc?.ok === true;
    if (serviceLoaded && runtimeRunning && rpcOk) {
      return payload;
    }
    await sleep(HEALTH_POLL_MS);
  }
  return null;
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

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function verifyMemorySlotBound() {
  const config = await readOpenClawConfig();
  return config?.plugins?.slots?.memory === PLUGIN_ID;
}

async function verifyPluginEnabled() {
  const config = await readOpenClawConfig();
  return config?.plugins?.entries?.[PLUGIN_ID]?.enabled === true;
}

async function isUiReachable() {
  try {
    const response = await fetch("http://127.0.0.1:39393/youarememory/", {
      signal: AbortSignal.timeout(SHORT_COMMAND_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function uninstallPlugin(repoRoot) {
  printStep("Remove existing plugin link");
  const result = await runCommand(
    "openclaw",
    ["plugins", "uninstall", PLUGIN_ID, "--force"],
    {
      cwd: repoRoot,
      timeoutMs: SHORT_COMMAND_TIMEOUT_MS,
      tolerateNonZero: true,
    },
  );
  const config = await readOpenClawConfig();
  const removed = !config?.plugins?.entries?.[PLUGIN_ID];
  if (!removed) {
    const snippet = summarizeOutput(`${result.stderr}\n${result.stdout}`);
    throw new Error(`failed to uninstall plugin link\n${snippet || "plugin entry still exists"}`);
  }
  if (result.timedOut) {
    console.warn("warning: `openclaw plugins uninstall` timed out, but the plugin entry was removed.");
  }
}

async function installPluginLink(repoRoot, pluginPath, installDir) {
  printStep("Link plugin into OpenClaw");
  const result = await runCommand(
    "openclaw",
    ["plugins", "install", "--link", pluginPath],
    {
      cwd: repoRoot,
      timeoutMs: SHORT_COMMAND_TIMEOUT_MS,
      tolerateNonZero: true,
    },
  );

  const config = await readOpenClawConfig();
  const installed = Boolean(config?.plugins?.entries?.[PLUGIN_ID]) || await pathExists(installDir);
  if (!installed) {
    const snippet = summarizeOutput(`${result.stderr}\n${result.stdout}`);
    throw new Error(`failed to install plugin link\n${snippet || "plugin link not found after install"}`);
  }
  if (result.timedOut) {
    console.warn("warning: `openclaw plugins install --link` timed out, but the plugin link was created.");
  } else if (result.code !== 0) {
    console.warn(`warning: \`openclaw plugins install --link\` exited with ${result.code}, but the plugin link was created.`);
  }
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
  if (process.env.YAM_OPEN_BROWSER === "0") return;
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
}

async function runReloadFlow(repoRoot, options = {}) {
  const { skipBuild = false } = options;
  if (!skipBuild) {
    await buildPlugin(repoRoot);
  }

  await runConfigMutation(
    repoRoot,
    "Bind memory slot",
    "openclaw",
    ["config", "set", "plugins.slots.memory", JSON.stringify(PLUGIN_ID)],
    verifyMemorySlotBound,
  );
  await runConfigMutation(
    repoRoot,
    "Enable plugin",
    "openclaw",
    ["plugins", "enable", PLUGIN_ID],
    verifyPluginEnabled,
  );

  printStep("Restart gateway");
  const restart = await runCommand("openclaw", ["gateway", "restart"], {
    cwd: repoRoot,
    timeoutMs: RESTART_TIMEOUT_MS,
    tolerateNonZero: true,
  });

  const health = await waitForGatewayHealthy(repoRoot);
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
    console.warn("warning: `openclaw gateway restart` timed out, but the gateway recovered and is healthy.");
  } else if (restart.code !== 0) {
    console.warn(`warning: \`openclaw gateway restart\` exited with ${restart.code}, but the gateway is healthy.`);
  }

  printStep("Verify plugin status");
  const plugin = await ensurePluginLoaded(repoRoot);
  if (!plugin.loaded) {
    throw new Error(`plugin failed to load\n${summarizeOutput(plugin.output, 1200)}`);
  }
  if (plugin.via !== "plugins-info") {
    console.warn("warning: `openclaw plugins info` did not return cleanly, but the UI endpoint is reachable.");
  }

  const url = resolveUiUrl();
  maybeOpenBrowser(url);

  console.log("\nMemory plugin reloaded.");
  console.log(`Gateway: running on ws://127.0.0.1:${health?.gateway?.port ?? "18789"}`);
  console.log(`UI: ${url}`);
}

export async function reloadMemoryPlugin({ importMetaUrl, skipBuild = false } = {}) {
  const repoRoot = resolveRepoRoot(importMetaUrl);
  await runReloadFlow(repoRoot, { skipBuild });
}

export async function relinkMemoryPlugin({ importMetaUrl } = {}) {
  const repoRoot = resolveRepoRoot(importMetaUrl);
  const pluginPath = path.join(repoRoot, "packages", "openclaw-memory-plugin");
  const installDir = path.join(resolveStateDir(), "extensions", PLUGIN_ID);

  await buildPlugin(repoRoot);

  await uninstallPlugin(repoRoot);

  printStep("Clean extension directory");
  await rm(installDir, { recursive: true, force: true });

  await installPluginLink(repoRoot, pluginPath, installDir);

  await runReloadFlow(repoRoot, { skipBuild: true });
}
