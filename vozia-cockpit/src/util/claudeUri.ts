import * as vscode from "vscode";

export type ClaudeOpenOptions = {
  prompt?: string;
  session?: string;
};

export function buildClaudeUri(options: ClaudeOpenOptions): vscode.Uri {
  const query = Object.entries(options)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  const suffix = query.length > 0 ? `?${query}` : "";
  return vscode.Uri.parse(
    `vscode://anthropic.claude-code/open${suffix}`,
  );
}

export function openClaudeUri(
  options: ClaudeOpenOptions,
): Thenable<boolean> {
  return vscode.env.openExternal(buildClaudeUri(options));
}

// Comando inyectado por el parche de la extensión (claude-openInFolder-patch.js,
// PATCH #3). Reabre una sesión en la MISMA ventana usando el cwd PROPIO de la
// sesión, sin depender del workspace de la ventana.
const OPEN_SESSION_IN_FOLDER_COMMAND = "claude-vscode.openSessionInFolder";

async function patchedCommandAvailable(): Promise<boolean> {
  const commands = await vscode.commands.getCommands(true);
  return commands.includes(OPEN_SESSION_IN_FOLDER_COMMAND);
}

// Reabre una sesión de Claude restaurando su conversación real.
//
// El URI `vscode://anthropic.claude-code/open?session=<id>` resuelve el .jsonl
// relativo al cwd del workspace de la VENTANA actual (la extensión deriva el dir
// ~/.claude/projects/<cwd-encoded>/ del workspace, no de la sesión). Si la sesión
// pertenece a otro proyecto/cwd, su .jsonl vive bajo otro dir y no se encuentra →
// panel en blanco / conversación fresca.
//
// El comando parcheado `claude-vscode.openSessionInFolder` recibe el cwd PROPIO
// de la sesión y reanuda con ese cwd vía createPanel(id, _, _, cwd), restaurando
// la conversación real sin cambiar el workspace de la ventana. Si el parche no
// está aplicado, caemos al URI `?session=` (correcto solo si el cwd coincide).
export async function reopenClaudeSession(options: {
  session: string;
  cwd: string;
}): Promise<boolean> {
  if (await patchedCommandAvailable()) {
    await vscode.commands.executeCommand(
      OPEN_SESSION_IN_FOLDER_COMMAND,
      options.session,
      options.cwd,
    );
    return true;
  }
  return openClaudeUri({ session: options.session });
}

