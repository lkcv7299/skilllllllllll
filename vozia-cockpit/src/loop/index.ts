import * as path from "node:path";
import * as vscode from "vscode";
import { AnchoredProject, CockpitStateStore } from "../state";
import { findLatestProjectHandoff } from "../launch/handoffResolver";
import { readActiveSessionMarker } from "../sessions/activeMarker";
import {
  LoopConfig,
  LoopEngine,
  LoopGate,
  LoopStatus,
} from "./engine";
import { awaitTurnComplete } from "./turnLog";
import { createLoopView } from "./view";

const SEND_TO_SESSION_COMMAND = "claude-vscode.sendToSession";
const SEND_TO_ACTIVE_SESSION_COMMAND = "claude-vscode.sendToActiveSession";

const START_COMMAND = "cockpit.loop.start";
const START_TEST_COMMAND = "cockpit.loop.startTest";
const STOP_COMMAND = "cockpit.loop.stop";
// VS Code expone automáticamente `<viewId>.focus` para cada view contribuida; lo
// usamos como target del click de la barra de estado sin registrarlo nosotros.
const FOCUS_VIEW_COMMAND = "cockpit.loop.focus";

// Defaults sanos para una corrida del Loop (instrucción del dueño). El per-turn es
// generoso porque un turno de calidad con replay puede tardar; el open y el handoff
// son techos para no quedar colgados si la pestaña no abre o el ciclo no escribe su
// handoff de cierre.
const DEFAULT_PER_TURN_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_OPEN_TIMEOUT_MS = 60 * 1000;
const DEFAULT_HANDOFF_TIMEOUT_MS = 10 * 60 * 1000;
// "Sin límite" en la práctica = un techo alto: el Loop sigue cooperativo (el dueño
// puede frenarlo), pero evitamos un Infinity que complique el render del progreso.
const UNLIMITED_CYCLES_CAP = 999;

const DEFAULT_TEST_MESSAGE = "hola desde el cockpit";
// El turno puede demorar (modelos lentos, herramientas largas); 5 min es un techo
// generoso para la PRUEBA de los primitivos send + turn-done, no un SLA del Loop.
const TURN_TIMEOUT_MS = 5 * 60 * 1000;

// Resuelve qué comando de envío de la extensión parchada está disponible. Si el
// parche no está aplicado, ninguno existe y devolvemos undefined para avisar al
// dueño en vez de fallar en silencio.
async function resolveSendCommand(): Promise<
  | { command: typeof SEND_TO_SESSION_COMMAND; needsSessionId: true }
  | { command: typeof SEND_TO_ACTIVE_SESSION_COMMAND; needsSessionId: false }
  | undefined
> {
  const commands = new Set(await vscode.commands.getCommands(true));
  if (commands.has(SEND_TO_SESSION_COMMAND)) {
    return { command: SEND_TO_SESSION_COMMAND, needsSessionId: true };
  }
  if (commands.has(SEND_TO_ACTIVE_SESSION_COMMAND)) {
    return { command: SEND_TO_ACTIVE_SESSION_COMMAND, needsSessionId: false };
  }
  return undefined;
}

// Señal de aborto inerte para la PRUEBA manual: no hay stop cooperativo aquí, solo
// el techo de tiempo. Satisface el contrato AbortLike de turnLog sin acoplar el
// StopSignal del motor.
const NO_ABORT = {
  hard: false,
  onChange: (): vscode.Disposable => new vscode.Disposable(() => undefined),
};

// Observa el .jsonl de la sesión objetivo (la fuente de verdad canónica de la GUI)
// hasta que el turno cierre con end_turn fechado ≥ el envío, o expire el techo.
// Mismo cable que usa el Loop autónomo: esta PRUEBA valida exactamente la barrera real.
async function awaitTurnCompletion(
  cwd: string,
  sessionId: string,
  sentTs: number,
  progress: vscode.Progress<{ message?: string }>,
): Promise<"completed" | "timeout"> {
  progress.report({ message: "Claude está procesando el turno..." });
  const outcome = await awaitTurnComplete(
    cwd,
    sessionId,
    sentTs,
    TURN_TIMEOUT_MS,
    NO_ABORT,
    () => undefined,
  );
  return outcome.kind === "completed" ? "completed" : "timeout";
}

