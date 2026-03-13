import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type HeartbeatStats,
  type IndexingSettings,
  MemoryRepository,
  ReasoningRetriever,
} from "./core/index.js";
import type { PluginLogger } from "./plugin-api.js";

export interface UiServerOptions {
  host: string;
  port: number;
  prefix: string;
}

export interface UiServerControls {
  getSettings: () => IndexingSettings;
  saveSettings: (partial: Partial<IndexingSettings>) => IndexingSettings;
  runIndexNow: () => Promise<HeartbeatStats>;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function withSlashPrefix(prefix: string): string {
  if (!prefix.startsWith("/")) return `/${prefix}`;
  return prefix;
}

function getAssetContent(assetName: string): string | undefined {
  try {
    const currentDir = fileURLToPath(new URL(".", import.meta.url));
    const target = join(currentDir, "ui", assetName);
    return readFileSync(target, "utf-8");
  } catch {
    return undefined;
  }
}

function sendJson(res: ServerResponse, body: unknown): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body, null, 2));
}

function sendNotFound(res: ServerResponse): void {
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: "Not found" }));
}

function sendMethodNotAllowed(res: ServerResponse, allow: string): void {
  res.statusCode = 405;
  res.setHeader("Allow", allow);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: "Method not allowed" }));
}

function sendRedirect(res: ServerResponse, location: string): void {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.end();
}

function sendError(res: ServerResponse, message: string): void {
  res.statusCode = 500;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: message }));
}

function parseLimit(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, parsed));
}

function parsePath(pathname: string, prefix: string): string {
  if (!pathname.startsWith(prefix)) return "";
  const raw = pathname.slice(prefix.length);
  return raw.startsWith("/") ? raw : `/${raw}`;
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
}

export class LocalUiServer {
  private server = createServer((req, res) => {
    void this.handle(req, res);
  });
  private started = false;
  private listening = false;
  private readonly prefix: string;

  constructor(
    private readonly repository: MemoryRepository,
    private readonly retriever: ReasoningRetriever,
    private readonly options: UiServerOptions,
    private readonly controls: UiServerControls,
    private readonly logger: PluginLogger,
  ) {
    this.prefix = withSlashPrefix(options.prefix).replace(/\/+$/, "");
    this.server.on("listening", () => {
      this.listening = true;
    });
    this.server.on("close", () => {
      this.listening = false;
      this.started = false;
    });
    this.server.on("error", (error) => {
      this.listening = false;
      this.started = false;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn?.(`[youarememory] dashboard server failed: ${message}`);
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.server.listen(this.options.port, this.options.host, () => {
      this.logger.info?.(
        `[youarememory] dashboard ready at http://${this.options.host}:${this.options.port}${this.prefix}/`,
      );
    });
  }

  stop(): void {
    if (!this.started && !this.listening) return;
    this.started = false;
    if (!this.listening) return;
    this.server.close();
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (!req.url) return sendNotFound(res);
      const url = new URL(req.url, `http://${this.options.host}:${this.options.port}`);
      if (url.pathname === this.prefix) {
        const redirectUrl = new URL(`${this.prefix}/`, url);
        redirectUrl.search = url.search;
        return sendRedirect(res, redirectUrl.pathname + redirectUrl.search);
      }
      const relativePath = parsePath(url.pathname, this.prefix);
      if (!relativePath) return sendNotFound(res);

      if (relativePath.startsWith("/api/")) {
        return await this.handleApi(relativePath, req, url, res);
      }
      return this.handleStatic(relativePath, res);
    } catch (error) {
      this.logger.warn?.(`[youarememory] ui request failed: ${String(error)}`);
      return sendError(res, String(error));
    }
  }

  private async handleApi(
    relativePath: string,
    req: IncomingMessage,
    url: URL,
    res: ServerResponse,
  ): Promise<void> {
    const upperMethod = (req.method ?? "GET").toUpperCase();
    const query = url.searchParams.get("q") ?? "";
    const limit = parseLimit(url.searchParams.get("limit"), 20);
    if (relativePath === "/api/clear") {
      if (upperMethod !== "POST") return sendMethodNotAllowed(res, "POST");
      return sendJson(res, this.repository.clearAllMemoryData());
    }
    if (relativePath === "/api/overview") {
      return sendJson(res, this.repository.getOverview());
    }
    if (relativePath === "/api/settings") {
      if (upperMethod === "GET") {
        return sendJson(res, this.controls.getSettings());
      }
      if (upperMethod !== "POST") return sendMethodNotAllowed(res, "GET, POST");
      const body = await readJsonBody(req);
      return sendJson(res, this.controls.saveSettings(body as Partial<IndexingSettings>));
    }
    if (relativePath === "/api/index/run") {
      if (upperMethod !== "POST") return sendMethodNotAllowed(res, "POST");
      return sendJson(res, await this.controls.runIndexNow());
    }
    if (relativePath === "/api/snapshot") {
      return sendJson(res, {
        ...this.repository.getUiSnapshot(limit),
        settings: this.controls.getSettings(),
      });
    }
    if (relativePath === "/api/l2/time") {
      return sendJson(res, this.repository.searchL2TimeIndexes(query, limit));
    }
    if (relativePath === "/api/l2/project") {
      return sendJson(res, this.repository.searchL2ProjectIndexes(query, limit));
    }
    if (relativePath === "/api/l1") {
      return sendJson(res, this.repository.searchL1(query, limit));
    }
    if (relativePath === "/api/l0") {
      return sendJson(res, this.repository.searchL0(query, limit));
    }
    if (relativePath === "/api/profile" || relativePath === "/api/facts") {
      return sendJson(res, this.repository.searchGlobalProfile(query, limit));
    }
    if (relativePath === "/api/retrieve") {
      return sendJson(
        res,
        await this.retriever.retrieve(query, {
          l2Limit: limit,
          l1Limit: limit,
          l0Limit: Math.max(3, Math.floor(limit / 2)),
        }),
      );
    }
    return sendNotFound(res);
  }

  private handleStatic(relativePath: string, res: ServerResponse): void {
    const target = relativePath === "/" ? "/index.html" : relativePath;
    const assetName = target.replace(/^\/+/, "");
    const raw = getAssetContent(assetName);
    if (!raw) return sendNotFound(res);

    const ext = assetName.includes(".") ? assetName.slice(assetName.lastIndexOf(".")) : ".html";
    const contentType = CONTENT_TYPES[ext] ?? "text/plain; charset=utf-8";
    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.end(raw);
  }
}
