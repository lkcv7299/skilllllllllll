import { glob } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  AnchoredProject,
  CockpitStateStore,
  HandoffMark,
} from "../state";
import {
  compareHandoffs,
  createHandoffRecord,
  HandoffRecord,
  handoffPathKey,
  resolveHandoffGlob,
} from "./model";

const VIEW_ID = "cockpit.handoffs";
const COPY_PATH_COMMAND = "cockpit.handoff.copyPath";
const MARK_USED_COMMAND = "cockpit.handoff.markUsed";
const MARK_UNUSED_COMMAND = "cockpit.handoff.markUnused";
const START_HANDOFF_COMMAND = "cockpit.handoff.start";
const START_SESSION_COMMAND = "cockpit.startSession";

class HandoffTreeItem extends vscode.TreeItem {
  public constructor(
    public readonly handoff: HandoffRecord,
    mark: HandoffMark | undefined,
  ) {
    super(handoff.fileName, vscode.TreeItemCollapsibleState.None);

    const isMarked = mark !== undefined;
    const status = mark === "discarded" ? "Descartado" : "Usado";

    this.contextValue = isMarked
      ? "cockpit.handoff.used"
      : "cockpit.handoff.new";
    this.description = isMarked ? status : "🆕";
    this.iconPath = new vscode.ThemeIcon(
      isMarked ? "check" : "file",
      isMarked
        ? new vscode.ThemeColor("disabledForeground")
        : undefined,
    );
    this.resourceUri = vscode.Uri.file(handoff.absolutePath);

    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(
      isMarked ? `**${status}**\n\n` : "**Nuevo handoff**\n\n",
    );
    tooltip.appendCodeblock(handoff.absolutePath);
    this.tooltip = tooltip;
    this.command = {
      command: "vscode.open",
      title: "Abrir handoff",
      arguments: [this.resourceUri],
    };
  }
}

class HandoffsProvider
  implements
    vscode.TreeDataProvider<HandoffTreeItem>,
    vscode.Disposable
{
  private readonly changeEmitter =
    new vscode.EventEmitter<HandoffTreeItem | undefined>();
  private readonly stateSubscription: vscode.Disposable;
  private readonly watcherDisposables: vscode.Disposable[] = [];
  private readonly recentCreateTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private watcherSignature = "";
  private showArchived = false;

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public constructor(private readonly state: CockpitStateStore) {
    this.configureWatchers();
    this.stateSubscription = state.onDidChange(() => {
      this.configureWatchers();
      this.refresh();
    });
  }

  public getTreeItem(element: HandoffTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(
    element?: HandoffTreeItem,
  ): Promise<HandoffTreeItem[]> {
    if (element) {
      return [];
    }

    const project = this.state.activeProject;
    if (!project) {
      return [];
    }

    try {
      const handoffs = await findProjectHandoffs(project);
      const marks = this.state.handoffMarks;
      return handoffs
        .filter(
          (handoff) =>
            this.showArchived || marks[handoff.absolutePath] === undefined,
        )
        .map(
          (handoff) =>
            new HandoffTreeItem(handoff, marks[handoff.absolutePath]),
        );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(
        `No se pudieron listar los handoffs: ${message}`,
      );
      return [];
    }
  }

  public refresh(): void {
    this.changeEmitter.fire(undefined);
  }

  public toggleArchived(): void {
    this.showArchived = !this.showArchived;
    this.refresh();
  }

  public get archivedVisible(): boolean {
    return this.showArchived;
  }

  public dispose(): void {
    this.disposeWatchers();
    this.stateSubscription.dispose();
    this.changeEmitter.dispose();
    for (const timer of this.recentCreateTimers.values()) {
      clearTimeout(timer);
    }
    this.recentCreateTimers.clear();
  }

  private configureWatchers(): void {
    const project = this.state.activeProject;
    const signature = project
      ? JSON.stringify([
          project.id,
          path.resolve(project.path),
          project.handoffGlobs,
        ])
      : "";

    if (signature === this.watcherSignature) {
      return;
    }

    this.disposeWatchers();
    this.watcherSignature = signature;

    if (!project) {
      return;
    }

    for (const handoffGlob of project.handoffGlobs) {
      const glob = resolveHandoffGlob(project.path, handoffGlob);
      if (!glob.pattern) {
        continue;
      }

      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(
          vscode.Uri.file(glob.basePath),
          glob.pattern,
        ),
      );
      this.watcherDisposables.push(
        watcher,
        watcher.onDidCreate((uri) => this.handleCreatedHandoff(uri)),
        watcher.onDidChange(() => this.refresh()),
        watcher.onDidDelete(() => this.refresh()),
      );
    }
  }

  private handleCreatedHandoff(uri: vscode.Uri): void {
    const key = handoffPathKey(uri.fsPath);
    if (this.recentCreateTimers.has(key)) {
      return;
    }

    this.refresh();
    void vscode.window.showInformationMessage(
      `Nuevo handoff: ${path.basename(uri.fsPath)}`,
    );

    const timer = setTimeout(() => {
      this.recentCreateTimers.delete(key);
    }, 1_000);
    this.recentCreateTimers.set(key, timer);
  }

  private disposeWatchers(): void {
    for (const disposable of this.watcherDisposables.splice(0)) {
      disposable.dispose();
    }
  }
}

