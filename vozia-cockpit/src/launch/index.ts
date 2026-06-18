import * as vscode from "vscode";
import * as path from "node:path";
import { CockpitStateStore } from "../state";
import { openClaudeUri } from "../util/claudeUri";
import { findLatestProjectHandoff } from "./handoffResolver";
import {
  parseTemplateBlocks,
  TemplateBlock,
} from "./templateParser";

const VIEW_ID = "cockpit.launch";
const TEMPLATE_PATH =
  "C:\\VozIA-Project\\docs\\SESSION-FRAMING-TEMPLATE.md";
const HANDOFF_PLACEHOLDER_LINE =
  /^[^\r\n]*HANDOFF-SESSION-YYYYMMDD-CLAUDENN\.md[^\r\n]*$/m;

export type HandoffArgument =
  | string
  | vscode.Uri
  | {
      handoffPath?: string;
      path?: string;
      resourceUri?: vscode.Uri;
    };

class LaunchProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<
    vscode.TreeItem | undefined
  >();

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(
    element?: vscode.TreeItem,
  ): Promise<vscode.TreeItem[]> {
    if (element) {
      return [];
    }

    const startItem = new vscode.TreeItem(
      "▶ Iniciar (handoff + template)",
      vscode.TreeItemCollapsibleState.None,
    );
    startItem.iconPath = new vscode.ThemeIcon("play");
    startItem.tooltip =
      "Abre Claude Code con Message 1 pre-rellenado. No envía el mensaje.";
    startItem.command = {
      command: "cockpit.startSession",
      title: "Iniciar sesión",
    };

    try {
      const blocks = await readTemplateBlocks();
      return [
        startItem,
        ...blocks.map((block) => createTemplateBlockItem(block)),
      ];
    } catch (error) {
      const errorItem = new vscode.TreeItem(
        "No se pudo leer el template",
        vscode.TreeItemCollapsibleState.None,
      );
      errorItem.iconPath = new vscode.ThemeIcon("warning");
      errorItem.tooltip = errorMessage(error);
      return [startItem, errorItem];
    }
  }

  public refresh(): void {
    this.changeEmitter.fire(undefined);
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }
}