// Lee la sesión activa, pide el texto, envía vía la extensión parchada y observa el
// .jsonl de la sesión hasta el end_turn (o timeout). Es el botón de PRUEBA del que
// parte el Loop autónomo: valida los dos primitivos (inyectar + detectar fin de turno).
async function runSendTest(): Promise<void> {
  const marker = await readActiveSessionMarker();
  const sessionId = marker?.sessionId;
  const cwd = marker?.cwd;
  if (!sessionId || !cwd) {
    void vscode.window.showWarningMessage(
      "No hay sesión activa de Claude; enfoca una pestaña de Claude e intenta de nuevo.",
    );
    return;
  }

  const text = await vscode.window.showInputBox({
    title: "Cockpit: enviar prueba a la sesión activa",
    prompt: "Mensaje a enviar a la sesión activa de Claude",
    value: DEFAULT_TEST_MESSAGE,
  });
  if (text === undefined) {
    return;
  }
  const message = text.trim();
  if (message.length === 0) {
    void vscode.window.showWarningMessage(
      "El mensaje está vacío; no se envió nada.",
    );
    return;
  }

  const sender = await resolveSendCommand();
  if (!sender) {
    void vscode.window.showWarningMessage(
      'El parche de Claude no está aplicado (falta el comando de envío). Ejecuta "Re-aplicar parche de Claude" y recarga la ventana.',
    );
    return;
  }

  const sentTs = Date.now();
  try {
    if (sender.needsSessionId) {
      await vscode.commands.executeCommand(sender.command, sessionId, message);
    } else {
      await vscode.commands.executeCommand(sender.command, message);
    }
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "error desconocido";
    void vscode.window.showErrorMessage(
      `No pude enviar el mensaje a la sesión: ${detail}`,
    );
    return;
  }

  const outcome = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Cockpit: prueba de turno",
      cancellable: false,
    },
    (progress) => {
      progress.report({ message: "Mensaje enviado; esperando el turno..." });
      return awaitTurnCompletion(cwd, sessionId, sentTs, progress);
    },
  );

  if (outcome === "completed") {
    void vscode.window.showInformationMessage("✓ Turno completado");
  } else {
    void vscode.window.showWarningMessage("Turno no completó (timeout)");
  }
}

// El gate por defecto según el proyecto activo: el runtime (vozia-landing y su
// alias) audita PRs con el framework Round-3; el ownerbot tiene su propio loop;
// cualquier otro cae a round3 como base razonable. El dueño no elige gate en el
// QuickPick: lo deriva el proyecto para reducir fricción.
function defaultGateFor(project: AnchoredProject): LoopGate {
  const id = project.id.toLowerCase();
  if (id.includes("ownerbot")) {
    return "ownerbot";
  }
  return "round3";
}

type MaxCyclesPick = vscode.QuickPickItem & { maxCycles: number };

// Pregunta cuántos ciclos correr. "Sin límite" se mapea a un techo alto (no Infinity)
// para mantener el progreso renderizable; el Loop sigue siendo cooperativamente
// detenible. undefined = el dueño canceló el QuickPick → abortamos el start.
async function pickMaxCycles(): Promise<number | undefined> {
  const items: MaxCyclesPick[] = [
    { label: "1 ciclo", description: "una sola pasada", maxCycles: 1 },
    { label: "3 ciclos", description: "por defecto", maxCycles: 3 },
    { label: "10 ciclos", maxCycles: 10 },
    {
      label: "Sin límite",
      description: `hasta detenerlo (techo ${UNLIMITED_CYCLES_CAP})`,
      maxCycles: UNLIMITED_CYCLES_CAP,
    },
  ];
  const choice = await vscode.window.showQuickPick(items, {
    title: "Loop: ¿cuántos ciclos?",
    placeHolder: "Número de ciclos antes de detenerse solo",
  });
  return choice?.maxCycles;
}

