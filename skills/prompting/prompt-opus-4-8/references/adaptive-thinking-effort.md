# Adaptive Thinking + Effort — API mechanics & steering

Source: platform.claude.com/docs — *Adaptive thinking*, *Effort*. Read when configuring the API directly or when the model thinks more/less often than you want.

---

## Adaptive thinking — the essentials

- On **Opus 4.8 and 4.7, adaptive is the ONLY thinking mode.** Thinking is **off** unless you explicitly set `thinking: {type: "adaptive"}`. Manual `thinking: {type:"enabled", budget_tokens:N}` → **400 error**.
- In adaptive mode the model decides *whether and how much* to think per request, based on complexity + the `effort` parameter. At `high` (default) it almost always thinks; at lower effort it may skip thinking on simple turns.
- **Adaptive auto-enables interleaved thinking** (reasoning between tool calls). No beta header. This is why adaptive is the recommended mode for agents/long-horizon loops — the model recalibrates per step.
- Validation is looser than manual mode: prior assistant turns don't need to start with a thinking block.

Minimal request:
```python
client.messages.create(
    model="claude-opus-4-8",
    max_tokens=64000,
    thinking={"type": "adaptive"},
    output_config={"effort": "xhigh"},
    messages=[...],
)
```

## The effort table

| Effort   | Behavior                                                                 | Use for |
|----------|--------------------------------------------------------------------------|---------|
| `max`    | Always thinks, no depth constraints. Can overthink; diminishing returns. | Genuinely frontier problems where evals show headroom above `xhigh`. |
| `xhigh`  | Always thinks deeply, extended exploration. (Opus 4.8 & 4.7 only.)       | **Default for coding & agentic work**; repeated tool calling, detailed/KB search. |
| `high`   | Almost always thinks. = omitting the param.                              | Default. Minimum for intelligence-sensitive work. |
| `medium` | Moderate thinking; may skip on very simple queries.                      | Cost-sensitive but non-trivial. |
| `low`    | Minimizes thinking; skips on simple tasks.                               | Short scoped tasks, subagents, classification, latency-critical. |

Notes:
- Effort affects **all tokens** — thinking, text, *and* tool calls. Lower effort → fewer/combined tool calls, terse confirmations, less preamble. Higher → more tool calls, plan-before-acting, detailed summaries.
- Effort is a **behavioral signal, not a hard budget.** On hard enough problems the model still thinks at `low`, just less.
- **Opus 4.8 respects effort strictly at the low end** — it scopes work to exactly what's asked. Under-thinking risk at `low`/`medium` on complex tasks → first lever is raise effort, then prompt.
- Default is `high` everywhere (API + Claude Code). Set `effort` explicitly to override.

## `max_tokens` vs effort

`max_tokens` is the **hard cap** on total output (thinking + text). `effort` is **soft guidance** on how much of it to spend thinking. Together = cost control. At `high`/`max`, watch for `stop_reason: "max_tokens"` — raise `max_tokens` or lower effort. At `xhigh`/`max`, start `max_tokens` at 64k.

## Steering thinking frequency by prompt

Triggering is promptable but wording-sensitive (large/complex system prompts make it think more often). Measure the effect on your workload before shipping.

Think **less**:
```text
Extended thinking adds latency and should only be used when it will meaningfully improve answer quality — typically for problems that require multi-step reasoning. When in doubt, respond directly.
```
Think **more** (system prompt):
```text
This task involves multi-step reasoning. Think carefully before responding.
```
Per-message steering (independent of system prompt, great for mixed conversations):
- Append to user turn → encourage: `Please think hard before responding.`
- Append to user turn → suppress: `Answer directly without deliberating.`

⚠️ Steering the model to think *less* can reduce quality on reasoning-heavy tasks. Prefer testing a lower **effort** level first.

## Thinking display — the silent 4.8 default change

`thinking.display` controls returned thinking content:
- `"summarized"` — summarized thinking text. Default on **4.6/Sonnet 4.6** and earlier 4.x.
- `"omitted"` — empty `thinking` field; only the encrypted `signature` is returned. **Default on Opus 4.8, 4.7, and Mythos.** Faster time-to-first-text when streaming (server skips streaming thinking tokens).

To read thinking for prompt-debugging on 4.8, opt in explicitly:
```python
thinking = {"type": "adaptive", "display": "summarized"}
```
You're billed for full thinking tokens regardless of display. Inspect `usage.output_tokens_details.thinking_tokens` for the reasoning spend.

## Multi-turn / tool-use round-tripping

- Pass thinking blocks back **unchanged** (the `signature` decrypts to reconstruct reasoning). Any text you put in a round-tripped omitted block's `thinking` field is ignored.
- Strictly required to send thinking blocks back only when using **tools with extended thinking**. Opus 4.5+/Sonnet 4.6+ keep prior thinking in context by default (billed as input); earlier Opus/Sonnet and all Haiku strip them. Configure via context editing.

## Prompt caching

Consecutive requests in the *same* thinking mode preserve cache breakpoints. **Switching** between `adaptive` and `enabled`/`disabled` breaks message cache breakpoints (system prompts + tool defs stay cached). Pick one mode and stay in it.

## Migration off `budget_tokens`

```python
# Before (Opus ≤4.6 / older)
thinking = {"type": "enabled", "budget_tokens": 32000}
# After (Opus 4.7 / 4.8)
thinking = {"type": "adaptive"}
output_config = {"effort": "high"}   # or max / xhigh / medium / low
```
If you're not using extended thinking, no change — omit `thinking` and it's off.

## Claude Code "ultracode"

Not an extra API effort level. ultracode = `xhigh` effort + standing permission to launch multi-agent workflows (granted via mid-conversation system messages). The five levels above are the complete API set.
