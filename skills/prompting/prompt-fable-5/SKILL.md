---
name: prompt-fable-5
description: Craft outcome-first prompts and sub-agent briefs optimized for Claude Fable 5 (Mythos-class). Encodes Fable 5's strong instruction-following (brief instructions beat enumeration), effort-as-primary-dial, long-horizon autonomy, the reasoning_extraction refusal trap, and the official Anthropic snippet set. Use when prompting Claude Fable 5, writing system prompts, authoring sub-agent prompts, or building agentic loops for Fable 5 / Claude Code.
---

# Prompt Fable 5

Author prompts for the *actual* model in front of you. Claude Fable 5 is the Mythos-class model made generally available (launched 2026-06-09): strictly more capable than Opus 4.8, built for long-running, ambiguous, end-to-end work that takes a person hours-to-weeks. Prompts tuned for Opus 4.8 (let alone GPT-style prompts) frequently *backfire* here — Fable 5's instruction-following is strong enough that the brutal, prescriptive style that worked on prior models now over-constrains and degrades output.

**Source provenance** — everything here traces to official Anthropic docs (platform.claude.com/docs: *Prompting Claude Fable 5*, *Introducing Claude Fable 5 and Claude Mythos 5*, *Adaptive thinking*, *Effort*, *Refusals and fallback*). Snippets are quoted from those pages, not invented.

---

## The two non-negotiable laws

### Law 1 — Effort is the primary dial, not your prose.
`effort` (`low`/`medium`/`high`/`xhigh`/`max`) is the primary control for the intelligence ↔ latency ↔ cost trade-off. Official guidance: **use `high` as the default**, `xhigh` for the most capability-sensitive work, `medium`/`low` for routine. Critically — **Fable 5's `low`/`medium` often exceed `xhigh` on prior models**, so reach for lower effort more readily than you did on Opus 4.8. If reasoning looks shallow, raise effort rather than prompting around it. In Claude Code you steer the same behaviors through the prose levers below.

### Law 2 — Less prescription, not more. Brief instructions beat enumeration.
Fable 5 follows instructions well enough that **a short instruction steers a whole class of behavior** — you do not enumerate each case by name. The official guide is explicit: *"Skills developed for prior models are often too prescriptive for Claude Fable 5 and can degrade output quality. Review and consider removing older instructions if default performance is better."* When migrating an Opus-4.8 prompt, your job is usually to **delete**, not add.

---

## Step 0 — Set effort + thinking BEFORE writing prose

1. **Pick effort:** `high` default; `xhigh` only for the hardest capability-sensitive work; `medium`/`low` for routine (they hold up well on Fable). Reduce effort if a task completes but takes longer than needed, or you want a quicker interactive feel.
2. **Thinking is adaptive-only and ALWAYS ON.** `thinking: {type: "disabled"}` is *not supported*; `budget_tokens`, `temperature`, `top_p`, `top_k` are rejected. Raw chain-of-thought is never returned (`thinking.display` defaults to `"omitted"`; set `"summarized"` only for debugging).
3. **Expect long turns.** Single hard requests can run many minutes at high effort; autonomous runs can go hours. Adjust timeouts, stream, and prefer async/scheduled check-ins over blocking. This is the #1 operational surprise.
4. **Only then** write prose — and write *less* of it than you would for Opus 4.8.

---

## The reasoning_extraction trap (read before anything else)

Fable 5 runs safety classifiers. One of them — `reasoning_extraction` — fires when a prompt, skill, or harness instruction tells the model to **echo, transcribe, reproduce, or explain its internal reasoning as response text**. That returns `stop_reason: "refusal"` and forces an elevated fallback to Opus 4.8.

- **Audit existing skills/system prompts for "show your work" / "explain your reasoning step by step in the answer" / "narrate your thinking" instructions and remove them.** This is the single most common migration break.
- Need reasoning visibility? Read the structured `thinking` blocks (adaptive thinking) instead, and use a **send-to-user tool** to surface progress.
- The other classifiers cover **offensive cybersecurity** (exploits, malware, attack tooling) and **biology/life-sciences** (lab methods, molecular mechanisms). Benign security/bio work can also trip them. For those domains, configure **fallback to `claude-opus-4-8`** (server-side `fallbacks` param or SDK middleware). You are not billed for output-less refusals; fallback credit refunds the prompt-cache switch cost.

---

## What changed vs Opus 4.8 (tune for these)

| Behavior | Fable 5 vs Opus 4.8 | Lever |
|---|---|---|
| Turn length | Much longer by default at high effort | Lower effort; async harness |
| Instruction following | Stronger — brief instruction steers a class | Delete enumerated rules; trust short ones |
| Subagents | Dispatches **more** readily, manages long-lived peers well | Encourage fan-out; async orchestration |
| Autonomy / ambiguity | Handles multi-threaded, ambiguous asks; determines next steps | Give the goal + intent, not a script |
| Tidying at high effort | Can over-refactor / over-deliver | `<minimize_overengineering>` snippet |
| Early stopping (deep in long sessions) | Occasionally states intent without the tool call, or asks when it could proceed | Autonomy snippet; "go ahead end to end" |
| Context-budget anxiety | May offer to hand off/summarize if shown a token countdown | Hide countdowns; reassurance snippet |
| Vision | Substantially better; uses bash/crop tools on noisy images | Fewer scaffolds needed |

