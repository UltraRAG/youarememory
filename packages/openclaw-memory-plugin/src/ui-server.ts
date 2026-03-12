import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryRepository, ReasoningRetriever } from "./core/index.js";
import type { PluginLogger } from "./plugin-api.js";

export interface UiServerOptions {
  host: string;
  port: number;
  prefix: string;
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

export class LocalUiServer {
  private server = createServer((req, res) => this.handle(req, res));
  private readonly prefix: string;

  constructor(
    private readonly repository: MemoryRepository,
    private readonly retriever: ReasoningRetriever,
    private readonly options: UiServerOptions,
    private readonly logger: PluginLogger,
  ) {
    this.prefix = withSlashPrefix(options.prefix).replace(/\/+$/, "");
  }

  start(): void {
    this.server.listen(this.options.port, this.options.host, () => {
      this.logger.info?.(
        `[youarememory] dashboard ready at http://${this.options.host}:${this.options.port}${this.prefix}/`,
      );
    });
  }

  stop(): void {
    this.server.close();
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    if (!req.url) return sendNotFound(res);
    const url = new URL(req.url, `http://${this.options.host}:${this.options.port}`);
    const relativePath = parsePath(url.pathname, this.prefix);
    if (!relativePath) return sendNotFound(res);

    if (relativePath.startsWith("/api/")) {
      return this.handleApi(relativePath, url, res);
    }
    return this.handleStatic(relativePath, res);
  }

  private handleApi(relativePath: string, url: URL, res: ServerResponse): void {
    const query = url.searchParams.get("q") ?? "";
    const limit = parseLimit(url.searchParams.get("limit"), 20);
    if (relativePath === "/api/overview") {
      return sendJson(res, this.repository.getOverview());
    }
    if (relativePath === "/api/snapshot") {
      return sendJson(res, this.repository.getUiSnapshot(limit));
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
    if (relativePath === "/api/facts") {
      return sendJson(res, this.repository.searchFacts(query, limit));
    }
    if (relativePath === "/api/retrieve") {
      return sendJson(res, this.retriever.retrieve(query, { l2Limit: limit, l1Limit: limit, l0Limit: Math.max(3, limit / 2) }));
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
