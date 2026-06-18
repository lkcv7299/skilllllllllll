# 🔁 Frameworks

Los loops de trabajo. Un skill es *conocimiento*; un framework es un *proceso* — la secuencia
de pasos (cada uno con su artefacto) que un agente sigue para producir calidad.

| Framework | Cuándo |
|-----------|--------|
| [**Round-3 Audit Loop**](round3-audit-loop.md) | Tenés un cambio que **ya existe** (un PR, un fix de otro agente) y necesitás auditar su calidad e integrarlo sobre la rama viva, sin re-diagnosticar. |
| [**Vertical Decomposition**](vertical-decomposition/) | Tenés un reporte con N fallas y querés partirlo en M verticales **independientes por archivo**, paralelizables sin conflictos de merge. |
| [**Session Framing**](session-framing/) | Vas a abrir una sesión y querés enmarcarla: un kernel de comportamiento universal + un gate según el tipo de trabajo. |

## El hilo común: artifact-gated

Los tres comparten un principio:

> **Los docs no previenen — los artefactos sí.**
> Cada paso exige una evidencia que el agente no puede falsear (un replay, un grep, un
> veredicto de juez fresco). Si no podés pegar el artefacto, no podés hacer la afirmación.

Esto convierte "instrucciones que se saltan bajo momentum" en "gates mecánicos que bloquean".
