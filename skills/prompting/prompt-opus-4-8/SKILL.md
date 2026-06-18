---
name: prompt-opus-4-8
description: Craft brutal, outcome-first prompts and sub-agent briefs optimized for Claude Opus 4.8 with adaptive thinking. Encodes Opus 4.8's literalism, effort-as-the-primary-dial, adaptive-thinking steering, anti-overtrigger tuning, and the ROLE/GOAL/CONTEXT/STOP/DON'T/VERIFY structure. This skill should be used when prompting Claude Opus 4.8, writing system prompts, authoring sub-agent prompts, or building agentic loops for Opus 4.8 / Claude Code.
---

# Prompt Opus 4.8

Author prompts for the *actual* model in front of you, not for a generic LLM. Claude Opus 4.8 behaves differently enough from every prior model that prompts tuned for 4.6/4.7 (and especially GPT-style prompts) leave capability on the table or actively backfire. This skill encodes the official behavioral model and turns it into an authoring procedure.

**Source provenance** — everything here traces to official Anthropic docs (platform.claude.com/docs: *Prompting best practices*, *What's new in Claude Opus 4.8*, *Adaptive thinking*, *Effort*), the Anthropic engineering blog (*Effective context engineering for AI agents*), and Thariq Shihipar (Claude Code team). It is extrapolated aggressively but never invented. Deep detail lives in `references/`; read those when the task touches their domain.

---

## The two non-negotiable laws

These two override everything else. Internalize them before writing a single line.

### Law 1 — Effort is the primary dial, not your prose.

On Opus 4.8 the `effort` parameter (`low`/`medium`/`high`/`xhigh`/`max`) controls depth of reasoning, number of tool calls, and verbosity — *all token spend*. The official guidance is blunt: **"If you observe shallow reasoning on complex problems, raise effort to `high` or `xhigh` rather than prompting around it."** Effort matters more on this model than on any prior Opus.

So **decide effort before you write prose** (see Step 0). Most "make it think harder / be more thorough / use the tools" prose you would have written for older models is now redundant or harmful — it should be a knob, not a paragraph. Defaults: `xhigh` for coding/agentic, `high` minimum for intelligence-sensitive work, `medium`/`low` only when you've *measured* that quality holds.

### Law 2 — Opus 4.8 is extremely literal. Say exactly what you mean.

The model "interprets prompts literally and explicitly, particularly at lower effort levels. It does not silently generalize an instruction from one item to another, and it does not infer requests you didn't make." Treat your prompt as instructions to a brilliant but literal new hire on day one — they do *exactly* what you say.

Consequences you must design around:
- **State scope explicitly.** "Apply this to every section, not just the first" — it will not generalize for you.
- **If you want above-and-beyond, ask for it.** It will not over-deliver to impress you. The era of inferred generosity is over.
- **Literalism is a feature.** It gives precision, less thrash, and predictable pipelines. Lean into it with carefully specified prompts rather than fighting it.

---

## Step 0 — Set effort + thinking BEFORE writing prose

This is the part everyone skips. Do it first.

1. **Pick effort** from the task class (full table in `references/adaptive-thinking-effort.md`):
   - Coding / agentic / long-horizon → **`xhigh`** (start here).
   - Intelligence-sensitive knowledge work → **`high`** (the default; minimum for hard work).
   - Cost/latency-sensitive but still non-trivial → **`medium`**.
   - Short, scoped, latency-critical, not intelligence-sensitive (subagents, classification, lookups) → **`low`**.
   - Genuinely frontier problems where evals show headroom above `xhigh` → **`max`** (warning: can overthink; diminishing returns).
2. **Set thinking.** On Opus 4.8 thinking is *off* unless you pass `thinking: {type: "adaptive"}`. Adaptive is the only mode (`budget_tokens` is rejected with a 400). Adaptive auto-enables interleaved thinking (thinking between tool calls) — essential for agents.
3. **Size `max_tokens`.** At `xhigh`/`max`, start at **64k** so the model has room to think + act across tool calls and subagents. `max_tokens` is the only *hard* cap on thinking+output; `effort` is soft guidance.
4. **Only then** decide what prose the prompt actually needs. If a knob solves it, don't write a paragraph.

In Claude Code: `xhigh` is exposed; "ultracode" = `xhigh` + standing permission to fan out multi-agent workflows. You usually cannot set the API params directly, but you steer the same behaviors through the prose levers below.

---

## The authoring procedure

1. **Strip what the model already knows.** Don't explain what coding, codebases, or HTTP are. "Focus on information that pushes Claude out of its normal way of thinking" (Thariq). High-signal tokens only — context is a finite resource.
2. **Find the right altitude.** Give the *goal and the constraints*, not a step-by-step script. Over-specifying process narrows the search space and produces mechanical work. Too vague fails too. Aim for "specific enough to guide, flexible enough to adapt." Reserve numbered steps for when order/completeness genuinely matters.
3. **Write the ROLE/GOAL/CONTEXT/STOP/DON'T/VERIFY skeleton** (template below). The STOP and VERIFY sections are what prevent premature "done" claims.
4. **Add only the quirk-snippets this task needs** from `references/snippet-library.md` — verbosity control, action-vs-conservative, subagent fan-out, anti-overengineering, anti-hardcoding, autonomy/safety, etc. Don't bulk-paste; each snippet is a targeted fix for one observed behavior.
5. **Dial back anti-laziness language.** This is the #1 migration error. Where an old prompt screamed `CRITICAL: You MUST use this tool`, write `Use this tool when…`. Opus 4.8 follows instructions faithfully and *overtriggers* on aggressive phrasing. `ALWAYS`/`NEVER` are reserved for true invariants (safety, required output fields, things that must never happen).
6. **Self-check the prompt.** Golden rule: hand it to a colleague with no context. If they'd be confused, so will Claude.

---

## Base template

```markdown
# ROLE
[One descriptor sentence. Expertise area, not a persona costume. "You are a database migration reviewer." Not "You are a 10x rockstar engineer."]

## GOAL
[The verifiable destination, not the route. What does "done and correct" look like? State scope EXPLICITLY — Opus 4.8 will not widen it for you.]

## CONTEXT
[Only non-obvious, high-signal facts. Point to files/paths the model can read rather than pasting them (just-in-time context). Wrap distinct inputs in XML tags. Put long documents (20k+ tokens) ABOVE the instructions; put the actual query at the end.]

## CONSTRAINTS / DON'T
[True invariants as ALWAYS/NEVER. Judgment calls as softer guidance. Scope fences. Reuse <minimize_overengineering> and <no_hardcoding> from the snippet library when generating code.]

## STOP CONDITIONS
[Explicit: when is the task complete? When should it stop searching/retrying/expanding? What does it do when blocked vs. when uncertain? Without this, long-horizon agents either quit early or loop.]

## VERIFY
[Before finishing, the model checks its own work against concrete criteria. "Verify your answer against the tests in X." "Re-read the files you claim you changed." This catches errors reliably, especially for code and math.]
```

**Adaptive-thinking note for the skeleton:** Do NOT add "think step by step" / chain-of-thought scaffolding when adaptive thinking is on — it's redundant and the model's own reasoning usually exceeds a hand-written plan. Prefer the general instruction ("think thoroughly", or just raise effort) over a prescriptive step list. If you need *more* thinking on one turn, append to the user message: `Please think hard before responding.` To *suppress* it: `Answer directly without deliberating.` Steering is wording-sensitive — if one phrasing doesn't take, try a more direct variant.

---

## When to read each reference

- **`references/behavioral-deltas.md`** — the full catalog of Opus 4.8 behavior changes (verbosity calibration, tool-use-favors-reasoning, fewer subagents, progress updates, design house-style, interactive-coding token use, the code-review-harness recall trap, tone shift). Read before tuning any prompt that worked on 4.6/4.7, or when a behavior surprises you.
- **`references/adaptive-thinking-effort.md`** — exact API params, the full effort table, `display: "omitted"` default change, interleaved thinking, prompt-caching interaction, `max_tokens` sizing, migration off `budget_tokens`. Read when configuring the API directly or steering thinking frequency.
- **`references/snippet-library.md`** — the battle-tested, copy-paste prompt snippets straight from the official docs, categorized by the behavior they fix. Pull from here in Step 4.
- **`assets/prompt-template.md`** — a fuller fill-in-the-blanks version of the skeleton for authoring a complete prompt or sub-agent brief.

---

## Gotchas (the highest-signal section)

- **Don't carry over 4.6/4.7 anti-laziness prompts.** They cause overtriggering on 4.8. Symptom: too many tool calls, too many subagents, overeager edits. Fix: soften language, lower effort.
- **Lower recall in a code-review harness is usually a harness effect, not a regression.** When your prompt says "only high-severity" / "be conservative" / "don't nitpick," Opus 4.8 obeys and drops low-severity findings it actually found. Fix: tell it the finding stage is for *coverage* ("report every issue including uncertain/low-severity, with confidence + severity tags; a later step filters"). See the snippet library.
- **No more prefill.** Prefilling the last assistant turn returns a 400 on 4.6+ and Mythos. Use Structured Outputs, XML-tag instructions, or a "respond without preamble" instruction instead.
- **Thinking text is hidden by default on 4.8** (`display` defaults to `"omitted"`). If you need to read summarized thinking for prompt-debugging, set `thinking: {type: "adaptive", display: "summarized"}`.
- **No `temperature`/`top_p`/`top_k`.** Non-default sampling params return a 400. Steer with prose and effort, not temperature. For design variety (where you'd have raised temperature), ask the model to propose N directions first, then build the chosen one.
- **Fewer subagents by default.** If you want fan-out, authorize it explicitly ("spawn multiple subagents when fanning out across items or reading multiple files"). Conversely it favors reasoning over tool calls — raise effort or name the tool to get more tool use.
- **It auto-calibrates verbosity.** Short on lookups, long on open-ended analysis. If your product needs a fixed style, prompt for it — and prefer a positive example of the target concision over a "don't be verbose" instruction.
- **Don't state the obvious; build a Gotchas section instead.** When writing a *skill* for Opus 4.8, the highest-signal content is the failure modes it actually hits, not a restatement of what it already knows.
- **Effort isn't free real estate.** `max` can overthink and shows diminishing returns; `low`/`medium` risk under-thinking on complex tasks because 4.8 respects low effort *strictly* and scopes to exactly what was asked. Measure on your evals before locking a level.
