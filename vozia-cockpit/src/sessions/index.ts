import * as vscode from "vscode";
import * as path from "node:path";
import {
  AnchoredProject,
  CockpitStateStore,
  SessionTag,
} from "../state";
import { reopenClaudeSession } from "../util/claudeUri";
import {
  ActiveSessionMarker,
  readActiveSessionMarker,
  watchActiveSessionMarker,
} from "./activeMarker";
import { ClaudeSession, ClaudeSessionReader } from "./reader";

const VIEW_ID = "cockpit.sessions";
const VIEW_TITLE = "Sesiones (Claude)";

type SessionTreeNode = ProjectGroupItem | SessionItem | MessageItem;

type SessionGroup = {
  key: string;
  name: string;
  projectPath: string;
  sessions: ClaudeSession[];
};

function comparablePath(value: string): string {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isPathWithin(candidate: string, parent: string): boolean {
  const relative = path.relative(
    comparablePath(parent),
    comparablePath(candidate),
  );
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function projectForSession(
  session: ClaudeSession,
  projects: readonly AnchoredProject[],
): AnchoredProject | undefined {
  return projects
    .filter((project) => isPathWithin(session.cwd, project.path))
    .sort(
      (left, right) =>
        comparablePath(right.path).length - comparablePath(left.path).length,
    )[0];
}

// El proyecto efectivo es el override manual si existe; si no, el derivado del cwd.
// El dueño corre casi todas las sesiones desde C:\VozIA-Project, así que el override
// es la forma de re-asignar una sesión a Odoo/jaquer/etc. sin abrirla en esa carpeta.
function effectiveProject(
  session: ClaudeSession,
  projects: readonly AnchoredProject[],
  overrides: Readonly<Record<string, string>>,
): AnchoredProject | undefined {
  const overrideId = overrides[session.id];
  if (overrideId) {
    const overridden = projects.find((project) => project.id === overrideId);
    if (overridden) {
      return overridden;
    }
  }
  return projectForSession(session, projects);
}

// Una sesión está "curada" si el dueño la guardó explícitamente O si le asignó
// un proyecto a mano. Las cientos de sesiones auto-creadas (rewinds/forks/subagentes)
// no tienen ninguna de las dos, así que quedan fuera de la vista por defecto.
function isCuratedSession(
  session: ClaudeSession,
  saved: ReadonlySet<string>,
  overrides: Readonly<Record<string, string>>,
): boolean {
  return saved.has(session.id) || overrides[session.id] !== undefined;
}

function relativeTime(modifiedAt: number, now = Date.now()): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - modifiedAt) / 1000));
  if (elapsedSeconds < 60) {
    return "ahora";
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) {
    return `hace ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `hace ${hours} h`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `hace ${days} d`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `hace ${months} mes${months === 1 ? "" : "es"}`;
  }

  const years = Math.floor(days / 365);
  return `hace ${years} año${years === 1 ? "" : "s"}`;
}

function messageLabel(count: number): string {
  return `${count} mensaje${count === 1 ? "" : "s"}`;
}

function normalizeForMatch(value: string): string {
  return value
    .replace(/[….]+$/u, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// La tab de Claude es un webview; VS Code expone su título vía tabGroups. No hay
// API para el session-id interno, pero el LABEL = lo que ves en la pestaña, y con
// eso identificamos cuál sesión tienes seleccionada ahora mismo.
function isClaudeWebviewTab(tab: vscode.Tab): boolean {
  return (
    tab.input instanceof vscode.TabInputWebview &&
    tab.input.viewType.toLowerCase().includes("claude")
  );
}

// La tab activa de Claude considerando TODOS los grupos de editores, no solo el
// grupo activo: si el dueño tiene split-view o Claude en otro grupo, el grupo
// activo puede ser código y aun así queremos identificar la pestaña de Claude.
// Preferimos la pestaña activa del grupo activo; si esa no es Claude, caemos a
// cualquier pestaña activa de Claude en otro grupo.
function activeClaudeTabLabel(): string | undefined {
  const activeGroupTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
  if (activeGroupTab && isClaudeWebviewTab(activeGroupTab)) {
    return activeGroupTab.label;
  }
  for (const group of vscode.window.tabGroups.all) {
    const activeTab = group.activeTab;
    if (activeTab && isClaudeWebviewTab(activeTab)) {
      return activeTab.label;
    }
  }
  return undefined;
}

function defaultTag(tag: SessionTag | undefined): SessionTag {
  return tag ?? "pending";
}

class SessionItem extends vscode.TreeItem {
  public constructor(
    public readonly session: ClaudeSession,
    tag: SessionTag,
    assigned = false,
    current = false,
    saved = false,
  ) {
    super(
      current ? `▶ ${session.title}` : session.title,
      vscode.TreeItemCollapsibleState.None,
    );
    const assignedSuffix = assigned ? " · asignado" : "";
    const savedSuffix = saved ? " · guardada" : "";
    const currentPrefix = current ? "● ACTUAL · " : "";
    this.description = `${currentPrefix}${relativeTime(session.modifiedAt)} · ${messageLabel(session.messageCount)} · ${tag}${savedSuffix}${assignedSuffix}`;
    // El estado de guardado va en el contextValue para que los menús inline de
    // package.json muestren "Guardar" o "Quitar" según corresponda.
    this.contextValue = `cockpit.session.${tag}.${saved ? "saved" : "unsaved"}`;
    this.iconPath = current
      ? new vscode.ThemeIcon(
          "circle-large-filled",
          new vscode.ThemeColor("charts.green"),
        )
      : new vscode.ThemeIcon(
          tag === "done" ? "pass-filled" : "circle-outline",
        );
    this.tooltip = [
      session.title,
      current ? "Sesión activa (la que tienes seleccionada ahora)" : "",
      saved ? "Sesión guardada (curada)" : "",
      session.cwd,
      new Date(session.modifiedAt).toLocaleString("es-PE"),
      `${messageLabel(session.messageCount)} · ${tag}`,
    ]
      .filter((line) => line.length > 0)
      .join("\n");
    this.command = {
      command: "cockpit.session.reopen",
      title: "Reabrir sesión de Claude",
      arguments: [this],
    };
    this.accessibilityInformation = {
      label: `${session.title}, ${this.description}`,
    };
  }
}

class ProjectGroupItem extends vscode.TreeItem {
  public constructor(public readonly group: SessionGroup) {
    super(group.name, vscode.TreeItemCollapsibleState.Expanded);
    this.description =
      group.sessions.length === 1
        ? "1 sesión"
        : `${group.sessions.length} sesiones`;
    this.contextValue = "cockpit.projectGroup";
    this.iconPath = new vscode.ThemeIcon("folder");
    this.tooltip = group.projectPath;
  }
}

class MessageItem extends vscode.TreeItem {
  public constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "cockpit.message";
    this.iconPath = new vscode.ThemeIcon("info");
  }
}

class SessionsProvider
  implements vscode.TreeDataProvider<SessionTreeNode>, vscode.Disposable
{
  private readonly changeEmitter =
    new vscode.EventEmitter<SessionTreeNode | undefined>();
  private groupByProject = false;
  // false = solo sesiones curadas (guardadas o asignadas); true = todas, para
  // que el dueño pueda navegar el universo completo y guardar las que quiera.
  private showAll = false;
  private currentSessionId: string | undefined;
  private activeTabLabel: string | undefined;
  // El marcador que escribe la extensión parchada: fuente de verdad de la sesión
  // activa. undefined = no hay marcador (extensión sin parchar) → caemos al título.
  private activeMarker: ActiveSessionMarker | undefined;
  private treeView: vscode.TreeView<SessionTreeNode> | undefined;

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public constructor(
    private readonly state: CockpitStateStore,
    private readonly reader: ClaudeSessionReader,
  ) {}

  public attachTreeView(treeView: vscode.TreeView<SessionTreeNode>): void {
    this.treeView = treeView;
    this.updateViewDescription();
  }

  public getTreeItem(element: SessionTreeNode): vscode.TreeItem {
    return element;
  }

  public async getChildren(
    element?: SessionTreeNode,
  ): Promise<SessionTreeNode[]> {
    if (element instanceof ProjectGroupItem) {
      return element.group.sessions.map((session) => this.toSessionItem(session));
    }
    if (element) {
      return [];
    }

    const allSessions = await this.reader.readAll();
    this.activeMarker = await readActiveSessionMarker();
    this.currentSessionId = this.resolveCurrentSessionId(allSessions);
    const sessions = this.applyVisibilityFilter(allSessions);
    if (this.groupByProject) {
      const groups = this.buildGroups(sessions);
      if (groups.length === 0) {
        return [new MessageItem(this.emptyMessage())];
      }
      return groups.map((group) => new ProjectGroupItem(group));
    }

    const activeProject = this.state.activeProject;
    if (!activeProject) {
      return [new MessageItem("Selecciona un proyecto activo")];
    }

    const overrides = this.state.sessionProjectOverrides;
    const projects = this.state.anchoredProjects;
    const activeSessions = sessions.filter(
      (session) =>
        effectiveProject(session, projects, overrides)?.id === activeProject.id,
    );
    if (activeSessions.length === 0) {
      return [new MessageItem(this.emptyMessage(activeProject.name))];
    }

    return activeSessions.map((session) => this.toSessionItem(session));
  }

  private toSessionItem(session: ClaudeSession): SessionItem {
    const tags = this.state.sessionTags;
    const overrides = this.state.sessionProjectOverrides;
    return new SessionItem(
      session,
      defaultTag(tags[session.id]),
      overrides[session.id] !== undefined,
      session.id === this.currentSessionId,
      this.state.isSessionSaved(session.id),
    );
  }

  // Mensaje amistoso cuando no hay sesiones curadas: explica cómo guardar una.
  private emptyMessage(projectName?: string): string {
    if (this.showAll) {
      return projectName
        ? `No hay sesiones para ${projectName}`
        : "No se encontraron sesiones de Claude";
    }
    const scope = projectName ? ` en ${projectName}` : "";
    return `No hay sesiones guardadas${scope}. Usa "Guardar sesión actual" o muestra todas para guardar una.`;
  }

  public toggleGrouping(): void {
    this.groupByProject = !this.groupByProject;
    this.refresh();
  }

  public toggleShowAll(): void {
    this.showAll = !this.showAll;
    this.refresh();
  }

  public setActiveTabLabel(label: string | undefined): void {
    if (this.activeTabLabel === label) {
      return;
    }
    this.activeTabLabel = label;
    this.refresh();
  }

  // Re-lee la pestaña de Claude justo antes de resolver, sin esperar al evento de
  // tabs. El menú contextual de la pestaña la activa al hacer click derecho, pero
  // re-sincronizar aquí elimina cualquier carrera con el evento onDidChangeTabs.
  public syncActiveTabLabel(): void {
    this.setActiveTabLabel(activeClaudeTabLabel());
  }

  // Sesión cuyo título coincide con el label de la pestaña activa de Claude.
  // undefined si no hay pestaña identificada o ningún título casa: el llamador
  // decide si cae a la más reciente.
  private findSessionByActiveTab(
    sessions: readonly ClaudeSession[],
  ): ClaudeSession | undefined {
    const label = this.activeTabLabel;
    if (!label) {
      return undefined;
    }
    const target = normalizeForMatch(label);
    return sessions.find((session) => {
      const title = normalizeForMatch(session.title);
      return (
        title.length > 0 &&
        (target === title ||
          target.startsWith(title) ||
          title.startsWith(target))
      );
    });
  }

  // Sesión cuyo id coincide con el marcador de la extensión parchada. Es la
  // resolución PRIMARIA: el marcador trae el session-id exacto que el dueño tiene
  // seleccionado. undefined si no hay marcador o su id no casa con ninguna sesión.
  private findSessionByMarker(
    sessions: readonly ClaudeSession[],
  ): ClaudeSession | undefined {
    const markerId = this.activeMarker?.sessionId;
    if (!markerId) {
      return undefined;
    }
    return sessions.find((session) => session.id === markerId);
  }

  // La sesión "actual" es, en orden: (1) la del marcador por id (fuente de verdad),
  // (2) — solo si no hay marcador — la que casa por título de la pestaña, y
  // (3) como último recurso, la más reciente por mtime.
  private resolveCurrentSessionId(
    sessions: readonly ClaudeSession[],
  ): string | undefined {
    return (
      this.findSessionByMarker(sessions)?.id ??
      this.findSessionByActiveTab(sessions)?.id ??
      sessions[0]?.id
    );
  }

  // Por defecto la vista muestra SOLO sesiones curadas; "Mostrar todas" revela
  // el universo completo para que el dueño encuentre y guarde las que quiera.
  private applyVisibilityFilter(
    sessions: readonly ClaudeSession[],
  ): ClaudeSession[] {
    if (this.showAll) {
      return [...sessions];
    }
    const saved = new Set(this.state.savedSessions);
    const overrides = this.state.sessionProjectOverrides;
    return sessions.filter((session) =>
      isCuratedSession(session, saved, overrides),
    );
  }

  public refresh(): void {
    this.updateViewDescription();
    this.changeEmitter.fire(undefined);
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }

  private buildGroups(sessions: readonly ClaudeSession[]): SessionGroup[] {
    const projects = this.state.anchoredProjects;
    const overrides = this.state.sessionProjectOverrides;
    const groups = new Map<string, SessionGroup>();

    for (const session of sessions) {
      const project = effectiveProject(session, projects, overrides);
      const fallbackPath = comparablePath(session.cwd);
      const key = project ? `project:${project.id}` : `cwd:${fallbackPath}`;
      const group = groups.get(key) ?? {
        key,
        name: project?.name ?? path.basename(path.normalize(session.cwd)),
        projectPath: project?.path ?? session.cwd,
        sessions: [],
      };
      group.sessions.push(session);
      groups.set(key, group);
    }

    return [...groups.values()].sort((left, right) => {
      const leftModified = left.sessions[0]?.modifiedAt ?? 0;
      const rightModified = right.sessions[0]?.modifiedAt ?? 0;
      return rightModified - leftModified || left.name.localeCompare(right.name);
    });
  }

  private updateViewDescription(): void {
    if (!this.treeView) {
      return;
    }
    const scopeSuffix = this.showAll ? " · todas" : " · solo guardadas";
    this.treeView.description =
      (this.groupByProject
        ? "todos · por proyecto"
        : (this.state.activeProject?.name ?? "sin proyecto activo")) +
      scopeSuffix;
  }

  // Resuelve la sesión que el dueño tiene abierta ahora mismo. Cómo se identificó:
  //   "marker" → el marcador de la extensión la fijó por id (fuente de verdad);
  //   "tab"    → no hay marcador, pero el título de la pestaña casó una sesión;
  //   "mtime"  → sin marcador ni match de título: la más reciente (último recurso).
  public async resolveActiveSession(): Promise<{
    session: ClaudeSession;
    resolvedBy: "marker" | "tab" | "mtime";
  } | undefined> {
    const sessions = await this.reader.readAll();
    if (sessions.length === 0) {
      return undefined;
    }
    // Re-leemos el marcador en el momento de guardar para fijar exactamente la
    // sesión con la que el dueño está interactuando, sin depender de un refresh.
    this.activeMarker = await readActiveSessionMarker();

    const byMarker = this.findSessionByMarker(sessions);
    if (byMarker) {
      return { session: byMarker, resolvedBy: "marker" };
    }

    const byTab = this.findSessionByActiveTab(sessions);
    if (byTab) {
      return { session: byTab, resolvedBy: "tab" };
    }

    const newest = sessions[0];
    if (!newest) {
      return undefined;
    }
    return { session: newest, resolvedBy: "mtime" };
  }
}

export function registerSessions(
  context: vscode.ExtensionContext,
  state: CockpitStateStore,
): void {
  const provider = new SessionsProvider(state, new ClaudeSessionReader());
  const treeView = vscode.window.createTreeView(VIEW_ID, {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  treeView.title = VIEW_TITLE;
  provider.attachTreeView(treeView);

  const syncActiveTab = (): void => provider.syncActiveTabLabel();
  syncActiveTab();

  // Cuando la extensión parchada reescribe el marcador (el dueño cambió de
  // pestaña/sesión), refrescamos la vista para que "▶ ● ACTUAL" siga la selección
  // en vivo. getChildren re-lee el marcador en cada refresh.
  const stopWatchingMarker = watchActiveSessionMarker(() => provider.refresh());

  // Guarda la sesión activa de Claude reusando una sola vez la lógica de
  // save + enganche al proyecto activo + mensaje. Cuando existe el marcador de la
  // extensión, guardamos EXACTAMENTE su sesión por id (sin avisos). `requireExact`
  // solo afecta al último recurso (sin marcador ni match de título): el menú de la
  // pestaña exige una identificación exacta y avisa si cae a la más reciente,
  // mientras que "guardar actual" acepta esa caída.
  const saveResolvedSession = async (options: {
    requireExact: boolean;
  }): Promise<void> => {
    const resolved = await provider.resolveActiveSession();
    if (!resolved) {
      void vscode.window.showInformationMessage(
        "No se encontraron sesiones de Claude para guardar.",
      );
      return;
    }

    const { session, resolvedBy } = resolved;
    if (options.requireExact && resolvedBy === "mtime") {
      void vscode.window.showWarningMessage(
        "No pude identificar la pestaña de Claude. Haz click derecho sobre la pestaña-editor de Claude (no en la barra lateral) e intenta de nuevo.",
      );
      return;
    }

    await state.setSessionSaved(session.id, true);

    // Si la sesión no tiene proyecto asignado a mano, la enganchamos al
    // proyecto activo para que aparezca bajo ese filtro de inmediato.
    const hasOverride =
      state.sessionProjectOverrides[session.id] !== undefined;
    const activeProjectId = state.activeProjectId;
    if (!hasOverride && activeProjectId) {
      await state.setSessionProjectOverride(session.id, activeProjectId);
    }

    const message =
      resolvedBy === "mtime"
        ? `No identifiqué la pestaña de Claude; guardé la más reciente: ${session.title}`
        : `Sesión guardada: ${session.title}`;
    void vscode.window.showInformationMessage(message);
  };

  context.subscriptions.push(
    provider,
    treeView,
    { dispose: stopWatchingMarker },
    state.onDidChange(() => provider.refresh()),
    vscode.window.tabGroups.onDidChangeTabs(syncActiveTab),
    vscode.window.tabGroups.onDidChangeTabGroups(syncActiveTab),
    vscode.commands.registerCommand(
      "cockpit.session.groupByProject",
      () => provider.toggleGrouping(),
    ),
    vscode.commands.registerCommand(
      "cockpit.session.toggleShowAll",
      () => provider.toggleShowAll(),
    ),
    vscode.commands.registerCommand(
      "cockpit.session.saveCurrent",
      async () => {
        await saveResolvedSession({ requireExact: false });
      },
    ),
    vscode.commands.registerCommand(
      "cockpit.session.saveFromTab",
      // El menú contextual de la pestaña pasa un Uri con scheme "webview-panel"
      // (un handle interno que NO identifica la sesión), así que lo ignoramos y
      // resolvemos la pestaña de Claude activa vía tabGroups. El when-clause
      // (activeWebviewPanelId == 'claudeVSCodePanel') garantiza que solo aparece
      // sobre la pestaña-editor de Claude, y el click derecho la activa.
      async () => {
        provider.syncActiveTabLabel();
        await saveResolvedSession({ requireExact: true });
      },
    ),
    vscode.commands.registerCommand(
      "cockpit.session.save",
      async (item: SessionItem | undefined) => {
        if (!(item instanceof SessionItem)) {
          void vscode.window.showInformationMessage(
            "Selecciona una sesión para guardarla.",
          );
          return;
        }
        await state.setSessionSaved(item.session.id, true);
      },
    ),
    vscode.commands.registerCommand(
      "cockpit.session.unsave",
      async (item: SessionItem | undefined) => {
        if (!(item instanceof SessionItem)) {
          void vscode.window.showInformationMessage(
            "Selecciona una sesión para quitarla de guardadas.",
          );
          return;
        }
        await state.setSessionSaved(item.session.id, false);
      },
    ),
    vscode.commands.registerCommand(
      "cockpit.session.assignProject",
      async (item: SessionItem | undefined) => {
        if (!(item instanceof SessionItem)) {
          void vscode.window.showInformationMessage(
            "Selecciona una sesión para asignarla a un proyecto.",
          );
          return;
        }

        const projects = state.anchoredProjects;
        if (projects.length === 0) {
          void vscode.window.showInformationMessage(
            "Ancla al menos un proyecto antes de asignar sesiones.",
          );
          return;
        }

        const currentOverride = state.sessionProjectOverrides[item.session.id];
        const picks: (vscode.QuickPickItem & { projectId?: string })[] =
          projects.map((project) => ({
            label: project.name,
            description:
              project.id === currentOverride ? "asignación actual" : project.path,
            projectId: project.id,
          }));
        if (currentOverride !== undefined) {
          picks.push({
            label: "$(clear-all) Quitar asignación (usar carpeta)",
            projectId: undefined,
          });
        }

        const choice = await vscode.window.showQuickPick(picks, {
          title: `Asignar sesión a proyecto`,
          placeHolder: item.session.title,
        });
        if (!choice) {
          return;
        }

        await state.setSessionProjectOverride(
          item.session.id,
          choice.projectId,
        );
      },
    ),
    vscode.commands.registerCommand(
      "cockpit.session.toggleTag",
      async (item: SessionItem | undefined) => {
        if (!(item instanceof SessionItem)) {
          void vscode.window.showInformationMessage(
            "Selecciona una sesión para alternar su tag.",
          );
          return;
        }

        const currentTag = defaultTag(state.sessionTags[item.session.id]);
        await state.setSessionTag(
          item.session.id,
          currentTag === "pending" ? "done" : "pending",
        );
      },
    ),
    vscode.commands.registerCommand(
      "cockpit.session.reopen",
      async (item: SessionItem | undefined) => {
        if (!(item instanceof SessionItem)) {
          void vscode.window.showInformationMessage(
            "Selecciona una sesión de Claude para reabrirla.",
          );
          return;
        }

        // Reabre con el cwd PROPIO de la sesión (vía el comando parcheado), para
        // que restaure la conversación real aunque pertenezca a otro proyecto que
        // el workspace de esta ventana. Sin el parche, cae al URI `?session=`.
        const opened = await reopenClaudeSession({
          session: item.session.id,
          cwd: item.session.cwd,
        });
        if (!opened) {
          void vscode.window.showWarningMessage(
            "Claude Code no pudo abrir la sesión seleccionada.",
          );
        }
      },
    ),
  );
}
