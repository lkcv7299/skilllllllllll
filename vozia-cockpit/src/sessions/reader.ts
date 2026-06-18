import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";

export type ClaudeSession = {
  id: string;
  filePath: string;
  cwd: string;
  title: string;
  modifiedAt: number;
  messageCount: number;
};

type CachedSession = {
  modifiedAt: number;
  size: number;
  session: ClaudeSession | undefined;
};

const MAX_TITLE_LENGTH = 80;
const READ_CONCURRENCY = 6;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function textFromContent(content: unknown): string | undefined {
  const directText = nonEmptyString(content);
  if (directText) {
    return directText;
  }

  if (Array.isArray(content)) {
    for (const block of content) {
      const record = asRecord(block);
      if (!record) {
        continue;
      }
      const text = nonEmptyString(record.text);
      if (text) {
        return text;
      }
    }
  }

  const record = asRecord(content);
  return record ? nonEmptyString(record.text) : undefined;
}

function normalizeTitle(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= MAX_TITLE_LENGTH) {
    return compact;
  }
  return `${compact.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}

function recordRole(record: Record<string, unknown>): string | undefined {
  const message = asRecord(record.message);
  return nonEmptyString(message?.role) ?? nonEmptyString(record.type);
}

// Los mensajes de slash-command (/inicio, /handoff…) se guardan envueltos en
// <command-message>/<command-name>; los outputs en <local-command-stdout>. No son
// texto humano: si los tomáramos como título, todas las sesiones se llamarían "inicio".
function isCommandText(value: string): boolean {
  const trimmed = value.trimStart();
  return (
    trimmed.startsWith("<command-") ||
    trimmed.startsWith("<local-command-") ||
    value.includes("<command-name>")
  );
}

function userText(record: Record<string, unknown>): string | undefined {
  if (record.isMeta === true) {
    return undefined;
  }
  if (recordRole(record) !== "user") {
    return undefined;
  }

  const message = asRecord(record.message);
  const text =
    textFromContent(message?.content) ?? textFromContent(record.content);
  if (!text || isCommandText(text)) {
    return undefined;
  }
  return text;
}

function isMessageRecord(record: Record<string, unknown>): boolean {
  const role = recordRole(record);
  return role === "user" || role === "assistant";
}

async function parseSessionFile(
  filePath: string,
  modifiedAt: number,
): Promise<ClaudeSession | undefined> {
  let cwd: string | undefined;
  let summary: string | undefined;
  let customTitle: string | undefined;
  let aiTitle: string | undefined;
  let firstUserMessage: string | undefined;
  let messageCount = 0;
  let parsedRecordCount = 0;

  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({
    input,
    crlfDelay: Infinity,
  });

  try {
    for await (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }

      let record: Record<string, unknown> | undefined;
      try {
        record = asRecord(JSON.parse(line) as unknown);
      } catch {
        continue;
      }
      if (!record) {
        continue;
      }

      parsedRecordCount += 1;
      cwd ??= nonEmptyString(record.cwd);
      summary = nonEmptyString(record.summary) ?? summary;
      // Misma cadena de título que usa la extensión de Claude para titular la tab:
      // custom-title (rename manual) → ai-title (generado) → summary → 1er mensaje.
      // Así el título de la lista coincide con el de la pestaña y el match funciona.
      if (record.type === "custom-title") {
        customTitle = nonEmptyString(record.customTitle) ?? customTitle;
      } else if (record.type === "ai-title") {
        aiTitle = nonEmptyString(record.aiTitle) ?? aiTitle;
      }
      firstUserMessage ??= userText(record);
      if (isMessageRecord(record)) {
        messageCount += 1;
      }
    }
  } finally {
    lines.close();
    input.destroy();
  }

  if (parsedRecordCount === 0 || !cwd) {
    return undefined;
  }

  const titleSource = customTitle ?? aiTitle ?? summary ?? firstUserMessage;
  return {
    id: path.basename(filePath, path.extname(filePath)),
    filePath,
    cwd,
    title: titleSource ? normalizeTitle(titleSource) : "(sin título)",
    modifiedAt,
    messageCount,
  };
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) {
        results[index] = await mapper(value);
      }
    }
  }

  const workerCount = Math.min(concurrency, values.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => worker()),
  );
  return results;
}

export class ClaudeSessionReader {
  private readonly cache = new Map<string, CachedSession>();
  private pendingRead: Promise<ClaudeSession[]> | undefined;

  public constructor(
    private readonly projectsDirectory = path.join(
      os.homedir(),
      ".claude",
      "projects",
    ),
  ) {}

  public async readAll(): Promise<ClaudeSession[]> {
    if (this.pendingRead) {
      return this.pendingRead;
    }

    const read = this.readAllUncached();
    this.pendingRead = read;
    try {
      return await read;
    } finally {
      if (this.pendingRead === read) {
        this.pendingRead = undefined;
      }
    }
  }

  private async readAllUncached(): Promise<ClaudeSession[]> {
    const filePaths = await this.findSessionFiles();
    const currentPaths = new Set(filePaths);
    for (const cachedPath of this.cache.keys()) {
      if (!currentPaths.has(cachedPath)) {
        this.cache.delete(cachedPath);
      }
    }

    const sessions = await mapWithConcurrency(
      filePaths,
      READ_CONCURRENCY,
      async (filePath) => this.readCached(filePath),
    );

    return sessions
      .filter((session): session is ClaudeSession => session !== undefined)
      .sort((left, right) => right.modifiedAt - left.modifiedAt);
  }

  private async findSessionFiles(): Promise<string[]> {
    let projectDirectories;
    try {
      projectDirectories = await readdir(this.projectsDirectory, {
        withFileTypes: true,
      });
    } catch {
      return [];
    }

    const filesByDirectory = await Promise.all(
      projectDirectories
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const directoryPath = path.join(this.projectsDirectory, entry.name);
          try {
            const entries = await readdir(directoryPath, {
              withFileTypes: true,
            });
            return entries
              .filter(
                (candidate) =>
                  candidate.isFile() &&
                  candidate.name.toLowerCase().endsWith(".jsonl"),
              )
              .map((candidate) => path.join(directoryPath, candidate.name));
          } catch {
            return [];
          }
        }),
    );

    return filesByDirectory.flat();
  }

  private async readCached(
    filePath: string,
  ): Promise<ClaudeSession | undefined> {
    let metadata;
    try {
      metadata = await stat(filePath);
    } catch {
      return undefined;
    }

    const cached = this.cache.get(filePath);
    if (
      cached &&
      cached.modifiedAt === metadata.mtimeMs &&
      cached.size === metadata.size
    ) {
      return cached.session;
    }

    try {
      const session = await parseSessionFile(filePath, metadata.mtimeMs);
      this.cache.set(filePath, {
        modifiedAt: metadata.mtimeMs,
        size: metadata.size,
        session,
      });
      return session;
    } catch {
      return cached?.session;
    }
  }
}
