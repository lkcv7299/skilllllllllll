import { open, readdir, stat } from "node:fs/promises";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

// ════════════════════════════════════════════════════════════════════════════
// FUENTE DE VERDAD CANÓNICA DEL TURNO
// ════════════════════════════════════════════════════════════════════════════
// La GUI de Claude Code escribe TODA la conversación, evento por evento y en
// streaming, en `~/.claude/projects/<cwd-codificado>/<session-id>.jsonl`. Es el
// MISMO log que el cockpit ya lee para la vista de Sesiones (sessions/reader.ts).
//
// Esto reemplaza al marcador `cockpit-turn-status.json` (un proxy de estado de UI
// que el bundle parchado escribía en updateSessionState). El marcador tenía tres
// fallas medidas: (1) era estado de UI, no de conversación → turnos rápidos
// saltaban running→idle antes de que la barrera se enganchara; (2) exigía un parche
// extra al bundle; (3) era global (un archivo para todas las sesiones) → races de
// identidad con el foco. El .jsonl no tiene ninguna: es por-sesión, lo escribe la
// propia GUI sin parche, y la señal de fin de turno es explícita y con timestamp.
//
// Fin de turno = la última línea de NIVEL SUPERIOR (no de un sub-agente) es un
// mensaje `assistant` con `message.stop_reason === "end_turn"` y `timestamp` ≥ el
// momento del envío. `end_turn` es el único stop_reason en que el modelo cede el
// turno (vs `tool_use`, que encadena con un `user` de tool_results y sigue).
// ════════════════════════════════════════════════════════════════════════════

export type TurnLogOutcome = { kind: "completed" } | { kind: "turn_timeout" };

// Señal de aborto mínima que el motor satisface estructuralmente (su StopSignal
// expone `hard` + `onChange`). No importamos el motor para no crear un ciclo.
export interface AbortLike {
  readonly hard: boolean;
  onChange(listener: () => void): vscode.Disposable;
}

// Solo leemos la cola del archivo: el `end_turn` que buscamos siempre está al final,
// y los .jsonl crecen a cientos de KB. Releer el archivo entero en cada append sería
// O(n²). 256 KB cubren de sobra el último turno completo.
const TAIL_BYTES = 256 * 1024;

// Para confirmar a qué proyecto pertenece un .jsonl candidato leemos su cabecera (el
// `cwd` aparece en las primeras líneas). Con esto la captura NO depende de adivinar
// el algoritmo de codificación del directorio: comparamos el cwd real.
const HEAD_BYTES = 16 * 1024;

// Cadencia de respaldo del polling: el fs.watch dispara en cada escritura, pero en
// algunos FS de Windows el evento se pierde; un poll lento garantiza progreso.
const POLL_INTERVAL_MS = 500;

function projectsDirectory(): string {
  return path.join(os.homedir(), ".claude", "projects");
}

// Codificación de Claude para el nombre del directorio de un proyecto: cada carácter
// no alfanumérico → "-". `C:\VozIA-Project` → `C--VozIA-Project` (verificado contra
// el directorio real). La usamos como PISTA para observar el dir correcto; la
// pertenencia se confirma siempre leyendo el cwd del archivo (encodeProjectDir puede
// quedar obsoleto, el cwd no).
export function encodeProjectDir(cwd: string): string {
  return path.resolve(cwd).replace(/[^a-zA-Z0-9]/g, "-");
}

function sessionDirFor(cwd: string): string {
  return path.join(projectsDirectory(), encodeProjectDir(cwd));
}