// Preflight de los parches: el Loop solo depende de inyectar texto en una sesión
// (claude-vscode.openAndSend / sendToSession). La barrera de turno ya NO usa marcador
// —lee el .jsonl canónico que la GUI escribe sola—, así que no hay nada más que checar.
async function loopPreflightOk(): Promise<boolean> {
  const commands = new Set(await vscode.commands.getCommands(true));
  const hasSendCommand =
    commands.has(SEND_TO_SESSION_COMMAND) ||
    commands.has(SEND_TO_ACTIVE_SESSION_COMMAND);

  if (!hasSendCommand) {
    void vscode.window.showWarningMessage(
      'Faltan los parches de envío; corre "Re-aplicar parche de Claude" y recarga la ventana.',
    );
    return false;
  }
  return true;
}

function buildLoopConfig(project: AnchoredProject, maxCycles: number): LoopConfig {
  return {
    projectId: project.id,
    gate: defaultGateFor(project),
    useGoAhead: true,
    cycleMode: "clear",
    maxCycles,
    perTurnTimeoutMs: DEFAULT_PER_TURN_TIMEOUT_MS,
    handoffTimeoutMs: DEFAULT_HANDOFF_TIMEOUT_MS,
    openTimeoutMs: DEFAULT_OPEN_TIMEOUT_MS,
  };
}

// ── ANDAMIO DE PRUEBA (BORRABLE) ──────────────────────────────────────────────
// Modo PRUEBA: prueba el ciclo completo del Loop (abrir pestaña → enviar → barrera
// de turno → detectar handoff nuevo → avanzar) con 3 mensajes triviales, sin gastar
// un turno real de framework. Reusa el MISMO engine.start / sendAndAwait /
// awaitNewHandoff; lo único que cambia es el CONTENIDO de los 3 mensajes. Para
// revertir: borrar este bloque, el comando startTest y el campo testMessages.
//
// Default de ciclos chico (2) para que la prueba demuestre el AVANCE entre ciclos
// sin pedir nada al dueño.
const TEST_MAX_CYCLES = 2;

// Los 3 mensajes mínimos. {CYCLE}/{HANDOFF}/{MAXCYCLES} se sustituyen igual que en
// el camino real (applyLoopFramingVars dentro de buildCycleMessages). El 3.º hace
// que Claude ESCRIBA UN HANDOFF nuevo como ÚLTIMA acción: ese archivo es la señal
// de avance del Loop. El nombre lleva:
//   - prefijo HANDOFF-SESSION-  → matchea el glob del proyecto activo
//     (docs/HANDOFF-SESSION-*.md / docs/handoffs/HANDOFF-SESSION-*.md).
//   - token LOOPTEST            → para borrar los artefactos de prueba luego.
//   - CLAUDE99{CYCLE}           → número de sesión ALTÍSIMO (cycle 0 → CLAUDE990,
//     cycle 1 → CLAUDE991): supera cualquier handoff real (sortea PRIMERO en
//     findProjectHandoffs/newestFirst) E incrementa por ciclo, así cada ciclo
//     produce un archivo NUEVO y distinto que awaitNewHandoff detecta como el más
//     reciente fuera del baseline.
// La línea de contenido ("LOOPTEST ...") es larga A PROPÓSITO (>200 chars) para
// superar el umbral MIN_HANDOFF_BYTES (200) de isFullyWritten; si fuera más corta,
// pickNewHandoff la tomaría por "a medio escribir" y seguiría esperando.
const TEST_HANDOFF_RELATIVE_PATH =
  "docs/handoffs/HANDOFF-SESSION-LOOPTEST-CLAUDE99{CYCLE}.md";

const TEST_MESSAGES: readonly string[] = [
  "Prueba de loop automático, ciclo {CYCLE}. Responde SOLO con: ok-1",
  "Sigue la prueba. Responde SOLO con: ok-2",
  [
    "Prueba de loop automático, ciclo {CYCLE} de {MAXCYCLES} — paso final.",
    "",
    `Como tu ÚLTIMA acción de este turno, crea EXACTAMENTE este archivo (ruta relativa al proyecto, créala con todo y carpeta si no existe):`,
    "",
    `  ${TEST_HANDOFF_RELATIVE_PATH}`,
    "",
    "Con UNA sola línea de contenido que diga, literal (es larga a propósito):",
    "",
    "  LOOPTEST handoff sintetico del ciclo {CYCLE} de {MAXCYCLES} — archivo BORRABLE generado por el modo PRUEBA del Loop. No es un handoff real: existe solo para verificar el ciclo end-to-end (abrir pestaña, enviar, barrera de turno, detectar handoff nuevo y avanzar al siguiente ciclo). Se puede borrar sin consecuencias.",
    "",
    "Escribe el archivo y luego DETENTE: no escribas ni hagas nada más después de crearlo.",
  ].join("\n"),
];

