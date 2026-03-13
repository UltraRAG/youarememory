export interface PluginLogger {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export interface PluginRuntimeLike {
  modelAuth?: {
    resolveApiKeyForProvider?: (params: {
      provider: string;
      cfg?: Record<string, unknown>;
    }) => Promise<{ apiKey?: string }>;
  };
}

export interface PluginTool {
  name: string;
  label: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
  execute: (id: string, params: unknown) => Promise<unknown> | unknown;
}

export interface PluginService {
  id: string;
  start: () => void | Promise<void>;
  stop: () => void | Promise<void>;
}

export interface OpenClawPluginApi {
  pluginConfig?: unknown;
  config?: Record<string, unknown>;
  runtime?: PluginRuntimeLike;
  logger?: PluginLogger;
  on?: (
    hookName: string,
    handler: (event: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<unknown> | unknown,
    options?: { priority?: number },
  ) => void;
  registerTool?: (
    factory: ((ctx: Record<string, unknown>) => PluginTool[] | PluginTool | null | undefined) | (() => PluginTool[]),
    options?: { names?: string[] },
  ) => void;
  registerService?: (service: PluginService) => void;
}
