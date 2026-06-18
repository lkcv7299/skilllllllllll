import * as vscode from "vscode";
import { CockpitStateStore } from "./state";

const SWITCH_PROJECT_COMMAND = "cockpit.project.switch";

type ProjectQuickPickItem = vscode.QuickPickItem & {
  projectId: string;
};

export function registerStatusBar(
  context: vscode.ExtensionContext,
  state: CockpitStateStore,
): void {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBarItem.command = SWITCH_PROJECT_COMMAND;

  const render = (): void => {
    const project = state.activeProject;
    statusBarItem.text = project
      ? `✱ ${project.name}`
      : "✱ Sin proyecto activo";
    statusBarItem.tooltip = project
      ? `Proyecto activo: ${project.path}\nClick para cambiar`
      : "Click para elegir el proyecto activo";
    statusBarItem.color = project?.color;
    statusBarItem.backgroundColor = undefined;
    statusBarItem.show();
  };

  const switchProject = vscode.commands.registerCommand(
    SWITCH_PROJECT_COMMAND,
    async () => {
      const items: ProjectQuickPickItem[] = state.anchoredProjects.map(
        (project) => ({
          label: project.name,
          description:
            project.id === state.activeProjectId ? "Activo" : undefined,
          detail: project.path,
          projectId: project.id,
        }),
      );

      if (items.length === 0) {
        await vscode.window.showInformationMessage(
          "No hay proyectos anclados.",
        );
        return;
      }

      const picked = await vscode.window.showQuickPick(items, {
        title: "Cambiar proyecto activo",
        placeHolder: "Selecciona un proyecto",
      });
      if (picked) {
        await state.setActiveProject(picked.projectId);
      }
    },
  );

  context.subscriptions.push(
    statusBarItem,
    switchProject,
    state.onDidChange(render),
  );
  render();
}

