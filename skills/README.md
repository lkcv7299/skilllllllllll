# 🎯 Skills

Un *skill* es una carpeta con un `SKILL.md` y archivos de apoyo. El agente lo lee **justo
cuando lo necesita** — no consume contexto hasta entonces. Esa carga-bajo-demanda es la
diferencia entre "tener 80 skills" y "tener 80 skills caros".

## Cómo se instalan

Copiá la carpeta del skill a tu directorio de skills de Claude Code:

```bash
# global (todos los proyectos)
cp -r skills/prompting/prompt-opus-4-8 ~/.claude/skills/

# o por-proyecto
cp -r skills/architecture/* .claude/skills/
```

El agente los descubre por el `name` + `description` del frontmatter de cada `SKILL.md`.

---

## Prompting — cómo hablarle a cada modelo

Cada modelo tiene su propia física. Estos skills la encapsulan para que tus prompts
y sub-agentes salgan bien a la primera.

- [**`gpt55-prompting`**](prompting/gpt55-prompting/) — GPT-5.5 / Codex CLI. Outcome-first,
  condiciones de parada explícitas, anti-loop, horizonte largo. Incluye `EXAMPLES.md` y
  `REFERENCE.md`.
- [**`prompt-fable-5`**](prompting/prompt-fable-5/) — Claude Fable 5. Instruction-following
  fuerte (instrucciones breves > enumeración), effort como dial primario, autonomía de
  horizonte largo, y la trampa de `reasoning_extraction` que hay que evitar.
- [**`prompt-opus-4-8`**](prompting/prompt-opus-4-8/) — Claude Opus 4.8. Literalismo,
  effort como dial primario, adaptive-thinking, anti-overtrigger, y la estructura
  ROLE/GOAL/CONTEXT/STOP/DON'T/VERIFY. Incluye `assets/` (template) y `references/`.

## Arquitectura — cómo diseñar el código

Los cinco se aplican **juntos** cuando un agente *diseña* un cambio de runtime. No son
checklists genéricos: son lentes opinados.

- [**`improve-codebase-architecture`**](architecture/improve-codebase-architecture/) — el
  gate raíz. Cuándo mejorar la arquitectura y cuándo NO (anti sobre-ingeniería).
- [**`domain-driven-design`**](architecture/domain-driven-design/) — bounded contexts,
  lenguaje ubicuo, fronteras de dominio. (`BOUNDED-CONTEXTS.md`, `LANGUAGE.md`)
- [**`clean-architecture`**](architecture/clean-architecture/) — reglas de dependencia y
  fronteras de import. (`DEPENDENCY-RULES.md`, `LANGUAGE.md`)
- [**`codebase-design`**](architecture/codebase-design/) — vocabulario de módulos profundos:
  deepening, design-it-twice, dónde poner el seam. (`DEEPENING.md`, `DESIGN-IT-TWICE.md`)
- [**`domain-modeling`**](architecture/domain-modeling/) — modelar conceptos de dominio con
  ADRs y contextos. (`ADR-FORMAT.md`, `CONTEXT-FORMAT.md`)
