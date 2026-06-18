import * as path from "node:path";
import * as vscode from "vscode";
import {
  LoopCycleLog,
  LoopEngine,
  LoopPhase,
  LoopStatus,
} from "./engine";

const VIEW_ID = "cockpit.loop";
const VIEW_TITLE = "Loop";

// Etiqueta legible de cada fase del Loop. El engine reporta la fase cruda; la vista
// la traduce al castellano del dueño. Un default defensivo cubre cualquier fase
// futura sin romper el render (la vista NUNCA debe crashear por un status raro).
const PHASE_LABELS: Readonly<Record<LoopPhase, string>> = {
  idle: "Detenido",
  opening: "Abriendo sesión",
  sending: "Enviando mensaje",
  awaiting_turn: "Esperando turno",
  awaiting_handoff: "Esperando handoff",
  advancing: "Avanzando al siguiente ciclo",
  stopped: "Detenido",
  faulted: "Falló",
};

function phaseLabel(phase: LoopPhase): string {
  return PHASE_LABELS[phase] ?? phase;
}

// Las fases en las que el Loop está efectivamente CORRIENDO. Gobierna qué botón de
// la barra de título se muestra (▶ vs ■) vía el contexto cockpit.loop.running, y el
// ícono/estado del header. idle/stopped/faulted = NO corriendo.
function isRunningPhase(phase: LoopPhase): boolean {
  return (
    phase === "opening" ||
    phase === "sending" ||
    phase === "awaiting_turn" ||
    phase === "awaiting_handoff" ||
    phase === "advancing"
  );
}

function basename(handoffPath: string | undefined): string | undefined {
  if (!handoffPath) {
    return undefined;
  }
  return path.basename(handoffPath);
}

// Extrae el número de sesión (CLAUDE169) del basename de un handoff para etiquetar
// las filas de ciclo de forma compacta. Si no matchea, cae al basename completo.
function handoffShortLabel(handoffPath: string | undefined): string | undefined {
  const name = basename(handoffPath);
  if (!name) {
    return undefined;
  }
  const match = /CLAUDE-?\d+(?:\.\d+)?/i.exec(name);
  return match ? match[0].toUpperCase() : name;
}

function formatDuration(durationMs: number | undefined): string | undefined {
  if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) {
    return undefined;
  }
  const totalSeconds = Math.floor(durationMs / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds} s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes} min`;
}

// Nodo del árbol: o el header (resumen vivo) o una fila por ciclo del log. Es un
// union discriminado por `kind` para que getTreeItem renderice cada uno sin castear.
type LoopTreeNode =
  | { kind: "header"; status: LoopStatus }
  | { kind: "cycle"; entry: LoopCycleLog };

function headerLabel(status: LoopStatus): string {
  const parts: string[] = [phaseLabel(status.phase)];
  parts.push(`Ciclo ${status.cycle}/${status.maxCycles}`);
  const handoff = handoffShortLabel(status.currentHandoff);
  if (handoff) {
    parts.push(handoff);
  }
  if (status.phase === "sending" && status.messageCount > 0) {
    parts.push(`enviando msg ${status.messageIndex}/${status.messageCount}`);
  }
  return parts.join(" · ");
}

function headerTreeItem(status: LoopStatus): vscode.TreeItem {
  const item = new vscode.TreeItem(
    headerLabel(status),
    vscode.TreeItemCollapsibleState.None,
  );
  item.contextValue = "cockpit.loop.header";
  const running = isRunningPhase(status.phase);
  if (status.phase === "faulted") {
    item.iconPath = new vscode.ThemeIcon(
      "error",
      new vscode.ThemeColor("errorForeground"),
    );
    item.description = status.fault ?? "falló";
  } else if (running) {
    item.iconPath = new vscode.ThemeIcon(
      "sync~spin",
      new vscode.ThemeColor("charts.green"),
    );
  } else {
    item.iconPath = new vscode.ThemeIcon("debug-stop");
  }

  const tooltip = new vscode.MarkdownString();
  tooltip.appendMarkdown(`**${phaseLabel(status.phase)}**\n\n`);
  tooltip.appendMarkdown(`Ciclo ${status.cycle} de ${status.maxCycles}\n\n`);
  if (status.currentHandoff) {
    tooltip.appendCodeblock(status.currentHandoff);
  }
  if (status.fault) {
    tooltip.appendMarkdown(`\n\nFalla: ${status.fault}`);
  }
  item.tooltip = tooltip;
  return item;
}

function cycleLabel(entry: LoopCycleLog): string {
  const from = handoffShortLabel(entry.fromHandoff) ?? "?";
  const to = handoffShortLabel(entry.toHandoff);
  const transition = to ? `${from}→${to}` : from;
  const mark = entry.outcome === "ok" ? "✓" : "✗";
  return `Ciclo ${entry.cycle} ${mark} ${transition}`;
}

function cycleDescription(entry: LoopCycleLog): string | undefined {
  if (entry.outcome === "faulted") {
    return entry.reason ?? "falló";
  }
  const duration = formatDuration(entry.durationMs);
  return duration ? `(${duration})` : undefined;
}

function cycleTreeItem(entry: LoopCycleLog): vscode.TreeItem {
  const item = new vscode.TreeItem(
    cycleLabel(entry),
    vscode.TreeItemCollapsibleState.None,
  );
  item.contextValue = "cockpit.loop.cycle";
  const faulted = entry.outcome === "faulted";
  item.iconPath = new vscode.ThemeIcon(
    faulted ? "circle-slash" : "pass-filled",
    faulted
      ? new vscode.ThemeColor("errorForeground")
      : new vscode.ThemeColor("charts.green"),
  );
  const description = cycleDescription(entry);
  if (description) {
    item.description = description;
  }
  const tooltip = new vscode.MarkdownString();
  tooltip.appendMarkdown(`**Ciclo ${entry.cycle}** — ${entry.outcome}\n\n`);
  if (entry.fromHandoff) {
    tooltip.appendMarkdown(`Desde: \`${path.basename(entry.fromHandoff)}\`\n\n`);
  }
  if (entry.toHandoff) {
    tooltip.appendMarkdown(`Hacia: \`${path.basename(entry.toHandoff)}\`\n\n`);
  }
  if (entry.sessionId) {
    tooltip.appendMarkdown(`Sesión: ${entry.sessionId}\n\n`);
  }
  if (entry.reason) {
    tooltip.appendMarkdown(`Motivo: ${entry.reason}`);
  }
  item.tooltip = tooltip;
  return item;
}

