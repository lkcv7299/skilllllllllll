import * as vscode from "vscode";

export type AnchoredProject = {
  id: string;
  name: string;
  path: string;
  handoffGlobs: string[];
  color?: string;
};

export type SessionTag = "pending" | "done";
export type HandoffMark = "used" | "discarded";
export type PromptMark = "used" | "discarded";

export type CockpitState = {
  anchoredProjects: AnchoredProject[];
  activeProjectId: string | null;
  sessionTags: Record<string, SessionTag>;
  sessionProjectOverrides: Record<string, string>;
  savedSessions: string[];
  handoffMarks: Record<string, HandoffMark>;
  promptMarks: Record<string, PromptMark>;
};

const STATE_KEY = "voziaCockpit.state";

const DEFAULT_PROJECTS: AnchoredProject[] = [
  {
    id: "vozia-project",
    name: "VozIA-Project",
    path: "C:\\VozIA-Project",
    handoffGlobs: [
      "docs/HANDOFF-SESSION-*.md",
      "docs/handoffs/HANDOFF-SESSION-*.md",
    ],
  },
  {
    id: "vozia-landing",
    name: "vozia-landing",
    path: "C:\\VozIA-Project\\vozia-landing",
    handoffGlobs: ["docs/HANDOFF-SESSION-*.md"],
  },
  {
    id: "livekit-agent",
    name: "livekit-agent",
    path: "C:\\VozIA-Project\\livekit-agent",
    handoffGlobs: ["docs/HANDOFF-SESSION-*.md"],
  },
  {
    id: "ownerbot",
    name: "ownerbot",
    path: "C:\\VozIA-Project\\ownerbot",
    handoffGlobs: ["../docs/ownerbot/handoffs/HANDOFF-SESSION-*.md"],
  },
];

function cloneProject(project: AnchoredProject): AnchoredProject {
  return {
    ...project,
    handoffGlobs: [...project.handoffGlobs],
  };
}

function cloneState(state: CockpitState): CockpitState {
  return {
    anchoredProjects: state.anchoredProjects.map(cloneProject),
    activeProjectId: state.activeProjectId,
    sessionTags: { ...state.sessionTags },
    sessionProjectOverrides: { ...state.sessionProjectOverrides },
    savedSessions: [...state.savedSessions],
    handoffMarks: { ...state.handoffMarks },
    promptMarks: { ...state.promptMarks },
  };
}

const STANDARD_HANDOFF_GLOB = "docs/HANDOFF-SESSION-*.md";
const NESTED_HANDOFF_GLOB = "docs/handoffs/HANDOFF-SESSION-*.md";

// Migración: un proyecto anclado con el glob viejo (solo docs/) también debe mirar
// docs/handoffs/ — ahí viven muchos handoffs (p.ej. los de Odoo). No toca proyectos
// con globs personalizados (p.ej. ownerbot apunta a ../docs/ownerbot/handoffs/).
function withNestedHandoffGlob(project: AnchoredProject): AnchoredProject {
  if (
    project.handoffGlobs.includes(STANDARD_HANDOFF_GLOB) &&
    !project.handoffGlobs.includes(NESTED_HANDOFF_GLOB)
  ) {
    return {
      ...project,
      handoffGlobs: [...project.handoffGlobs, NESTED_HANDOFF_GLOB],
    };
  }
  return project;
}

function readStoredState(storage: vscode.Memento): CockpitState {
  const stored = storage.get<Partial<CockpitState>>(STATE_KEY);
  const storedProjects = Array.isArray(stored?.anchoredProjects)
    ? stored.anchoredProjects
    : [];
  const seededProjects =
    storedProjects.length > 0
      ? storedProjects.map(cloneProject)
      : DEFAULT_PROJECTS.map(cloneProject);
  const storedActiveId =
    typeof stored?.activeProjectId === "string"
      ? stored.activeProjectId
      : stored?.activeProjectId === null
        ? null
        : undefined;
  const activeProjectId =
    storedActiveId !== undefined &&
    seededProjects.some((project) => project.id === storedActiveId)
      ? storedActiveId
      : storedProjects.length === 0
        ? (seededProjects[0]?.id ?? null)
        : null;

  return {
    anchoredProjects: seededProjects.map(withNestedHandoffGlob),
    activeProjectId,
    sessionTags:
      stored?.sessionTags && typeof stored.sessionTags === "object"
        ? { ...stored.sessionTags }
        : {},
    sessionProjectOverrides:
      stored?.sessionProjectOverrides &&
      typeof stored.sessionProjectOverrides === "object"
        ? { ...stored.sessionProjectOverrides }
        : {},
    savedSessions: Array.isArray(stored?.savedSessions)
      ? [
          ...new Set(
            stored.savedSessions.filter(
              (id): id is string => typeof id === "string",
            ),
          ),
        ]
      : [],
    handoffMarks:
      stored?.handoffMarks && typeof stored.handoffMarks === "object"
        ? { ...stored.handoffMarks }
        : {},
    promptMarks:
      stored?.promptMarks && typeof stored.promptMarks === "object"
        ? { ...stored.promptMarks }
        : {},
  };
}

