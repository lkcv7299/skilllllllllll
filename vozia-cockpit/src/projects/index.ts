import * as path from "node:path";
import * as vscode from "vscode";
import { AnchoredProject, CockpitStateStore } from "../state";

const VIEW_ID = "cockpit.projects";
const ANCHOR_COMMAND = "cockpit.project.anchor";
const OPEN_COMMAND = "cockpit.project.open";
const OPEN_HERE_COMMAND = "cockpit.project.openHere";
const SET_ACTIVE_COMMAND = "cockpit.project.setActive";
const DEFAULT_HANDOFF_GLOBS = [
  "docs/HANDOFF-SESSION-*.md",
  "docs/handoffs/HANDOFF-SESSION-*.md",
];

class ProjectTreeItem extends vscode.TreeItem {
  public constructor(
    public readonly project: AnchoredProject,
    isActive: boolean,
  ) {
    super(project.name, vscode.TreeItemCollapsibleState.None);

    this.contextValue = "cockpit.project";
    this.description = isActive ? "Activo" : undefined;
    this.iconPath = new vscode.ThemeIcon(
      isActive ? "star-full" : "folder",
      isActive
        ? new vscode.ThemeColor("charts.yellow")
        : new vscode.ThemeColor("foreground"),
    );
    this.tooltip = new vscode.MarkdownString(
      `${isActive ? "**Proyecto activo**\n\n" : ""}${project.path}`,
    );
    this.command = {
      command: SET_ACTIVE_COMMAND,
      title: "Fijar proyecto activo",
      arguments: [project.id],
    };
  }
}

class ProjectsProvider
  implements vscode.TreeDataProvider<ProjectTreeItem>, vscode.Disposable
{
  private readonly changeEmitter =
    new vscode.EventEmitter<ProjectTreeItem | undefined>();
  private readonly stateSubscription: vscode.Disposable;

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public constructor(private readonly state: CockpitStateStore) {
    this.stateSubscription = state.onDidChange(() => {
      this.changeEmitter.fire(undefined);
    });
  }

  public getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(
    element?: ProjectTreeItem,
  ): vscode.ProviderResult<ProjectTreeItem[]> {
    if (element) {
      return [];
    }

    return this.state.anchoredProjects.map(
      (project) =>
        new ProjectTreeItem(
          project,
          project.id === this.state.activeProjectId,
        ),
    );
  }

  public dispose(): void {
    this.stateSubscription.dispose();
    this.changeEmitter.dispose();
  }
}

function projectFromArgument(
  argument: ProjectTreeItem | AnchoredProject | string | undefined,
  state: CockpitStateStore,
): AnchoredProject | undefined {
  if (argument instanceof ProjectTreeItem) {
    return argument.project;
  }

  const projectId =
    typeof argument === "string"
      ? argument
      : argument && typeof argument.id === "string"
        ? argument.id
        : undefined;

  return state.anchoredProjects.find(
    (project) => project.id === projectId,
  );
}

function normalizedPath(folderPath: string): string {
  return path.resolve(folderPath).toLocaleLowerCase();
}

function projectSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "project";
}

function uniqueProjectId(
  name: string,
  projects: AnchoredProject[],
): string {
  const baseId = projectSlug(name);
  const usedIds = new Set(projects.map((project) => project.id));

  if (!usedIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (usedIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}

async function anchorFolder(state: CockpitStateStore): Promise<void> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Anclar carpeta",
    title: "Anclar proyecto",
  });
  const folder = selected?.[0];
  if (!folder) {
    return;
  }

  const folderPath = path.resolve(folder.fsPath);
  const existing = state.anchoredProjects.find(
    (project) =>
      normalizedPath(project.path) === normalizedPath(folderPath),
  );
  if (existing) {
    await state.setActiveProject(existing.id);
    await vscode.window.showInformationMessage(
      `${existing.name} ya estaba anclado y ahora es el proyecto activo.`,
    );
    return;
  }

  const name = path.basename(folderPath);
  const project: AnchoredProject = {
    id: uniqueProjectId(name, state.anchoredProjects),
    name,
    path: folderPath,
    handoffGlobs: [...DEFAULT_HANDOFF_GLOBS],
  };

  await state.addAnchoredProject(project);
  await vscode.window.showInformationMessage(
    `${project.name} quedó anclado.`,
  );
}

async function openProject(
  argument: ProjectTreeItem | AnchoredProject | string | undefined,
  state: CockpitStateStore,
): Promise<void> {
  const project = projectFromArgument(argument, state);
  if (!project) {
    await vscode.window.showErrorMessage(
      "No se pudo identificar el proyecto que se abrirá.",
    );
    return;
  }

  await vscode.commands.executeCommand(
    "vscode.openFolder",
    vscode.Uri.file(project.path),
    { forceNewWindow: true },
  );
}

// Abre una sesión de Claude con el cwd del proyecto en ESTA MISMA ventana (tab
// aislada, memoria/CLAUDE.md propios), vía el comando que añade nuestro parche a la
// extensión de Claude. NO recarga la ventana.
async function openProjectHere(
  argument: ProjectTreeItem | AnchoredProject | string | undefined,
  state: CockpitStateStore,
): Promise<void> {
  const project = projectFromArgument(argument, state);
  if (!project) {
    await vscode.window.showErrorMessage(
      "No se pudo identificar el proyecto que se abrirá.",
    );
    return;
  }

  try {
    await vscode.commands.executeCommand(
      "claude-vscode.openInFolder",
      project.path,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const choice = await vscode.window.showErrorMessage(
      `No pude abrir Claude en ${project.name}: el parche no está activo (${message}). Re-aplícalo y recarga la ventana.`,
      "Re-aplicar parche",
    );
    if (choice === "Re-aplicar parche") {
      await vscode.commands.executeCommand("cockpit.reapplyClaudePatch");
    }
  }
}

async function setActiveProject(
  argument: ProjectTreeItem | AnchoredProject | string | undefined,
  state: CockpitStateStore,
): Promise<void> {
  const project = projectFromArgument(argument, state);
  if (!project) {
    await vscode.window.showErrorMessage(
      "No se pudo identificar el proyecto activo.",
    );
    return;
  }

  await state.setActiveProject(project.id);
}

export function registerProjects(
  context: vscode.ExtensionContext,
  state: CockpitStateStore,
): void {
  const provider = new ProjectsProvider(state);

  context.subscriptions.push(
    provider,
    vscode.window.registerTreeDataProvider(VIEW_ID, provider),
    vscode.commands.registerCommand(ANCHOR_COMMAND, () =>
      anchorFolder(state),
    ),
    vscode.commands.registerCommand(
      OPEN_COMMAND,
      (
        argument:
          | ProjectTreeItem
          | AnchoredProject
          | string
          | undefined,
      ) => openProject(argument, state),
    ),
    vscode.commands.registerCommand(
      OPEN_HERE_COMMAND,
      (
        argument:
          | ProjectTreeItem
          | AnchoredProject
          | string
          | undefined,
      ) => openProjectHere(argument, state),
    ),
    vscode.commands.registerCommand(
      SET_ACTIVE_COMMAND,
      (
        argument:
          | ProjectTreeItem
          | AnchoredProject
          | string
          | undefined,
      ) => setActiveProject(argument, state),
    ),
  );
}