function buildTestLoopConfig(project: AnchoredProject): LoopConfig {
  return {
    ...buildLoopConfig(project, TEST_MAX_CYCLES),
    testMessages: TEST_MESSAGES,
  };
}

// Arranca una corrida del Loop: preflight de parches → resolver proyecto activo →
// QuickPick de ciclos → resolver el handoff inicial → engine.start. Cada salida
// temprana avisa al dueño por qué no arrancó.
async function startLoop(
  state: CockpitStateStore,
  engine: LoopEngine,
): Promise<void> {
  if (isLoopRunning(engine)) {
    void vscode.window.showInformationMessage(
      "El Loop ya está activo. Detenlo antes de iniciar otra corrida.",
    );
    return;
  }

  if (!(await loopPreflightOk())) {
    return;
  }

  const project = state.activeProject;
  if (!project) {
    void vscode.window.showWarningMessage(
      "No hay un proyecto activo. Fija uno antes de iniciar el Loop.",
    );
    return;
  }

  const maxCycles = await pickMaxCycles();
  if (maxCycles === undefined) {
    return;
  }

  const firstHandoff = await findLatestProjectHandoff(project);
  if (!firstHandoff) {
    void vscode.window.showWarningMessage(
      `No se encontró ningún handoff para "${project.name}"; el Loop necesita uno de partida.`,
    );
    return;
  }

  const config = buildLoopConfig(project, maxCycles);
  try {
    engine.start(config, project, firstHandoff);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "error desconocido";
    void vscode.window.showErrorMessage(`No pude iniciar el Loop: ${detail}`);
    return;
  }

  void vscode.window.showWarningMessage(
    `LOOP ACTIVO (${path.basename(firstHandoff)}, ${maxCycles} ciclos) — no toques las pestañas de Claude ni cambies de proyecto.`,
  );
}

// ── ANDAMIO DE PRUEBA (BORRABLE) ──────────────────────────────────────────────
// Arranca el Loop en modo PRUEBA: mismo preflight/proyecto/handoff inicial que el
// camino real, pero con ciclos fijos (TEST_MAX_CYCLES) y los 3 mensajes mínimos en
// la config. Usa exactamente el mismo engine.start, así prueba todo el ciclo real.
// Para revertir: borrar esta función y su comando.
async function startTestLoop(
  state: CockpitStateStore,
  engine: LoopEngine,
): Promise<void> {
  if (isLoopRunning(engine)) {
    void vscode.window.showInformationMessage(
      "El Loop ya está activo. Detenlo antes de iniciar otra corrida.",
    );
    return;
  }

  if (!(await loopPreflightOk())) {
    return;
  }

  const project = state.activeProject;
  if (!project) {
    void vscode.window.showWarningMessage(
      "No hay un proyecto activo. Fija uno antes de iniciar el Loop.",
    );
    return;
  }

  const firstHandoff = await findLatestProjectHandoff(project);
  if (!firstHandoff) {
    void vscode.window.showWarningMessage(
      `No se encontró ningún handoff para "${project.name}"; el Loop necesita uno de partida.`,
    );
    return;
  }

  const config = buildTestLoopConfig(project);
  try {
    engine.start(config, project, firstHandoff);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "error desconocido";
    void vscode.window.showErrorMessage(
      `No pude iniciar el Loop de PRUEBA: ${detail}`,
    );
    return;
  }

  void vscode.window.showWarningMessage(
    `LOOP DE PRUEBA ACTIVO (mensajes mínimos, ${TEST_MAX_CYCLES} ciclos) — escribirá handoffs LOOPTEST borrables. No toques las pestañas de Claude.`,
  );
}

