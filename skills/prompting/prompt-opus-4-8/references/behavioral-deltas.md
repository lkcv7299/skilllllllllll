# Opus 4.8 — Behavioral Deltas (what changed, and how to prompt for it)

Source: platform.claude.com/docs — *Prompting best practices* (Prompting Claude Opus 4.8 section), *What's new in Claude Opus 4.8*. Read this before re-using any prompt tuned for Opus 4.6/4.7, or whenever the model surprises you.

Opus 4.8 performs well out of the box on existing 4.7 prompts. The items below are the behaviors that *most often need tuning*. None are bugs — they are deliberate shifts toward literalism, calibration, and faithful instruction-following.

---

## 1. Response length is auto-calibrated, not fixed

The model calibrates verbosity to how complex it judges the task to be: short on simple lookups, much longer on open-ended analysis. If your product depends on a fixed style/length, tune the prompt.

Decrease verbosity:
```text
Provide concise, focused responses. Skip non-essential context, and keep examples minimal.
```
Prefer **positive examples** of the target concision over "don't be verbose" negatives — they steer more reliably.

## 2. Effort is respected strictly, and it matters more than on any prior Opus

- `xhigh` = best for most coding/agentic work (start here).
- `high` = minimum for intelligence-sensitive work (the default).
- `medium`/`low` = the model scopes to *exactly* what was asked; good for latency/cost, but risk of under-thinking on moderately complex tasks.
- `max` = can deliver gains but shows diminishing returns and can overthink.

**If reasoning looks shallow on a hard problem, raise effort — don't prompt around it.** If you must stay at `low` for latency, add: `This task involves multi-step reasoning. Think carefully through the problem before responding.` "Effort is likely to be more important for this model than for any prior Opus, so experiment with it actively when you upgrade."

At `xhigh`/`max`, set a large `max_tokens` (start 64k) so the model has room to think + act across subagents/tool calls.

## 3. Tool use favors reasoning over calling tools

The model tends to reason rather than call a tool — usually better, but if you want more tool use (e.g. web search, agentic search/coding), **raise effort** (`high`/`xhigh` show substantially more tool usage) and/or explicitly describe *when and how* to use the tool. "If you find the model is not using your web search tools, clearly describe why and how it should."

## 4. Better, self-generated progress updates

Opus 4.8 gives more regular, higher-quality user-facing updates across long agentic traces. **Remove old scaffolding** like "After every 3 tool calls, summarize progress." If the updates aren't calibrated to your product, describe what they should look like and give an example.

## 5. More literal instruction following (the master quirk)

"It interprets prompts literally and explicitly, particularly at lower effort levels. It does not silently generalize an instruction from one item to another, and it does not infer requests you didn't make." Upside: precision, less thrash, better for tuned API pipelines and structured extraction.

To apply something broadly, state the scope: `Apply this formatting to every section, not just the first one.`

## 6. Tone shift toward direct/opinionated

Prose trends direct and opinionated, with minimal validation-forward phrasing and sparing emoji. If your product needs a warmer voice:
```text
Use a warm, collaborative tone. Acknowledge the user's framing before answering.
```

## 7. Fewer subagents by default

Opus 4.8 spawns fewer subagents than 4.6/4.7. Steerable — authorize fan-out explicitly:
```text
Do not spawn a subagent for work you can complete directly in a single response (e.g. refactoring a function you can already see).
Spawn multiple subagents in the same turn when fanning out across items or reading multiple files.
```

## 8. Strong, persistent design "house style"

Default look: warm cream/off-white (~`#F4F1EA`), serif display (Georgia/Fraunces/Playfair), italic word-accents, terracotta/amber accent. Great for editorial/hospitality/portfolio; wrong for dashboards/dev-tools/fintech/healthcare/enterprise. Appears in slides too.

The default is **persistent** — generic instructions ("don't use cream", "make it clean") just shift it to *another* fixed palette. Two reliable fixes:
1. **Specify a concrete alternative** (exact hex palette, typeface, radius, spacing) — it follows specs precisely.
2. **Have it propose 4 distinct directions first** (bg hex / accent hex / typeface + one-line rationale), let the user pick, then build only that. This is also how you get design *variety* now that `temperature` is unavailable.

Opus 4.8 needs *less* anti-"AI slop" prompting than older models; a short `<frontend_aesthetics>` snippet (see snippet library) is enough.

## 9. Interactive vs autonomous coding token use

In interactive (multi-user-turn) coding it reasons more after user turns → more tokens, but better long-horizon coherence. To maximize performance *and* efficiency: use `xhigh`/`high`, add an auto/autonomous mode, reduce required human interactions, and **fully specify task + intent + constraints in the first user turn**. Ambiguous prompts dribbled across many turns reduce efficiency and sometimes performance.

## 10. The code-review-harness recall trap (high-value, non-obvious)

Opus 4.8 is better at finding bugs (higher recall *and* precision internally). But a harness tuned for an older model may show **lower measured recall** — because when your prompt says "only high-severity", "be conservative", "don't nitpick", 4.8 *faithfully* drops findings below your stated bar after investigating them. Precision rises, measured recall falls — not a capability regression.

Fix — separate finding from filtering:
```text
Report every issue you find, including ones you are uncertain about or consider low-severity. Do not filter for importance or confidence at this stage - a separate verification step will do that. Your goal here is coverage: it is better to surface a finding that later gets filtered out than to silently drop a real bug. For each finding, include your confidence level and an estimated severity so a downstream filter can rank them.
```
If you self-filter in one pass, be concrete about the bar ("report bugs that could cause incorrect behavior, a test failure, or a misleading result; only omit pure style/naming nits") rather than qualitative words like "important". Iterate on a subset of evals to confirm recall/F1 gains.

## 11. Computer use

Works up to 2576px / 3.75MP. 1080p balances performance/cost; 720p or 1366×768 for cost-sensitive workloads. Tune effort here too.

---

## API-level deltas inherited / introduced (see also adaptive-thinking-effort.md)

- **No sampling params:** `temperature`/`top_p`/`top_k` non-default → 400. Steer with prose + effort.
- **Adaptive thinking only:** `thinking:{type:"enabled",budget_tokens}` → 400. Use `{type:"adaptive"}` + effort.
- **Effort default = `high`** on all surfaces incl. Claude Code.
- **1M context** by default (API/Bedrock/Vertex; 200k on Microsoft Foundry), **128k** max output.
- **Mid-conversation system messages:** `role:"system"` allowed right after a user turn — append updated instructions late in a long run without restating the full system prompt (preserves cache, cuts input cost on agentic loops).
- **Refusal stop details:** `stop_details` categorizes refusals — route the user to the right next step.
- **Fast mode:** `speed:"fast"` research preview — up to 2.5x output tok/s at premium price (same model).
- **Lower cache minimum:** 1,024-token minimum cacheable prompt (down from 4.7).
- **Capability targets vs 4.7:** better long-horizon agentic coding (fewer compactions, better compaction recovery), better effort calibration per level, better tool triggering (fewer skipped required tool calls).
