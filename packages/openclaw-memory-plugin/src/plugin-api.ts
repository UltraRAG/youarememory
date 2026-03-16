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

export interface PluginHookAgentContext {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  workspaceDir?: string;
  messageProvider?: string;
  trigger?: string;
  channelId?: string;
}

export interface PluginHookBeforePromptBuildEvent {
  prompt: string;
  messages: unknown[];
}

export interface PluginHookBeforePromptBuildResult {
  systemPrompt?: string;
  prependContext?: string;
  prependSystemContext?: string;
  appendSystemContext?: string;
}

export interface PluginHookBeforeMessageWriteEvent {
  message: unknown;
  sessionKey?: string;
  agentId?: string;
}

export interface PluginHookBeforeMessageWriteResult {
  block?: boolean;
  message?: unknown;
}

export interface PluginHookAgentEndEvent {
  messages: unknown[];
  success: boolean;
  error?: string;
  durationMs?: number;
  timestamp?: string;
}

export interface PluginHookBeforeResetEvent {
  sessionFile?: string;
  messages?: unknown[];
  reason?: string;
}

export interface PluginHookHandlerMap {
  before_prompt_build: (
    event: PluginHookBeforePromptBuildEvent,
    ctx: PluginHookAgentContext,
  ) => Promise<PluginHookBeforePromptBuildResult | void> | PluginHookBeforePromptBuildResult | void;
  before_message_write: (
    event: PluginHookBeforeMessageWriteEvent,
    ctx: { agentId?: string; sessionKey?: string },
  ) => PluginHookBeforeMessageWriteResult | void;
  agent_end: (
    event: PluginHookAgentEndEvent,
    ctx: PluginHookAgentContext,
  ) => Promise<void> | void;
  before_reset: (
    event: PluginHookBeforeResetEvent,
    ctx: PluginHookAgentContext,
  ) => Promise<void> | void;
}

export interface OpenClawPluginApi {
  pluginConfig?: Record<string, unknown>;
  config?: Record<string, unknown>;
  runtime?: PluginRuntimeLike;
  logger?: PluginLogger;
  on?: <K extends keyof PluginHookHandlerMap>(
    hookName: K,
    handler: PluginHookHandlerMap[K],
    options?: { priority?: number },
  ) => void;
  registerTool?: (
    factory: ((ctx: Record<string, unknown>) => PluginTool[] | PluginTool | null | undefined) | (() => PluginTool[]),
    options?: { names?: string[] },
  ) => void;
  registerService?: (service: PluginService) => void;
}