// El stop es cooperativo primero (requestStop deja terminar el turno en curso) y
// duro a la segunda invocación dentro de la misma corrida (forceStop corta ya). La
// bandera per-corrida se resetea en el flanco de arranque (idle/terminal → running)
// observando onDidChange, así una corrida nueva empieza siempre con stop cooperativo.
function makeStopHandler(engine: LoopEngine): {
  handler: () => void;
  subscription: vscode.Disposable;
} {
  let cooperativeStopRequested = false;
  let wasRunning = isLoopRunning(engine);

  const subscription = engine.onDidChange(() => {
    const running = isLoopRunning(engine);
    if (running && !wasRunning) {
      // Flanco de arranque de una corrida nueva: limpiamos cualquier residuo.
      cooperativeStopRequested = false;
    }
    wasRunning = running;
  });

  const handler = (): void => {
    if (!isLoopRunning(engine)) {
      cooperativeStopRequested = false;
      void vscode.window.showInformationMessage("El Loop no está activo.");
      return;
    }

    if (!cooperativeStopRequested) {
      cooperativeStopRequested = true;
      engine.requestStop();
      void vscode.window.showInformationMessage(
        "Deteniendo el Loop al final del ciclo en curso. Vuelve a Detener para cortar ya.",
      );
      return;
    }

    cooperativeStopRequested = false;
    engine.forceStop();
    void vscode.window.showWarningMessage("Loop detenido a la fuerza.");
  };

  return { handler, subscription };
}

function isLoopRunning(engine: LoopEngine): boolean {
  let phase: LoopStatus["phase"];
  try {
    phase = engine.getStatus().phase;
  } catch {
    return false;
  }
  return (
    phase === "opening" ||
    phase === "sending" ||
    phase === "awaiting_turn" ||
    phase === "awaiting_handoff" ||
    phase === "advancing"
  );
}

// Barra de estado del Loop (espeja el patrón de statusbar.ts): muestra el progreso
// vivo "▶ Loop 2/3 · msg2" mientras corre y "■ Loop" en reposo. Click → enfoca la
// vista del Loop. Se redibuja en cada onDidChange del engine.
function registerLoopStatusBar(
  context: vscode.ExtensionContext,
  engine: LoopEngine,
): void {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    99,
  );
  statusBarItem.command = FOCUS_VIEW_COMMAND;

  const render = (): void => {
    let status: LoopStatus;
    try {
      status = engine.getStatus();
    } catch {
      statusBarItem.text = "■ Loop";
      statusBarItem.tooltip = "Loop detenido";
      statusBarItem.show();
      return;
    }

    if (isLoopRunning(engine)) {
      const suffix =
        status.phase === "sending" && status.messageCount > 0
          ? ` · msg${status.messageIndex}`
          : "";
      statusBarItem.text = `▶ Loop ${status.cycle}/${status.maxCycles}${suffix}`;
      statusBarItem.tooltip = "Loop activo · click para enfocar la vista";
    } else {
      statusBarItem.text = "■ Loop";
      statusBarItem.tooltip = "Loop detenido · click para enfocar la vista";
    }
    statusBarItem.show();
  };

  context.subscriptions.push(statusBarItem, engine.onDidChange(render));
  render();
}

export function registerLoop(
  context: vscode.ExtensionContext,
  state: CockpitStateStore,
): void {
  const engine = new LoopEngine();
  const { handler: stopHandler, subscription: stopSubscription } =
    makeStopHandler(engine);

  context.subscriptions.push(
    engine,
    createLoopView(engine),
    stopSubscription,
    vscode.commands.registerCommand("cockpit.loop.sendTest", () => {
      void runSendTest();
    }),
    vscode.commands.registerCommand(START_COMMAND, () => {
      void startLoop(state, engine);
    }),
    // ── ANDAMIO DE PRUEBA (BORRABLE) ──────────────────────────────────────────
    vscode.commands.registerCommand(START_TEST_COMMAND, () => {
      void startTestLoop(state, engine);
    }),
    vscode.commands.registerCommand(STOP_COMMAND, () => {
      stopHandler();
    }),
  );

  registerLoopStatusBar(context, engine);
}
