import { glob, readFile } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  AnchoredProject,
  CockpitStateStore,
  PromptMark,
} from "../state";
import {
  comparePrompts,
  createPromptRecord,
  PromptRecord,
  promptPathKey,
  resolvePromptsGlob,
} from "./model";

const VIEW_ID = "cockpit.prompts";
const COPY_CONTENT_COMMAND = "cockpit.prompt.copyContent";
const COPY_PATH_COMMAND = "cockpit.prompt.copyPath";
const MARK_USED_COMMAND = "cockpit.prompt.markUsed";
const MARK_UNUSED_COMMAND = "cockpit.prompt.markUnused";
const TOGGLE_ARCHIVED_COMMAND = "cockpit.prompt.toggleArchived";

class PromptTreeItem extends vscode.TreeItem {
  public constructor(
    public readonly prompt: PromptRecord,
    mark: PromptMark | undefined,
  ) {
    super(prompt.fileName, vscode.TreeItemCollapsibleState.None);

    const isMarked = mark !== undefined;
    const status = mark === "discarded" ? "Descartado" : "Usado";
    const subfolder = path.posix.dirname(prompt.relativePath);

    this.contextValue = isMarked
      ? "cockpit.prompt.used"
      : "cockpit.prompt.new";
    this.description =
      subfolder && subfolder !== "."
        ? isMarked
          ? `${subfolder} · ${status}`
          : subfolder
        : isMarked
          ? status
          : "🆕";
    this.iconPath = new vscode.ThemeIcon(
      isMarked ? "check" : "file",
      isMarked
        ? new vscode.ThemeColor("disabledForeground")
        : undefined,
    );
    this.resourceUri = vscode.Uri.file(prompt.absolutePath);

    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(
      isMarked ? `**${status}**\n\n` : "**Prompt**\n\n",
    );
    tooltip.appendMarkdown(`\`${prompt.relativePath}\`\n\n`);
    tooltip.appendMarkdown("_Clic: copiar contenido al portapapeles_");
    this.tooltip = tooltip;
    this.command = {
      command: COPY_CONTENT_COMMAND,
      title: "Copiar prompt",
      arguments: [this],
    };
  }
}