---

## Official snippet library (copy-paste, quoted from Anthropic)

Pull only what the task needs. Each fixes one observed behavior.

**Stop overplanning on ambiguous tasks:**
```text
When you have enough information to act, act. Do not re-derive facts already established
in the conversation, re-litigate a decision the user has already made, or narrate options
you will not pursue in user-facing messages. If you are weighing a choice, give a
recommendation, not an exhaustive survey. This does not apply to thinking blocks.
```

**Anti-overengineering (use when generating code at high effort):**
```text
Don't add features, refactor, or introduce abstractions beyond what the task requires. A
bug fix doesn't need surrounding cleanup and a one-shot operation usually doesn't need a
helper. Don't design for hypothetical future requirements: do the simplest thing that
works well. Don't add error handling, fallbacks, or validation for scenarios that cannot
happen. Trust internal code and framework guarantees. Only validate at system boundaries
(user input, external APIs). Don't use feature flags or backwards-compatibility shims when
you can just change the code.
```

**Brevity / lead-with-outcome (one instruction replaces a list of patterns):**
```text
Lead with the outcome. Your first sentence after finishing should answer "what happened"
or "what did you find". Supporting detail and reasoning come after. The way to keep output
short is to be selective about what you include (drop details that don't change what the
reader would do next), not to compress into fragments, abbreviations, or arrow chains.
```

**Ground progress claims (kills fabricated status on long runs):**
```text
Before reporting progress, audit each claim against a tool result from this session. Only
report work you can point to evidence for; if something is not yet verified, say so. If
tests fail, say so with the output; if a step was skipped, say that; when something is
done and verified, state it plainly without hedging.
```

**State the boundary (assessment vs change):**
```text
When the user is describing a problem, asking a question, or thinking out loud rather than
requesting a change, the deliverable is your assessment. Report your findings and stop.
Don't apply a fix until they ask. Before running a command that changes system state,
check that the evidence supports that specific action.
```

**Checkpoint (pause only where genuinely needed):**
```text
Pause for the user only when the work genuinely requires them: a destructive or
irreversible action, a real scope change, or input that only they can provide. If you hit
one of these, ask and end the turn, rather than ending on a promise.
```

**Autonomous-pipeline reminder (no human watching):**
```text
You are operating autonomously. The user is not watching in real time and cannot answer
questions mid-task, so asking "Want me to…?" will block the work. For reversible actions
that follow from the original request, proceed without asking. Before ending your turn,
check your last paragraph. If it is a plan, a question, or a promise about work you have
not done ("I'll…"), do that work now with tool calls. End your turn only when the task is
complete or you are blocked on input only the user can provide.
```

**Parallel subagents:**
```text
Delegate independent subtasks to subagents and keep working while they run. Intervene if a
subagent goes off track or is missing relevant context.
```

**Context-budget reassurance (only if the harness must show a countdown):**
```text
You have ample context remaining. Do not stop, summarize, or suggest a new session on
account of context limits. Continue the work.
```

**Give the reason, not only the request:**
```text
I'm working on [the larger task] for [who it's for]. They need [what the output enables].
With that in mind: [request].
```

---

## Base template (lighter than the Opus 4.8 skeleton)

```markdown
# ROLE
[One descriptor sentence. Expertise area, not a persona costume.]

## GOAL
[The verifiable destination and the intent behind it. State scope, but don't over-script
the route — Fable 5 navigates ambiguity well when it knows WHY.]

## CONTEXT
[Only non-obvious, high-signal facts + the reason you're asking. Point to files/paths to
read rather than pasting. Long docs (20k+) ABOVE instructions; the actual query last.]

## CONSTRAINTS
[True invariants only. Pull <minimize_overengineering> when generating code. Resist the
urge to enumerate — one clear instruction steers the class.]

## STOP / VERIFY
[When is it done? Establish self-verification at an interval; fresh-context verifier
subagents beat self-critique on long runs. NEVER instruct it to reproduce its reasoning in
the response (reasoning_extraction refusal).]
```

---

## Gotchas (highest-signal)

- **Migrating an Opus-4.8 prompt = mostly deletion.** Over-prescription degrades Fable output. Strip enumerated rules, "CRITICAL/MUST/ALWAYS" anti-laziness language, and step-by-step scripts; keep the goal, intent, scope, and stop/verify.
- **Never tell it to show/explain its reasoning in the answer.** `reasoning_extraction` refusal → fallback. Read `thinking` blocks instead.
- **Longer turns are the norm.** If your harness blocks synchronously with a tight timeout, it will break before migrating anything else. Stream + async.
- **It fans out subagents readily** — opposite of Opus 4.8. You rarely need to push for delegation; you may need async orchestration so the orchestrator doesn't block.
- **Lower effort is genuinely viable.** Don't reflexively pin `xhigh` (2× the cost of Opus 4.8 already). Start `high`, drop to `medium` where evals hold.
- **No prefill, no sampling params, no disabling thinking** — all 400. Steer with prose + effort.
- **Send-to-user tool** for verbatim mid-run delivery: tool inputs are never summarized, so a `send_to_user` tool surfaces deliverables/progress intact without ending the turn.
- **Refusals are HTTP 200, not errors.** Handle `stop_reason: "refusal"`; configure fallback to `claude-opus-4-8` for security/bio-adjacent work (e.g. the offensive-* skills).
