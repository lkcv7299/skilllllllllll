import { readFile } from "node:fs/promises";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// La extensión de Claude (parchada) escribe este marcador cada vez que el dueño
// selecciona una pestaña/sesión. Es la FUENTE DE VERDAD de la sesión activa: trae
// el session-id interno (el uuid del .jsonl) que la API de VS Code no expone.
export type ActiveSessionMarker = {
  sessionId: string;
  cwd: string;
  updatedAt: number;
};

const MARKER_FILE_NAME = "cockpit-active-session.json";

function markerDirectory(): string {
  return path.join(os.homedir(), ".claude");
}

function markerPath(): string {
  return path.join(markerDirectory(), MARKER_FILE_NAME);
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

// Parsea el marcador. Cualquier ausencia/forma inválida → undefined ("unknown"),
// de modo que el llamador cae al fallback de título/mtime sin romperse.
function parseMarker(raw: string): ActiveSessionMarker | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }

  const record = asRecord(parsed);
  if (!record) {
    return undefined;
  }

  const sessionId = nonEmptyString(record.sessionId);
  if (!sessionId) {
    return undefined;
  }

  const cwd = nonEmptyString(record.cwd) ?? "";
  const updatedAt =
    typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : 0;

  return { sessionId, cwd, updatedAt };
}

// Lee el marcador de la sesión activa. undefined = no hay marcador o es inválido
// (extensión sin parchar todavía): el llamador decide el fallback.
export async function readActiveSessionMarker(): Promise<
  ActiveSessionMarker | undefined
> {
  let raw: string;
  try {
    raw = await readFile(markerPath(), { encoding: "utf8" });
  } catch {
    return undefined;
  }
  return parseMarker(raw);
}

// Observa el marcador (y su directorio, por si el archivo aún no existe) y avisa,
// con debounce, cuando cambia. Devuelve un disposer para cerrar los watchers.
export function watchActiveSessionMarker(
  onChange: () => void,
  debounceMs = 150,
): () => void {
  const directory = markerDirectory();
  const targetName = MARKER_FILE_NAME;
  let timer: NodeJS.Timeout | undefined;
  let watcher: fs.FSWatcher | undefined;

  const fire = (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(onChange, debounceMs);
  };

  try {
    // Observamos el DIRECTORIO (no el archivo) para captar la primera creación
    // del marcador y sobrevivir a reemplazos atómicos (rename) de la extensión.
    watcher = fs.watch(directory, (_event, fileName) => {
      if (fileName === null || fileName === targetName) {
        fire();
      }
    });
  } catch {
    watcher = undefined;
  }

  return (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    watcher?.close();
  };
}