async function findProjectHandoffs(
  project: AnchoredProject,
): Promise<HandoffRecord[]> {
  const matches = await Promise.all(
    project.handoffGlobs.map(async (handoffGlob) => {
      const resolvedGlob = resolveHandoffGlob(
        project.path,
        handoffGlob,
      );
      if (!resolvedGlob.pattern) {
        return [];
      }

      const filePaths: string[] = [];
      for await (const relativePath of glob(resolvedGlob.pattern, {
        cwd: resolvedGlob.basePath,
      })) {
        filePaths.push(
          path.resolve(resolvedGlob.basePath, relativePath),
        );
      }
      return filePaths;
    }),
  );

  const handoffsByPath = new Map<string, HandoffRecord>();
  for (const filePath of matches.flat()) {
    const handoff = createHandoffRecord(filePath);
    handoffsByPath.set(
      handoffPathKey(handoff.absolutePath),
      handoff,
    );
  }

  return [...handoffsByPath.values()].sort(compareHandoffs);
}

function handoffPathFromArgument(
  argument: HandoffTreeItem | vscode.Uri | string | undefined,
): string | undefined {
  if (argument instanceof HandoffTreeItem) {
    return argument.handoff.absolutePath;
  }

  if (argument instanceof vscode.Uri) {
    return path.resolve(argument.fsPath);
  }

  if (typeof argument === "string" && argument.trim()) {
    return path.resolve(argument);
  }

  return undefined;
}

async function requireHandoffPath(
  argument: HandoffTreeItem | vscode.Uri | string | undefined,
): Promise<string | undefined> {
  const handoffPath = handoffPathFromArgument(argument);
  if (handoffPath) {
    return handoffPath;
  }

  await vscode.window.showErrorMessage(
    "No se pudo identificar el handoff.",
  );
  return undefined;
}

async function copyHandoffPath(
  argument: HandoffTreeItem | vscode.Uri | string | undefined,
): Promise<void> {
  const handoffPath = await requireHandoffPath(argument);
  if (!handoffPath) {
    return;
  }

  await vscode.env.clipboard.writeText(handoffPath);
  vscode.window.setStatusBarMessage(
    `Path copiado: ${path.basename(handoffPath)}`,
    2_000,
  );
}

async function markHandoffUsed(
  argument: HandoffTreeItem | vscode.Uri | string | undefined,
  state: CockpitStateStore,
): Promise<void> {
  const handoffPath = await requireHandoffPath(argument);
  if (!handoffPath) {
    return;
  }

  const nextMark =
    state.handoffMarks[handoffPath] === "used" ? undefined : "used";
  await state.setHandoffMark(handoffPath, nextMark);
}

async function markHandoffUnused(
  argument: HandoffTreeItem | vscode.Uri | string | undefined,
  state: CockpitStateStore,
): Promise<void> {
  const handoffPath = await requireHandoffPath(argument);
  if (!handoffPath) {
    return;
  }

  await state.setHandoffMark(handoffPath, undefined);
}

async function startWithHandoff(
  argument: HandoffTreeItem | vscode.Uri | string | undefined,
): Promise<void> {
  const handoffPath = await requireHandoffPath(argument);
  if (!handoffPath) {
    return;
  }

  await vscode.commands.executeCommand(
    START_SESSION_COMMAND,
    handoffPath,
  );
}

export function registerHandoffs(
  context: vscode.ExtensionContext,
  state: CockpitStateStore,
): void {
  const provider = new HandoffsProvider(state);
  const treeView = vscode.window.createTreeView(VIEW_ID, {
    treeDataProvider: provider,
  });
  const updateViewDescription = (): void => {
    const base = state.activeProject?.name ?? "";
    treeView.description = provider.archivedVisible ? `${base} · +usados` : base;
  };
  updateViewDescription();

  context.subscriptions.push(
    provider,
    treeView,
    state.onDidChange(updateViewDescription),
    vscode.commands.registerCommand("cockpit.handoff.toggleArchived", () => {
      provider.toggleArchived();
      updateViewDescription();
    }),
    vscode.commands.registerCommand(
      COPY_PATH_COMMAND,
      (
        argument: HandoffTreeItem | vscode.Uri | string | undefined,
      ) => copyHandoffPath(argument),
    ),
    vscode.commands.registerCommand(
      MARK_USED_COMMAND,
      (
        argument: HandoffTreeItem | vscode.Uri | string | undefined,
      ) => markHandoffUsed(argument, state),
    ),
    vscode.commands.registerCommand(
      MARK_UNUSED_COMMAND,
      (
        argument: HandoffTreeItem | vscode.Uri | string | undefined,
      ) => markHandoffUnused(argument, state),
    ),
    vscode.commands.registerCommand(
      START_HANDOFF_COMMAND,
      (
        argument: HandoffTreeItem | vscode.Uri | string | undefined,
      ) => startWithHandoff(argument),
    ),
  );
}