function createTemplateBlockItem(block: TemplateBlock): vscode.TreeItem {
  const item = new vscode.TreeItem(
    block.heading,
    vscode.TreeItemCollapsibleState.None,
  );
  item.description = "Copiar";
  item.iconPath = new vscode.ThemeIcon("copy");
  item.tooltip = `Copiar bloque: ${block.heading}`;
  item.command = {
    command: "cockpit.copyTemplateBlock",
    title: "Copiar bloque",
    arguments: [block.content],
  };
  return item;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readTemplateBlocks(): Promise<TemplateBlock[]> {
  const bytes = await vscode.workspace.fs.readFile(
    vscode.Uri.file(TEMPLATE_PATH),
  );
  return parseTemplateBlocks(Buffer.from(bytes).toString("utf8"));
}

function normalizeHandoffArgument(
  argument: HandoffArgument | undefined,
): string | undefined {
  if (typeof argument === "string") {
    return argument;
  }
  if (argument instanceof vscode.Uri) {
    return argument.fsPath;
  }
  if (!argument) {
    return undefined;
  }
  if (typeof argument.handoffPath === "string") {
    return argument.handoffPath;
  }
  if (typeof argument.path === "string") {
    return argument.path;
  }
  return argument.resourceUri?.fsPath;
}

async function validateExplicitHandoff(
  argument: HandoffArgument,
): Promise<string | undefined> {
  const suppliedPath = normalizeHandoffArgument(argument);
  if (!suppliedPath) {
    return undefined;
  }

  const absolutePath = path.resolve(suppliedPath);
  try {
    const stats = await vscode.workspace.fs.stat(
      vscode.Uri.file(absolutePath),
    );
    if ((stats.type & vscode.FileType.File) === 0) {
      throw new Error("La ruta no apunta a un archivo.");
    }
    return absolutePath;
  } catch (error) {
    void vscode.window.showWarningMessage(
      `No se encontró el handoff indicado: ${absolutePath}. ${errorMessage(error)}`,
    );
    return undefined;
  }
}

async function resolveHandoffPath(
  state: CockpitStateStore,
  explicitHandoff?: HandoffArgument,
): Promise<string | undefined> {
  if (explicitHandoff !== undefined) {
    return validateExplicitHandoff(explicitHandoff);
  }

  const project = state.activeProject;
  if (!project) {
    void vscode.window.showWarningMessage(
      "No hay un proyecto activo. Fija uno antes de iniciar la sesión.",
    );
    return undefined;
  }

  const latest = await findLatestProjectHandoff(project);
  if (!latest) {
    void vscode.window.showWarningMessage(
      `No se encontró ningún handoff para el proyecto activo "${project.name}".`,
    );
  }
  return latest;
}

export function buildSessionPrompt(
  messageOne: TemplateBlock,
  handoffPath: string,
): string {
  if (!HANDOFF_PLACEHOLDER_LINE.test(messageOne.content)) {
    throw new Error(
      "El bloque Message 1 no contiene la línea placeholder del handoff.",
    );
  }

  return messageOne.content.replace(
    HANDOFF_PLACEHOLDER_LINE,
    () => handoffPath,
  );
}

export async function startSession(
  state: CockpitStateStore,
  explicitHandoff?: HandoffArgument,
): Promise<void> {
  try {
    const handoffPath = await resolveHandoffPath(state, explicitHandoff);
    if (!handoffPath) {
      return;
    }

    const blocks = await readTemplateBlocks();
    const messageOne = blocks.find((block) =>
      block.heading.toLocaleLowerCase("es").includes("message 1"),
    );
    if (!messageOne) {
      void vscode.window.showWarningMessage(
        'El template no contiene un bloque cuyo encabezado incluya "Message 1".',
      );
      return;
    }

    const prompt = buildSessionPrompt(messageOne, handoffPath);
    const opened = await openClaudeUri({ prompt });
    if (!opened) {
      void vscode.window.showWarningMessage(
        "VS Code no pudo abrir el panel de Claude Code.",
      );
      return;
    }

    void vscode.window.showInformationMessage(
      "Claude Code se abrió con Message 1 pre-rellenado. Presiona Enter para enviarlo.",
    );
  } catch (error) {
    void vscode.window.showErrorMessage(
      `No se pudo iniciar la sesión: ${errorMessage(error)}`,
    );
  }
}

export function registerLaunch(
  context: vscode.ExtensionContext,
  state: CockpitStateStore,
): void {
  const provider = new LaunchProvider();
  // Vigila el template: si el usuario lo edita, los botones de bloques se actualizan solos.
  const templateWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      vscode.Uri.file(path.dirname(TEMPLATE_PATH)),
      path.basename(TEMPLATE_PATH),
    ),
  );
  context.subscriptions.push(
    provider,
    templateWatcher,
    templateWatcher.onDidChange(() => provider.refresh()),
    templateWatcher.onDidCreate(() => provider.refresh()),
    templateWatcher.onDidDelete(() => provider.refresh()),
    state.onDidChange(() => provider.refresh()),
    vscode.window.registerTreeDataProvider(VIEW_ID, provider),
    vscode.commands.registerCommand(
      "cockpit.copyTemplateBlock",
      async (content: unknown) => {
        if (typeof content !== "string") {
          void vscode.window.showWarningMessage(
            "No se pudo identificar el bloque del template.",
          );
          return;
        }
        await vscode.env.clipboard.writeText(content);
        vscode.window.setStatusBarMessage("Bloque copiado.", 2000);
      },
    ),
    vscode.commands.registerCommand(
      "cockpit.startSession",
      (handoff?: HandoffArgument) => startSession(state, handoff),
    ),
  );
}
