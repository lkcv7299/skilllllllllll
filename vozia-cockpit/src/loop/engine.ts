import { readFile } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { buildSessionPrompt } from "../launch";
import { findProjectHandoffs } from "../launch/handoffResolver";
import { parseTemplateBlocks, TemplateBlock } from "../launch/templateParser";
import {
  createHandoffRecord,
  HandoffRecord,
  handoffPathKey,
  resolveHandoffGlob,
} from "../handoffs/model";
import { AnchoredProject } from "../state";
import { applyLoopFramingVars } from "./framing";
import {
  awaitTurnComplete,
  captureNewSession,
  listSessionIds,
  TurnLogOutcome,
} from "./turnLog";

// El template vive junto al de la vista Launch (misma fuente de verdad: los bloques
// "Message 1 / 2-R3 / 3 / 4 / LOOP"). Lo leemos por su ruta absoluta, igual que
// src/launch/index.ts, en vez de exportar la constante privada de ese módulo.
const TEMPLATE_PATH = "C:\\VozIA-Project\\docs\\SESSION-FRAMING-TEMPLATE.md";

// ────────────────────────────────────────────────────────────────────────────
// Contrato público (una tarea de UI paralela construye contra ESTO — no desviar).
// ────────────────────────────────────────────────────────────────────────────

export type LoopGate = "round3" | "ownerbot" | "none";
export type LoopCycleMode = "clear" | "newtab";

export type LoopConfig = {
  projectId: string;
  gate: LoopGate;
  useGoAhead: boolean;
  cycleMode: LoopCycleMode;
  maxCycles: number;
  perTurnTimeoutMs: number;
  handoffTimeoutMs: number;
  openTimeoutMs: number;
  // ── ANDAMIO DE PRUEBA (BORRABLE) ────────────────────────────────────────────
  // Cuando está presente, el ciclo envía ESTOS mensajes mínimos en vez de armar el
  // ciclo real desde el template (sin gate, sin /go-ahead, sin framing de loop). Es
  // el modo "PRUEBA": valida el ciclo end-to-end (abrir→enviar→barrera→detectar
  // handoff→avanzar) con mensajes triviales. Ausente = comportamiento real intacto.
  // Cada string pasa por la misma sustitución {CYCLE}/{HANDOFF}/{MAXCYCLES} que el
  // camino real. Para revertir: borrar este campo + la rama en buildCycleMessages.
  testMessages?: readonly string[];
};

export type LoopPhase =
  | "idle"
  | "opening"
  | "sending"
  | "awaiting_turn"
  | "awaiting_handoff"
  | "advancing"
  | "stopped"
  | "faulted";

export type LoopCycleLog = {
  cycle: number;
  fromHandoff: string;
  toHandoff?: string;
  sessionId?: string;
  durationMs?: number;
  outcome: "ok" | "faulted";
  reason?: string;
};

export type LoopStatus = {
  phase: LoopPhase;
  cycle: number;
  maxCycles: number;
  sessionId?: string;
  currentHandoff?: string;
  messageIndex: number;
  messageCount: number;
  log: LoopCycleLog[];
  fault?: string;
};

// ────────────────────────────────────────────────────────────────────────────
// Constantes internas (sin hardcodear valores de negocio: son techos de robustez).
// ────────────────────────────────────────────────────────────────────────────

const SEND_TO_SESSION_COMMAND = "claude-vscode.sendToSession";
const REVEAL_SESSION_COMMAND = "claude-vscode.revealSession";
const OPEN_AND_SEND_COMMAND = "claude-vscode.openAndSend";

// Un handoff recién escrito puede llegar a medio escribir (el watcher dispara en la
// primera escritura). Lo consideramos sospechosamente chico bajo este umbral y NO
// lo aceptamos como avance: seguimos esperando a que termine de escribirse.
const MIN_HANDOFF_BYTES = 200;