function isCwdUnderProject(cwd: string, projectPath: string): boolean {
  const normalize = (p: string): string => {
    const resolved = path.resolve(p);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  const child = normalize(cwd);
  const root = normalize(projectPath);
  return child === root || child.startsWith(root + path.sep);
}

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

// Lee los últimos `maxBytes` del archivo y descarta la primera línea (probablemente
// parcial) cuando no leímos desde el inicio. Devuelve "" ante cualquier error de IO
// (archivo aún no creado, lock momentáneo): el llamador lo trata como "sin señal".
async function readTail(filePath: string, maxBytes: number): Promise<string> {
  let handle;
  try {
    handle = await open(filePath, "r");
  } catch {
    return "";
  }
  try {
    const info = await handle.stat();
    const start = Math.max(0, info.size - maxBytes);
    const length = info.size - start;
    if (length <= 0) {
      return "";
    }
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    let text = buffer.toString("utf8");
    if (start > 0) {
      const firstNewline = text.indexOf("\n");
      text = firstNewline >= 0 ? text.slice(firstNewline + 1) : "";
    }
    return text;
  } catch {
    return "";
  } finally {
    await handle.close().catch(() => undefined);
  }
}

// Lee la cabecera del archivo para extraer el cwd de la sesión (aparece en las
// primeras líneas). undefined si no se encuentra (archivo vacío/ilegible).
async function readSessionCwd(filePath: string): Promise<string | undefined> {
  let handle;
  try {
    handle = await open(filePath, "r");
  } catch {
    return undefined;
  }
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
    const text = buffer.toString("utf8", 0, bytesRead);
    for (const line of text.split("\n")) {
      if (line.trim().length === 0) {
        continue;
      }
      let record: Record<string, unknown> | undefined;
      try {
        record = asRecord(JSON.parse(line) as unknown);
      } catch {
        continue;
      }
      const cwd = record ? nonEmptyString(record.cwd) : undefined;
      if (cwd) {
        return cwd;
      }
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

// ── Parseo de la señal de fin de turno ──────────────────────────────────────

type TopLevelMessage = {
  role: "user" | "assistant";
  stopReason: string | undefined;
  ts: number;
};

function parseTimestamp(value: unknown): number {
  const text = nonEmptyString(value);
  if (!text) {
    return 0;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Extrae el último mensaje de NIVEL SUPERIOR del texto del .jsonl. Ignora:
//  - líneas que no son mensajes (summary, ai-title, last-prompt, system…),
//  - mensajes con `parentToolUseId`/`parent_tool_use_id` (son de un sub-agente Task,
//    no del turno principal; su `end_turn` interno NO cierra nuestro turno).
// El último de los que quedan es el estado real de la conversación de nivel superior.
function lastTopLevelMessage(jsonlText: string): TopLevelMessage | undefined {
  const lines = jsonlText.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line === undefined || line.trim().length === 0) {
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
    const isSubAgent =
      record.parentToolUseId != null || record.parent_tool_use_id != null;
    if (isSubAgent) {
      continue;
    }
    const message = asRecord(record.message);
    const role = nonEmptyString(message?.role) ?? nonEmptyString(record.type);
    if (role !== "user" && role !== "assistant") {
      continue;
    }
    return {
      role,
      stopReason: nonEmptyString(message?.stop_reason),
      ts: parseTimestamp(record.timestamp),
    };
  }
  return undefined;
}

// True cuando el .jsonl muestra el turno cerrado: último mensaje top-level =
// assistant con stop_reason end_turn, fechado en/después del envío. El requisito de
// frescura (ts ≥ sinceMs) evita confundir el end_turn del turno ANTERIOR (el idle
// previo al envío) con el cierre del turno que acabamos de disparar.
function isTurnComplete(jsonlText: string, sinceMs: number): boolean {
  const last = lastTopLevelMessage(jsonlText);
  if (!last) {
    return false;
  }
  return (
    last.role === "assistant" &&
    last.stopReason === "end_turn" &&
    last.ts >= sinceMs
  );
}

// ── Watcher de un directorio (creación + cambios), con debounce ──────────────

function watchDirectory(
  directory: string,
  onChange: () => void,
  debounceMs = 150,
): vscode.Disposable {
  let timer: NodeJS.Timeout | undefined;
  let watcher: fs.FSWatcher | undefined;
  const fire = (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(onChange, debounceMs);
  };
  try {
    watcher = fs.watch(directory, () => fire());
  } catch {
    watcher = undefined;
  }
  return new vscode.Disposable(() => {
    if (timer) {
      clearTimeout(timer);
    }
    watcher?.close();
  });
}

// ── API pública ─────────────────────────────────────────────────────────────

// Lista los session-ids (basename sin extensión) de los .jsonl ya presentes en el
// directorio del proyecto. Es el BASELINE: la sesión que el ciclo cree luego será
// la que NO esté en este conjunto. Vacío si el directorio aún no existe.
export async function listSessionIds(cwd: string): Promise<Set<string>> {
  const directory = sessionDirFor(cwd);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return new Set<string>();
  }
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".jsonl")) {
      ids.add(path.basename(entry.name, ".jsonl"));
    }
  }
  return ids;
}