export class CockpitStateStore implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<CockpitState>();
  private data: CockpitState;

  public readonly onDidChange = this.changeEmitter.event;

  private constructor(
    private readonly storage: vscode.Memento,
    initialState: CockpitState,
  ) {
    this.data = initialState;
  }

  public static async create(
    storage: vscode.Memento,
  ): Promise<CockpitStateStore> {
    const state = readStoredState(storage);
    const store = new CockpitStateStore(storage, state);
    await storage.update(STATE_KEY, cloneState(state));
    return store;
  }

  public get anchoredProjects(): AnchoredProject[] {
    return this.data.anchoredProjects.map(cloneProject);
  }

  public get activeProjectId(): string | null {
    return this.data.activeProjectId;
  }

  public get activeProject(): AnchoredProject | undefined {
    const project = this.data.anchoredProjects.find(
      (candidate) => candidate.id === this.data.activeProjectId,
    );
    return project ? cloneProject(project) : undefined;
  }

  public get sessionTags(): Record<string, SessionTag> {
    return { ...this.data.sessionTags };
  }

  public get sessionProjectOverrides(): Record<string, string> {
    return { ...this.data.sessionProjectOverrides };
  }

  public get savedSessions(): string[] {
    return [...this.data.savedSessions];
  }

  public isSessionSaved(sessionId: string): boolean {
    return this.data.savedSessions.includes(sessionId);
  }

  public get handoffMarks(): Record<string, HandoffMark> {
    return { ...this.data.handoffMarks };
  }

  public get promptMarks(): Record<string, PromptMark> {
    return { ...this.data.promptMarks };
  }

  public get snapshot(): CockpitState {
    return cloneState(this.data);
  }

  public async setAnchoredProjects(
    projects: AnchoredProject[],
  ): Promise<void> {
    const nextProjects = projects.map(cloneProject);
    const activeProjectId = nextProjects.some(
      (project) => project.id === this.data.activeProjectId,
    )
      ? this.data.activeProjectId
      : null;

    await this.commit({
      ...this.data,
      anchoredProjects: nextProjects,
      activeProjectId,
    });
  }

  public async addAnchoredProject(project: AnchoredProject): Promise<void> {
    const withoutDuplicate = this.data.anchoredProjects.filter(
      (candidate) => candidate.id !== project.id,
    );
    await this.commit({
      ...this.data,
      anchoredProjects: [...withoutDuplicate, cloneProject(project)],
      activeProjectId: this.data.activeProjectId ?? project.id,
    });
  }

  public async setActiveProject(projectId: string | null): Promise<void> {
    if (
      projectId !== null &&
      !this.data.anchoredProjects.some((project) => project.id === projectId)
    ) {
      throw new Error(`Unknown anchored project: ${projectId}`);
    }

    if (this.data.activeProjectId === projectId) {
      return;
    }

    await this.commit({
      ...this.data,
      activeProjectId: projectId,
    });
  }

  public async setSessionTag(
    sessionId: string,
    tag: SessionTag | undefined,
  ): Promise<void> {
    const sessionTags = { ...this.data.sessionTags };
    if (tag === undefined) {
      delete sessionTags[sessionId];
    } else {
      sessionTags[sessionId] = tag;
    }

    await this.commit({
      ...this.data,
      sessionTags,
    });
  }

  public async setSessionProjectOverride(
    sessionId: string,
    projectId: string | undefined,
  ): Promise<void> {
    const sessionProjectOverrides = { ...this.data.sessionProjectOverrides };
    if (projectId === undefined) {
      delete sessionProjectOverrides[sessionId];
    } else {
      sessionProjectOverrides[sessionId] = projectId;
    }

    await this.commit({
      ...this.data,
      sessionProjectOverrides,
    });
  }

  public async setSessionSaved(
    sessionId: string,
    saved: boolean,
  ): Promise<void> {
    const alreadySaved = this.data.savedSessions.includes(sessionId);
    if (saved === alreadySaved) {
      return;
    }

    const savedSessions = saved
      ? [...this.data.savedSessions, sessionId]
      : this.data.savedSessions.filter((id) => id !== sessionId);

    await this.commit({
      ...this.data,
      savedSessions,
    });
  }

  public async setHandoffMark(
    handoffPath: string,
    mark: HandoffMark | undefined,
  ): Promise<void> {
    const handoffMarks = { ...this.data.handoffMarks };
    if (mark === undefined) {
      delete handoffMarks[handoffPath];
    } else {
      handoffMarks[handoffPath] = mark;
    }

    await this.commit({
      ...this.data,
      handoffMarks,
    });
  }

  public async setPromptMark(
    promptPath: string,
    mark: PromptMark | undefined,
  ): Promise<void> {
    const promptMarks = { ...this.data.promptMarks };
    if (mark === undefined) {
      delete promptMarks[promptPath];
    } else {
      promptMarks[promptPath] = mark;
    }

    await this.commit({
      ...this.data,
      promptMarks,
    });
  }

  public refresh(): void {
    this.changeEmitter.fire(this.snapshot);
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }

  private async commit(nextState: CockpitState): Promise<void> {
    const nextSnapshot = cloneState(nextState);
    await this.storage.update(STATE_KEY, nextSnapshot);
    this.data = nextSnapshot;
    this.changeEmitter.fire(this.snapshot);
  }
}

