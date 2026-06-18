import * as vscode from "vscode";
import { registerHandoffs } from "./handoffs";
import { registerLaunch } from "./launch";
import { registerLoop } from "./loop";
import { registerPatchKeeper } from "./patch";
import { registerProjects } from "./projects";
import { registerPrompts } from "./prompts";
import { registerSessions } from "./sessions";
import { CockpitStateStore } from "./state";
import { registerStatusBar } from "./statusbar";

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const state = await CockpitStateStore.create(context.globalState);
  context.subscriptions.push(state);

  registerProjects(context, state);
  registerLaunch(context, state);
  registerHandoffs(context, state);
  registerPrompts(context, state);
  registerSessions(context, state);
  registerStatusBar(context, state);
  registerPatchKeeper(context);
  registerLoop(context, state);

  context.subscriptions.push(
    vscode.commands.registerCommand("cockpit.refresh", () => state.refresh()),
  );
}

export function deactivate(): void {}