class LoopProvider
  implements vscode.TreeDataProvider<LoopTreeNode>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<
    LoopTreeNode | undefined
  >();
  private readonly engineSubscription: vscode.Disposable;

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public constructor(private readonly engine: LoopEngine) {
    this.engineSubscription = engine.onDidChange(() => this.refresh());
  }

  public getTreeItem(element: LoopTreeNode): vscode.TreeItem {
    return element.kind === "header"
      ? headerTreeItem(element.status)
      : cycleTreeItem(element.entry);
  }

  public getChildren(element?: LoopTreeNode): LoopTreeNode[] {
    if (element) {
      return [];
    }

    const status = this.safeStatus();
    // Sin actividad (idle/stopped sin log) dejamos que el viewsWelcome muestre el
    // estado vacío "Loop detenido. ▶ Iniciar loop para arrancar." devolviendo [].
    const idle = status.phase === "idle" || status.phase === "stopped";
    if (idle && status.log.length === 0) {
      return [];
    }

    const nodes: LoopTreeNode[] = [{ kind: "header", status }];
    // Ciclos más reciente primero, sin mutar el array del engine.
    for (const entry of [...status.log].reverse()) {
      nodes.push({ kind: "cycle", entry });
    }
    return nodes;
  }

  public refresh(): void {
    this.changeEmitter.fire(undefined);
  }

  // Lee el status defensivamente: si el engine tira (no debería), devolvemos un
  // status idle vacío para que la vista no crashee. Es el guardarraíl pedido:
  // la vista NUNCA rompe ante un status faulted/vacío.
  private safeStatus(): LoopStatus {
    try {
      return this.engine.getStatus();
    } catch {
      return {
        phase: "idle",
        cycle: 0,
        maxCycles: 0,
        messageIndex: 0,
        messageCount: 0,
        log: [],
      };
    }
  }

  public dispose(): void {
    this.engineSubscription.dispose();
    this.changeEmitter.dispose();
  }
}

// Crea la TreeView del Loop, la conecta al engine (refresca en cada onDidChange) y
// mantiene el contexto `cockpit.loop.running` para que los botones ▶/■ de la barra
// de título alternen. Devuelve un Disposable que el llamador agrega a subscriptions.
export function createLoopView(engine: LoopEngine): vscode.Disposable {
  const provider = new LoopProvider(engine);
  const treeView = vscode.window.createTreeView(VIEW_ID, {
    treeDataProvider: provider,
  });
  treeView.title = VIEW_TITLE;

  const updateRunningContext = (): void => {
    let running = false;
    try {
      running = isRunningPhase(engine.getStatus().phase);
    } catch {
      running = false;
    }
    void vscode.commands.executeCommand(
      "setContext",
      "cockpit.loop.running",
      running,
    );
  };
  updateRunningContext();

  const engineSubscription = engine.onDidChange(updateRunningContext);

  return new vscode.Disposable(() => {
    engineSubscription.dispose();
    treeView.dispose();
    provider.dispose();
  });
}
