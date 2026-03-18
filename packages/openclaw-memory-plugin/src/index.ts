import type { OpenClawPluginApi } from "./plugin-api.js";
import { registerMemoryHooks } from "./hooks.js";
import { MemoryPluginRuntime } from "./runtime.js";

function isGatewayRuntimeProcess(): boolean {
  return process.argv.some((value) => value === "gateway" || value.includes("openclaw-gateway"));
}

const plugin = {
  id: "clawxmemory-openclaw",
  name: "ClawXMemory OpenClaw Plugin",
  description: "L0/L1/L2 local-first memory plugin for OpenClaw.",
  kind: "memory" as const,

  register(api: OpenClawPluginApi): void {
    const runtime = new MemoryPluginRuntime({
      apiConfig: api.config,
      pluginRuntime: api.runtime,
      pluginConfig: api.pluginConfig,
      logger: api.logger,
    });

    const tools = runtime.getTools();
    api.registerTool?.(() => tools, { names: tools.map((tool) => tool.name) });
    registerMemoryHooks(api, runtime);

    const liveRuntimeEnabled = isGatewayRuntimeProcess();
    if (api.registerService) {
      api.registerService({
        id: "clawxmemory-runtime",
        start: () => {
          if (liveRuntimeEnabled) runtime.start();
        },
        stop: () => runtime.stop(),
      });
      return;
    }

    if (liveRuntimeEnabled) {
      runtime.start();
    }
  },
};

export default plugin;
