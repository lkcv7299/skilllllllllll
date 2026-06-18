import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

// El parche que expone "Open in Folder" en la extensión de Claude lo borra cualquier
// cosa que reescriba su extension.js (auto-update de Claude, o la vibe-ads). Este
// guardián lo re-aplica solo: al arrancar y cuando detecta que el archivo cambió.
const PATCHER_SCRIPT = path.join(
  os.homedir(),
  ".claude",
  "scripts",
  "claude-openInFolder-patch.js",
);
const EXTENSIONS_DIR = path.join(os.homedir(), ".vscode", "extensions");
const REAPPLY_COOLDOWN_MS = 15_000;
const WATCH_DEBOUNCE_MS = 3_000;

function newestClaudeExtensionDir(): string | undefined {
  let names: string[];
  try {
    names = fs
      .readdirSync(EXTENSIONS_DIR)
      .filter((name) => name.startsWith("anthropic.claude-code-"));
  } catch {
    return undefined;
  }

  return names
    .map((name) => path.join(EXTENSIONS_DIR, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    .at(0);
}

function runPatcher(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!fs.existsSync(PATCHER_SCRIPT)) {
      resolve(false);
      return;
    }
    execFile("node", [PATCHER_SCRIPT], (error) => resolve(!error));
  });
}

export function registerPatchKeeper(context: vscode.ExtensionContext): void {
  let lastRun = 0;
  let pending: ReturnType<typeof setTimeout> | undefined;

  const reapply = async (notify: boolean): Promise<void> => {
    lastRun = Date.now();
    const ok = await runPatcher();
    if (!notify) {
      return;
    }
    if (ok) {
      void vscode.window.showInformationMessage(
        "Parche de Claude re-aplicado. Recarga la ventana (Developer: Reload Window) para activarlo.",
      );
    } else {
      void vscode.window.showErrorMessage(
        "No pude re-aplicar el parche de Claude (¿falta el script o node en PATH?).",
      );
    }
  };

  // Al arrancar: por si un auto-update o la vibe-ads lo borró desde la última sesión.
  void reapply(false);

  // Vigila el extension.js de Claude; si algo lo reescribe, re-aplica. Cooldown +
  // debounce para no entrar en bucle con otros parcheadores que vigilen el mismo archivo.
  const extensionDir = newestClaudeExtensionDir();
  if (extensionDir) {
    try {
      const watcher = fs.watch(extensionDir, (_event, filename) => {
        if (filename && filename.toString() !== "extension.js") {
          return;
        }
        if (Date.now() - lastRun < REAPPLY_COOLDOWN_MS) {
          return;
        }
        if (pending) {
          clearTimeout(pending);
        }
        pending = setTimeout(() => {
          pending = undefined;
          void reapply(false);
        }, WATCH_DEBOUNCE_MS);
      });
      context.subscriptions.push({ dispose: () => watcher.close() });
    } catch {
      // Si fs.watch no está soportado, el reapply-al-arrancar + el comando manual bastan.
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("cockpit.reapplyClaudePatch", () =>
      reapply(true),
    ),
  );
}