// Espera el .jsonl de la sesión recién abierta: el primer archivo del directorio del
// proyecto que (1) NO estaba en el baseline, (2) cuyo cwd cae bajo el proyecto y
// (3) fue tocado en/después del envío. Devuelve su session-id. Observa el directorio
// (y su padre, por si aún no existe) + poll de respaldo. Rechaza con "open_no_session_id"
// al expirar y con "aborted" ante un stop duro.
export function captureNewSession(
  cwd: string,
  baseline: ReadonlySet<string>,
  sinceMs: number,
  timeoutMs: number,
  abort: AbortLike,
  log: (message: string) => void,
): Promise<string> {
  const directory = sessionDirFor(cwd);
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let evaluating = false;

    const finish = (run: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      clearInterval(poller);
      dirWatcher.dispose();
      parentWatcher.dispose();
      abortSub.dispose();
      run();
    };

    const evaluate = (): void => {
      if (settled || evaluating) {
        return;
      }
      evaluating = true;
      void (async () => {
        try {
          let entries;
          try {
            entries = await readdir(directory, { withFileTypes: true });
          } catch {
            return; // el dir aún no existe; seguimos esperando
          }
          for (const entry of entries) {
            if (
              !entry.isFile() ||
              !entry.name.toLowerCase().endsWith(".jsonl")
            ) {
              continue;
            }
            const sessionId = path.basename(entry.name, ".jsonl");
            if (baseline.has(sessionId)) {
              continue;
            }
            const filePath = path.join(directory, entry.name);
            let info;
            try {
              info = await stat(filePath);
            } catch {
              continue;
            }
            // Frescura con holgura de reloj: el archivo pudo crearse milisegundos
            // ANTES de que registráramos sinceMs. 5 s de tolerancia evita descartar
            // la sesión correcta sin admitir una sesión vieja del baseline.
            if (info.mtimeMs + 5000 < sinceMs) {
              continue;
            }
            const sessionCwd = await readSessionCwd(filePath);
            if (sessionCwd && !isCwdUnderProject(sessionCwd, cwd)) {
              continue; // .jsonl de otro proyecto que cayó en el mismo dir codificado
            }
            log(
              `captura: sesión nueva ${sessionId} (cwd=${sessionCwd ?? "?"})`,
            );
            finish(() => resolve(sessionId));
            return;
          }
        } finally {
          evaluating = false;
        }
      })();
    };

    const timer = setTimeout(
      () => finish(() => reject(new Error("open_no_session_id"))),
      timeoutMs,
    );
    const poller = setInterval(evaluate, POLL_INTERVAL_MS);
    const dirWatcher = watchDirectory(directory, evaluate);
    const parentWatcher = watchDirectory(projectsDirectory(), evaluate);
    const abortSub = abort.onChange(() => {
      if (abort.hard) {
        finish(() => reject(new Error("aborted")));
      }
    });
    evaluate();
  });
}

// Barrera dura: bloquea hasta que el .jsonl de la sesión muestre el turno cerrado
// (último mensaje top-level = assistant end_turn, fechado ≥ envío). Observa el
// archivo (y su directorio) + poll de respaldo. Timeout → turn_timeout. Stop duro →
// rechaza con "aborted".
export function awaitTurnComplete(
  cwd: string,
  sessionId: string,
  sinceMs: number,
  timeoutMs: number,
  abort: AbortLike,
  log: (message: string) => void,
): Promise<TurnLogOutcome> {
  const filePath = path.join(sessionDirFor(cwd), `${sessionId}.jsonl`);
  return new Promise<TurnLogOutcome>((resolve, reject) => {
    let settled = false;
    let evaluating = false;

    const finish = (run: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      clearInterval(poller);
      fileWatcher.dispose();
      dirWatcher.dispose();
      abortSub.dispose();
      run();
    };

    const evaluate = (): void => {
      if (settled || evaluating) {
        return;
      }
      evaluating = true;
      void (async () => {
        try {
          const tail = await readTail(filePath, TAIL_BYTES);
          if (tail.length === 0) {
            return;
          }
          if (isTurnComplete(tail, sinceMs)) {
            log(`barrera: turno cerrado (end_turn) en ${sessionId}`);
            finish(() => resolve({ kind: "completed" }));
          }
        } finally {
          evaluating = false;
        }
      })();
    };

    const timer = setTimeout(() => {
      log(`barrera: TIMEOUT esperando end_turn en ${sessionId}`);
      finish(() => resolve({ kind: "turn_timeout" }));
    }, timeoutMs);
    const poller = setInterval(evaluate, POLL_INTERVAL_MS);
    const fileWatcher = watchFile(filePath, evaluate);
    const dirWatcher = watchDirectory(sessionDirFor(cwd), evaluate);
    const abortSub = abort.onChange(() => {
      if (abort.hard) {
        finish(() => reject(new Error("aborted")));
      }
    });
    evaluate();
  });
}

// Observa un archivo concreto. Tolera que aún no exista (el watch fallará y caemos
// al poll + watcher de directorio del llamador).
function watchFile(
  filePath: string,
  onChange: () => void,
  debounceMs = 120,
): vscode.Disposable {
  let timer: NodeJS.Timeout | undefined;
  let watcher: fs.FSWatcher | undefined;
  const fire = (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(onChange, debounceMs);
  };
  try {
    watcher = fs.watch(filePath, () => fire());
  } catch {
    watcher = undefined;
  }
  return new vscode.Disposable(() => {
    if (timer) {
      clearTimeout(timer);
    }
    watcher?.close();
  });
}
