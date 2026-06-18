// Decisión del dueño (2026-06-17): el Loop ya NO inyecta ningún banner/apéndice de
// "MODO LOOP AUTÓNOMO" en los mensajes del ciclo — el msg3 (/go-ahead) va crudo. Por
// eso se eliminaron las constantes de framing (LOOP_FRAMING_FALLBACK y el banner
// compacto). Lo único que sobrevive es la sustitución de variables, que sigue
// usando la rama de PRUEBA del motor para los {HANDOFF}/{CYCLE}/{MAXCYCLES}.

export type LoopFramingVars = {
  handoff: string;
  cycle: number;
  maxCycles: number;
};

// Sustituye {HANDOFF}/{CYCLE}/{MAXCYCLES} en un bloque de framing (el del template
// si existe, o el fallback de arriba). Reemplazo inmutable: no muta el template.
export function applyLoopFramingVars(
  framing: string,
  vars: LoopFramingVars,
): string {
  return framing
    .split("{HANDOFF}")
    .join(vars.handoff)
    .split("{CYCLE}")
    .join(String(vars.cycle))
    .split("{MAXCYCLES}")
    .join(String(vars.maxCycles));
}