// Error de control de flujo interno: lleva el `reason` con el que faultamos el
// ciclo. Centraliza el corte del driver sin sembrar `if` de fault en cada paso.
class LoopFault extends Error {
  public constructor(public readonly reason: string) {
    super(reason);
    this.name = "LoopFault";
  }
}

// Señal cooperativa/dura de stop. forceStop la marca como `hard`; las esperas la
// observan para abortar de inmediato. requestStop solo pide parar en el próximo
// punto de chequeo (deja terminar el turno en vuelo).
class StopSignal {
  private stopRequested = false;
  private hardRequested = false;
  private readonly listeners = new Set<() => void>();

  public requestStop(): void {
    if (!this.stopRequested) {
      this.stopRequested = true;
      this.notify();
    }
  }

  public forceStop(): void {
    this.hardRequested = true;
    this.stopRequested = true;
    this.notify();
  }

  public get stopped(): boolean {
    return this.stopRequested;
  }

  public get hard(): boolean {
    return this.hardRequested;
  }

  public onChange(listener: () => void): vscode.Disposable {
    this.listeners.add(listener);
    return new vscode.Disposable(() => this.listeners.delete(listener));
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Construcción de la lista de mensajes desde el template (sustituyendo el handoff).
// ────────────────────────────────────────────────────────────────────────────

function findBlock(
  blocks: readonly TemplateBlock[],
  needle: string,
): TemplateBlock | undefined {
  const lowered = needle.toLocaleLowerCase("es");
  return blocks.find((block) =>
    block.heading.toLocaleLowerCase("es").includes(lowered),
  );
}

function gateBlockNeedle(gate: LoopGate): string | undefined {
  switch (gate) {
    case "round3":
      return "message 2-r3";
    case "ownerbot":
      return "message 4";
    case "none":
      return undefined;
  }
}

// Arma los mensajes del ciclo: msg1 (Message 1 con el handoff sustituido + el
// framing de loop apendido), msg2 (el gate, si aplica) y msg3 (/go-ahead, si se
// pidió). Cada uno es UN sendToSession + UNA barrera; nunca se concatenan.
function buildCycleMessages(
  blocks: readonly TemplateBlock[],
  config: LoopConfig,
  handoffPath: string,
  cycle: number,
): string[] {
  // ── ANDAMIO DE PRUEBA (BORRABLE) ────────────────────────────────────────────
  // Modo PRUEBA: si la config trae mensajes de prueba, son ÉSOS los del ciclo (con
  // la misma sustitución {HANDOFF}/{CYCLE}/{MAXCYCLES} que el camino real), y NO se
  // apende el framing de loop. El template ni siquiera se mira. Cuando testMessages
  // está ausente, esta rama no se toca y el camino real de abajo queda idéntico.
  if (config.testMessages) {
    return config.testMessages.map((message) =>
      applyLoopFramingVars(message, {
        handoff: handoffPath,
        cycle,
        maxCycles: config.maxCycles,
      }),
    );
  }

  const messageOne = findBlock(blocks, "message 1");
  if (!messageOne) {
    throw new LoopFault("template_missing_message_one");
  }

  const messages: string[] = [buildSessionPrompt(messageOne, handoffPath)];

  const gateNeedle = gateBlockNeedle(config.gate);
  if (gateNeedle) {
    const gateBlock = findBlock(blocks, gateNeedle);
    if (!gateBlock) {
      throw new LoopFault("template_missing_gate_block");
    }
    messages.push(gateBlock.content);
  }

  if (config.useGoAhead) {
    const goAhead = findBlock(blocks, "message 3");
    if (!goAhead) {
      throw new LoopFault("template_missing_go_ahead");
    }
    messages.push(goAhead.content);
  }

  // Decisión del dueño (2026-06-17): el msg3 va CRUDO — el `/go-ahead` del template
  // tal cual, SIN apéndice de framing de loop. Antes el motor pegaba el bloque
  // "MODO LOOP AUTÓNOMO" al final de este mensaje; se eliminó a pedido explícito.
  // El framing autónomo ya NO se inyecta en el camino real (solo la rama de PRUEBA
  // sustituye variables, sin framing).
  return messages;
}

// ────────────────────────────────────────────────────────────────────────────
// Validación de un candidato a handoff de avance (no aceptar archivos a medio
// escribir ni sin identidad parseable).
// ────────────────────────────────────────────────────────────────────────────

function isParseableHandoff(record: HandoffRecord): boolean {
  return record.sessionNumber !== undefined || record.dateNumber !== undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// El motor.
// ────────────────────────────────────────────────────────────────────────────

export class LoopEngine implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<LoopStatus>();
  public readonly onDidChange: vscode.Event<LoopStatus> =
    this.changeEmitter.event;

  // Canal de logs para diagnosticar el loop en vivo (Output → "VozIA Cockpit Loop").
  private readonly output = vscode.window.createOutputChannel("VozIA Cockpit Loop");

  private status: LoopStatus = {
    phase: "idle",
    cycle: 0,
    maxCycles: 0,
    messageIndex: 0,
    messageCount: 0,
    log: [],
  };

  private running = false;
  private stop: StopSignal | undefined;

  public constructor() {}

  public getStatus(): LoopStatus {
    return cloneStatus(this.status);
  }

  private log(message: string): void {
    this.output.appendLine(`[${new Date().toISOString()}] ${message}`);
  }

  // Single-writer: si ya hay un loop corriendo, ignoramos el start (no se solapan).
  public start(
    config: LoopConfig,
    project: AnchoredProject,
    firstHandoff: string,
  ): void {
    if (this.running) {
      return;
    }
    this.running = true;
    const stop = new StopSignal();
    this.stop = stop;
    this.output.show(true);
    this.log(
      `=== loop iniciado · proyecto=${project.name} · cap=${config.maxCycles}` +
        `${config.testMessages ? " · MODO PRUEBA" : ""} ===`,
    );

    this.status = {
      phase: "idle",
      cycle: 0,
      maxCycles: config.maxCycles,
      messageIndex: 0,
      messageCount: 0,
      log: [],
    };
    this.emit();

    void this.run(config, project, firstHandoff, stop).finally(() => {
      this.running = false;
      this.stop = undefined;
    });
  }

  public requestStop(): void {
    this.stop?.requestStop();
  }

  public forceStop(): void {
    this.stop?.forceStop();
  }

  public dispose(): void {
    this.stop?.forceStop();
    this.changeEmitter.dispose();
    this.output.dispose();
  }

  // ── Driver secuencial ──────────────────────────────────────────────────────

  private async run(
    config: LoopConfig,
    project: AnchoredProject,
    firstHandoff: string,
    stop: StopSignal,
  ): Promise<void> {
    let currentHandoff = path.resolve(firstHandoff);
    let cycleSessionId: string | undefined;

    this.update({ currentHandoff });

    for (let cycle = 0; cycle < config.maxCycles; cycle += 1) {
      if (stop.stopped) {
        this.toStopped(cycle);
        return;
      }

      const cycleStartedAt = Date.now();
      try {
        // OPENING: fotografiamos los .jsonl YA existentes del proyecto ANTES de abrir.
        // La sesión del ciclo será el .jsonl que NO esté en este baseline (no el
        // marcador de foco, que flipea). El abrir+enviar el msg1 (openAndSend) ocurre
        // junto en el índice 0.
        this.toPhase("opening", cycle, currentHandoff, undefined);
        const baselineSessionIds = await listSessionIds(project.path);
        this.log(
          `ciclo ${cycle}: baseline de ${baselineSessionIds.size} sesión(es) en ${project.path}`,
        );
        cycleSessionId = undefined;

        // Snapshot de los handoffs ANTES de correr el ciclo: el avance es un
        // handoff que NO estaba en este baseline.
        const baseline = await this.handoffBaseline(project);

        // RUNNING_TURNS: un send + una barrera por mensaje, en orden. El msg1 va a
        // la sesión ACTIVA (la pestaña recién abierta) y CREA el id; los siguientes
        // van por-id a esa misma sesión.
        const blocks = await readTemplateBlocks();
        const messages = buildCycleMessages(
          blocks,
          config,
          currentHandoff,
          cycle,
        );
        this.update({ messageCount: messages.length, messageIndex: 0 });

        for (let index = 0; index < messages.length; index += 1) {
          if (stop.stopped) {
            this.toStopped(cycle);
            return;
          }
          cycleSessionId = await this.sendAndAwait(
            config,
            cycleSessionId,
            messages[index] ?? "",
            index,
            cycle,
            currentHandoff,
            project,
            baselineSessionIds,
            stop,
          );
        }

        // Stop cooperativo: si se pidió parar mientras corría el último turno, ya
        // terminó (la barrera no aborta en soft-stop) — halt limpio sin esperar el
        // handoff de este ciclo.
        if (stop.stopped) {
          this.toStopped(cycle);
          return;
        }

        // AWAITING_HANDOFF: esperamos un handoff fuera del baseline.
        this.toPhase(
          "awaiting_handoff",
          cycle,
          currentHandoff,
          cycleSessionId,
        );
        const nextHandoff = await this.awaitNewHandoff(
          project,
          baseline,
          config.handoffTimeoutMs,
          stop,
        );

        // ADVANCING: validamos que avanzamos de verdad (no el mismo handoff).
        this.toPhase("advancing", cycle, currentHandoff, cycleSessionId);
        if (handoffPathKey(nextHandoff) === handoffPathKey(currentHandoff)) {
          throw new LoopFault("loop_on_same_handoff");
        }

        this.appendLog({
          cycle,
          fromHandoff: currentHandoff,
          toHandoff: nextHandoff,
          sessionId: cycleSessionId,
          durationMs: Date.now() - cycleStartedAt,
          outcome: "ok",
        });
        currentHandoff = nextHandoff;
        this.update({ currentHandoff, cycle: cycle + 1 });
      } catch (error: unknown) {
        const reason = error instanceof LoopFault ? error.reason : "internal_error";
        this.appendLog({
          cycle,
          fromHandoff: currentHandoff,
          sessionId: cycleSessionId,
          durationMs: Date.now() - cycleStartedAt,
          outcome: "faulted",
          reason,
        });
        this.toFaulted(cycle, currentHandoff, cycleSessionId, reason);
        return;
      }
    }

    this.toStopped(config.maxCycles);
  }

  // ── SEND + BARRIER ───────────────────────────────────────────────────────────

  // Trae NUESTRA sesión de ciclo al frente antes de enviar. Con retainContextWhenHidden
  // el webview no se destruye en background, pero revelarlo asegura que procese el
  // envío sin demora. Best-effort: si el comando del parche no existe, el envío por-id
  // sigue de todos modos.
  private async tryRevealSession(sessionId: string): Promise<void> {
    try {
      await this.executeCommand(REVEAL_SESSION_COMMAND, sessionId);
    } catch {
      // comando ausente: seguimos
    }
  }

  private async sendAndAwait(
    config: LoopConfig,
    cycleSessionId: string | undefined,
    text: string,
    index: number,
    cycle: number,
    currentHandoff: string,
    project: AnchoredProject,
    baselineSessionIds: ReadonlySet<string>,
    stop: StopSignal,
  ): Promise<string> {
    let sessionId: string;
    let sentTs: number;
    if (index === 0 || !cycleSessionId) {
      // PRIMER mensaje del ciclo: abre una pestaña NUEVA y mete el msg1 EN ELLA (por
      // referencia de panel). Eso CREA el .jsonl de la sesión bajo el dir del proyecto;
      // lo capturamos como el archivo que NO estaba en el baseline → su nombre es el
      // session-id real, sin depender de ningún marcador de foco.
      this.toPhase("sending", cycle, currentHandoff, undefined, index);
      sentTs = Date.now();
      await this.executeCommand(OPEN_AND_SEND_COMMAND, project.path, text);
      this.log(`ciclo ${cycle}: openAndSend disparado — capturando .jsonl nuevo`);
      try {
        sessionId = await captureNewSession(
          project.path,
          baselineSessionIds,
          sentTs,
          config.openTimeoutMs,
          stop,
          (message) => this.log(`ciclo ${cycle}: ${message}`),
        );
      } catch (error: unknown) {
        throw new LoopFault(
          error instanceof Error ? error.message : "open_no_session_id",
        );
      }
      this.update({ sessionId });
      this.log(`ciclo ${cycle}: sesión capturada ${sessionId}`);
    } else {
      sessionId = cycleSessionId;
      // Enfocamos NUESTRA sesión antes de enviar (no fallamos si el dueño miró otra
      // pestaña).
      await this.tryRevealSession(sessionId);
      this.toPhase("sending", cycle, currentHandoff, sessionId, index);
      sentTs = Date.now();
      await this.executeCommand(SEND_TO_SESSION_COMMAND, sessionId, text);
    }

    this.log(`ciclo ${cycle}: msg ${index + 1} enviado a ${sessionId} — esperando turno`);
    this.toPhase("awaiting_turn", cycle, currentHandoff, sessionId, index);
    const outcome = await this.awaitTurnDone(
      project.path,
      sessionId,
      sentTs,
      config.perTurnTimeoutMs,
      stop,
    );
    this.log(`ciclo ${cycle}: msg ${index + 1} turno → ${outcome.kind}`);
    if (outcome.kind === "turn_timeout") {
      throw new LoopFault("turn_timeout");
    }
    return sessionId;
  }

  // BARRERA dura: bloquea el mensaje N+1 hasta que el .jsonl de la sesión muestre el
  // turno cerrado (último mensaje top-level = assistant con stop_reason "end_turn",
  // fechado ≥ el momento del envío). Es la señal CANÓNICA que escribe la propia GUI,
  // no un proxy de estado de UI: no hay race running→idle ni dependencia del foco.
  // Timeout total → turn_timeout. forceStop → aborted (rechaza, lo captura el driver).
  private async awaitTurnDone(
    cwd: string,
    sessionId: string,
    sentTs: number,
    timeoutMs: number,
    stop: StopSignal,
  ): Promise<TurnLogOutcome> {
    try {
      return await awaitTurnComplete(
        cwd,
        sessionId,
        sentTs,
        timeoutMs,
        stop,
        (message) => this.log(message),
      );
    } catch (error: unknown) {
      // awaitTurnComplete solo rechaza ante un stop duro ("aborted").
      throw new LoopFault(error instanceof Error ? error.message : "aborted");
    }
  }

  // ── AWAITING_HANDOFF ─────────────────────────────────────────────────────────

  private async handoffBaseline(
    project: AnchoredProject,
  ): Promise<Set<string>> {
    const handoffs = await findProjectHandoffs(project);
    return new Set(handoffs.map((handoffPath) => handoffPathKey(handoffPath)));
  }

  // Espera (FileSystemWatcher sobre los globs + un chequeo inmediato) a un handoff
  // que NO estaba en el baseline, parseable y no a medio escribir. Devuelve el de
  // ranking más nuevo. Timeout → no_handoff. forceStop → aborted.
  private awaitNewHandoff(
    project: AnchoredProject,
    baseline: ReadonlySet<string>,
    timeoutMs: number,
    stop: StopSignal,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const watchers: vscode.Disposable[] = [];

      const finish = (run: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        for (const disposable of watchers.splice(0)) {
          disposable.dispose();
        }
        stopSub.dispose();
        run();
      };

      const evaluate = (): void => {
        void this.pickNewHandoff(project, baseline).then((picked) => {
          if (picked) {
            finish(() => resolve(picked));
          }
        });
      };

      const timer = setTimeout(
        () => finish(() => reject(new LoopFault("no_handoff"))),
        timeoutMs,
      );
      const stopSub = stop.onChange(() => {
        if (stop.hard) {
          finish(() => reject(new LoopFault("aborted")));
        }
      });

      // Un watcher por glob, igual que src/handoffs/index.ts.
      for (const handoffGlob of project.handoffGlobs) {
        const resolved = resolveHandoffGlob(project.path, handoffGlob);
        if (!resolved.pattern) {
          continue;
        }
        const watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(
            vscode.Uri.file(resolved.basePath),
            resolved.pattern,
          ),
        );
        watchers.push(
          watcher,
          watcher.onDidCreate(() => evaluate()),
          watcher.onDidChange(() => evaluate()),
        );
      }

      // Chequeo inmediato: el handoff pudo escribirse entre el último turno y el
      // armado del watcher.
      evaluate();
    });
  }

  // Elige el handoff de avance: el de ranking más nuevo que (1) no esté en baseline,
  // (2) tenga identidad parseable (CLAUDE<N> o fecha) y (3) ya esté escrito (tamaño
  // ≥ umbral). Si el mejor candidato aún está a medio escribir, devuelve undefined
  // para seguir esperando — no acepta basura como avance.
  private async pickNewHandoff(
    project: AnchoredProject,
    baseline: ReadonlySet<string>,
  ): Promise<string | undefined> {
    const ordered = await findProjectHandoffs(project);
    for (const candidatePath of ordered) {
      if (baseline.has(handoffPathKey(candidatePath))) {
        continue;
      }
      if (!isParseableHandoff(createHandoffRecord(candidatePath))) {
        continue;
      }
      if (!(await this.isFullyWritten(candidatePath))) {
        // El mejor candidato nuevo todavía se está escribiendo: no degradamos a uno
        // peor; esperamos a que ESTE termine.
        return undefined;
      }
      return candidatePath;
    }
    return undefined;
  }

  private async isFullyWritten(filePath: string): Promise<boolean> {
    try {
      const content = await readFile(filePath, { encoding: "utf8" });
      return content.trim().length >= MIN_HANDOFF_BYTES;
    } catch {
      return false;
    }
  }

  // ── Infraestructura de transición/estado ─────────────────────────────────────

  private async executeCommand(
    command: string,
    ...args: readonly string[]
  ): Promise<void> {
    try {
      await vscode.commands.executeCommand(command, ...args);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : "comando falló";
      throw new LoopFault(`command_failed:${command}:${detail}`);
    }
  }

  private toPhase(
    phase: LoopPhase,
    cycle: number,
    currentHandoff: string,
    sessionId: string | undefined,
    messageIndex?: number,
  ): void {
    this.update({
      phase,
      cycle,
      currentHandoff,
      sessionId,
      ...(messageIndex === undefined ? {} : { messageIndex }),
    });
  }

  private toStopped(cycle: number): void {
    this.update({ phase: "stopped", cycle });
  }

  private toFaulted(
    cycle: number,
    currentHandoff: string,
    sessionId: string | undefined,
    fault: string,
  ): void {
    this.update({
      phase: "faulted",
      cycle,
      currentHandoff,
      sessionId,
      fault,
    });
  }

  private appendLog(entry: LoopCycleLog): void {
    this.update({ log: [...this.status.log, entry] });
  }

  private update(patch: Partial<LoopStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emit();
  }

  private emit(): void {
    this.changeEmitter.fire(cloneStatus(this.status));
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers de módulo.
// ────────────────────────────────────────────────────────────────────────────

function cloneStatus(status: LoopStatus): LoopStatus {
  return {
    ...status,
    log: status.log.map((entry) => ({ ...entry })),
  };
}

async function readTemplateBlocks(): Promise<TemplateBlock[]> {
  const raw = await readFile(TEMPLATE_PATH, { encoding: "utf8" });
  return parseTemplateBlocks(raw);
}