class PromptsProvider
  implements
    vscode.TreeDataProvider<PromptTreeItem>,
    vscode.Disposable
{
  private readonly changeEmitter =
    new vscode.EventEmitter<PromptTreeItem | undefined>();
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

  public getTreeItem(element: PromptTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(
    element?: PromptTreeItem,
  ): Promise<PromptTreeItem[]> {
    if (element) {
      return [];
    }

    const project = this.state.activeProject;
    if (!project) {
      return [];
    }

    try {
      const prompts = await findProjectPrompts(project);
      const marks = this.state.promptMarks;
      return prompts
        .filter(
          (prompt) =>
            this.showArchived || marks[prompt.absolutePath] === undefined,
        )
        .map(
          (prompt) =>
            new PromptTreeItem(prompt, marks[prompt.absolutePath]),
        );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(
        `No se pudieron listar los prompts: ${message}`,
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
      ? JSON.stringify([project.id, path.resolve(project.path)])
      : "";

    if (signature === this.watcherSignature) {
      return;
    }

    this.disposeWatchers();
    this.watcherSignature = signature;

    if (!project) {
      return;
    }

    const resolvedGlob = resolvePromptsGlob(project.path);
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.Uri.file(resolvedGlob.basePath),
        resolvedGlob.pattern,
      ),
    );
    this.watcherDisposables.push(
      watcher,
      watcher.onDidCreate((uri) => this.handleCreatedPrompt(uri)),
      watcher.onDidChange(() => this.refresh()),
      watcher.onDidDelete(() => this.refresh()),
    );
  }

  private handleCreatedPrompt(uri: vscode.Uri): void {
    const key = promptPathKey(uri.fsPath);
    if (this.recentCreateTimers.has(key)) {
      return;
    }

    this.refresh();
    void vscode.window.showInformationMessage(
      `Nuevo prompt: ${path.basename(uri.fsPath)}`,
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

async function findProjectPrompts(
  project: AnchoredProject,
): Promise<PromptRecord[]> {
  const resolvedGlob = resolvePromptsGlob(project.path);

  const promptsByPath = new Map<string, PromptRecord>();
  for await (const relativePath of glob(resolvedGlob.pattern, {
    cwd: resolvedGlob.basePath,
  })) {
    const filePath = path.resolve(resolvedGlob.basePath, relativePath);
    const prompt = createPromptRecord(filePath, resolvedGlob.basePath);
    promptsByPath.set(promptPathKey(prompt.absolutePath), prompt);
  }

  return [...promptsByPath.values()].sort(comparePrompts);
}

function promptPathFromArgument(
  argument: PromptTreeItem | vscode.Uri | string | undefined,
): string | undefined {
  if (argument instanceof PromptTreeItem) {
    return argument.prompt.absolutePath;
  }

  if (argument instanceof vscode.Uri) {
    return path.resolve(argument.fsPath);
  }

  if (typeof argument === "string" && argument.trim()) {
    return path.resolve(argument);
  }

  return undefined;
}

async function requirePromptPath(
  argument: PromptTreeItem | vscode.Uri | string | undefined,
): Promise<string | undefined> {
  const promptPath = promptPathFromArgument(argument);
  if (promptPath) {
    return promptPath;
  }

  await vscode.window.showErrorMessage("No se pudo identificar el prompt.");
  return undefined;
}

async function copyPromptContent(
  argument: PromptTreeItem | vscode.Uri | string | undefined,
): Promise<void> {
  const promptPath = await requirePromptPath(argument);
  if (!promptPath) {
    return;
  }

  try {
    const content = await readFile(promptPath, "utf8");
    await vscode.env.clipboard.writeText(content);
    vscode.window.setStatusBarMessage(
      `Prompt copiado: ${path.basename(promptPath)}`,
      2_000,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    await vscode.window.showErrorMessage(
      `No se pudo copiar el prompt: ${message}`,
    );
  }
}

async function copyPromptPath(
  argument: PromptTreeItem | vscode.Uri | string | undefined,
): Promise<void> {
  const promptPath = await requirePromptPath(argument);
  if (!promptPath) {
    return;
  }

  await vscode.env.clipboard.writeText(promptPath);
  vscode.window.setStatusBarMessage(
    `Path copiado: ${path.basename(promptPath)}`,
    2_000,
  );
}

async function markPromptUsed(
  argument: PromptTreeItem | vscode.Uri | string | undefined,
  state: CockpitStateStore,
): Promise<void> {
  const promptPath = await requirePromptPath(argument);
  if (!promptPath) {
    return;
  }

  const nextMark =
    state.promptMarks[promptPath] === "used" ? undefined : "used";
  await state.setPromptMark(promptPath, nextMark);
}

async function markPromptUnused(
  argument: PromptTreeItem | vscode.Uri | string | undefined,
  state: CockpitStateStore,
): Promise<void> {
  const promptPath = await requirePromptPath(argument);
  if (!promptPath) {
    return;
  }

  await state.setPromptMark(promptPath, undefined);
}

export function registerPrompts(
  context: vscode.ExtensionContext,
  state: CockpitStateStore,
): void {
  const provider = new PromptsProvider(state);
  const treeView = vscode.window.createTreeView(VIEW_ID, {
    treeDataProvider: provider,
  });
  const updateViewDescription = (): void => {
    const base = state.activeProject?.name ?? "";
    treeView.description = provider.archivedVisible
      ? `${base} · +usados`
      : base;
  };
  updateViewDescription();

  context.subscriptions.push(
    provider,
    treeView,
    state.onDidChange(updateViewDescription),
    vscode.commands.registerCommand(TOGGLE_ARCHIVED_COMMAND, () => {
      provider.toggleArchived();
      updateViewDescription();
    }),
    vscode.commands.registerCommand(
      COPY_CONTENT_COMMAND,
      (argument: PromptTreeItem | vscode.Uri | string | undefined) =>
        copyPromptContent(argument),
    ),
    vscode.commands.registerCommand(
      COPY_PATH_COMMAND,
      (argument: PromptTreeItem | vscode.Uri | string | undefined) =>
        copyPromptPath(argument),
    ),
    vscode.commands.registerCommand(
      MARK_USED_COMMAND,
      (argument: PromptTreeItem | vscode.Uri | string | undefined) =>
        markPromptUsed(argument, state),
    ),
    vscode.commands.registerCommand(
      MARK_UNUSED_COMMAND,
      (argument: PromptTreeItem | vscode.Uri | string | undefined) =>
        markPromptUnused(argument, state),
    ),
  );
}
