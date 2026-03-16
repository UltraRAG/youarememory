import type { OpenClawPluginApi } from "./plugin-api.js";
import type { MemoryPluginRuntime } from "./runtime.js";

export function registerMemoryHooks(
  api: OpenClawPluginApi,
  runtime: MemoryPluginRuntime,
): void {
  if (!api.on) return;

  api.on(
    "before_prompt_build",
    runtime.handleBeforePromptBuild,
    { priority: 60 },
  );
  api.on("before_message_write", runtime.handleBeforeMessageWrite);
  api.on("agent_end", runtime.handleAgentEnd);
  api.on("before_reset", runtime.handleBeforeReset);
}
