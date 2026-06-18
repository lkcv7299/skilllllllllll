<div align="center">

# 🧰 Claude Code Setup

**Mi entorno de trabajo con Claude Code** — los skills, frameworks y herramientas
que uso a diario para construir software con agentes, en calidad y sin improvisar.

![Skills](https://img.shields.io/badge/skills-8-7c3aed)
![Frameworks](https://img.shields.io/badge/frameworks-3-2563eb)
![Extension](https://img.shields.io/badge/VS%20Code-extension-007ACC?logo=visualstudiocode)
![License](https://img.shields.io/badge/license-MIT-22c55e)

</div>

---

Esto no es una librería de código: es un **setup**. La forma en que le doy a un agente
contexto, disciplina y herramientas para que produzca trabajo de calidad de forma autónoma.
Tres piezas:

| Pieza | Qué es | Dónde |
|-------|--------|-------|
| 🎯 **Skills** | Conocimiento empaquetado que el agente carga bajo demanda — cómo *promptear* cada modelo y cómo *diseñar* arquitectura. | [`skills/`](skills/) |
| 🔁 **Frameworks** | Los loops de trabajo: auditar cambios uno-a-uno, descomponer fallas en verticales paralelos, y enmarcar una sesión. | [`frameworks/`](frameworks/) |
| 🛰️ **VozIA Cockpit** | Extensión propia de VS Code: panel para proyectos, handoffs, sesiones, prompts y un **loop autónomo** de Claude Code. | [`vozia-cockpit/`](vozia-cockpit/) |

---

## 🎯 Skills

Un *skill* es una carpeta con un `SKILL.md` (y archivos de apoyo) que un agente lee
**justo cuando lo necesita** — no ocupa contexto hasta entonces.

### Prompting — cómo hablarle a cada modelo

| Skill | Para qué |
|-------|----------|
| [`gpt55-prompting`](skills/prompting/gpt55-prompting/) | Prompts outcome-first para GPT-5.5 / Codex CLI. Condiciones de parada, anti-loop, horizonte largo. |
| [`prompt-fable-5`](skills/prompting/prompt-fable-5/) | Prompts y sub-agentes para Claude Fable 5. Effort como dial primario, autonomía, la trampa de `reasoning_extraction`. |
| [`prompt-opus-4-8`](skills/prompting/prompt-opus-4-8/) | Prompts brutales y outcome-first para Claude Opus 4.8: literalismo, adaptive-thinking, estructura ROLE/GOAL/CONTEXT/STOP/DON'T/VERIFY. |

### Arquitectura — cómo diseñar el código

| Skill | Para qué |
|-------|----------|
| [`improve-codebase-architecture`](skills/architecture/improve-codebase-architecture/) | El gate raíz: cuándo y cómo mejorar la arquitectura sin sobre-ingeniería. |
| [`domain-driven-design`](skills/architecture/domain-driven-design/) | Patrones tácticos de DDD: bounded contexts, lenguaje ubicuo, fronteras de dominio. |
| [`clean-architecture`](skills/architecture/clean-architecture/) | Reglas de dependencia y fronteras de import en TypeScript funcional. |
| [`codebase-design`](skills/architecture/codebase-design/) | Vocabulario de módulos profundos: deepening, design-it-twice, dónde va el seam. |
| [`domain-modeling`](skills/architecture/domain-modeling/) | Modelar conceptos de dominio: formato de ADR y de contexto. |

> Estos cinco se aplican **juntos** cuando un agente *diseña* un fix de runtime.

---

## 🔁 Frameworks

| Framework | Qué resuelve |
|-----------|--------------|
| [Round-3 Audit Loop](frameworks/round3-audit-loop.md) | Auditar cambios **uno a la vez** con gates de arquitectura, juez de contexto fresco y *stress* como gate de cierre. La disciplina que evita que el momentum atropelle la calidad. |
| [`vertical-decomposition`](frameworks/vertical-decomposition/) | Convertir un reporte de N fallas en M verticales **independientes por archivo**, paralelizables sin conflictos de merge. |
| [Session Framing](frameworks/session-framing/) | El template para abrir una sesión: un kernel de comportamiento + un gate según el tipo de trabajo. |

---

## 🛰️ VozIA Cockpit

Una extensión de VS Code que construí para orquestar mi propio flujo con Claude Code:
proyectos anclados, handoffs, sesiones curadas, prompts reutilizables y un **loop autónomo**.

→ Ver [`vozia-cockpit/`](vozia-cockpit/) para capturas y cómo correrla.

---

## 🧠 La filosofía en una línea

> **Autonomía con fundamento.** El agente ejecuta solo, pero ancla cada posición en una
> autoridad nombrada, verifica contra la realidad (no contra el claim) y produce un
> **artefacto** que no puede falsear en cada paso.

---

<div align="center">
<sub>Hecho con ☕ por <a href="https://github.com/lkcv7299">lkcv7299</a> · MIT</sub>
</div>
