# Opus 4.8 Prompt / Sub-agent Brief — Fill-in Template

Copy this, fill the brackets, delete what you don't need. Decide the API knobs (top block) BEFORE writing prose. Delete any quirk-snippet you didn't pull from `references/snippet-library.md`.

---

```
# === API KNOBS (decide first; Law 1) ===
# model:        claude-opus-4-8
# thinking:     {type: "adaptive"}          # only mode on 4.8; off if omitted
# effort:       [xhigh | high | medium | low | max]   # xhigh=coding/agentic, high=min for hard work
# max_tokens:   [64000 at xhigh/max; smaller otherwise]
# (no temperature/top_p/top_k — 400 on 4.8)
# In Claude Code you set effort via the menu, not the API; the prose below still applies.

# ROLE
[One descriptor sentence — expertise area, not a persona costume.]

## GOAL
[The verifiable end state. What does "done and correct" look like?
 State SCOPE EXPLICITLY — 4.8 will not widen or generalize it for you.
 If you want above-and-beyond, say so ("Go beyond the basics; include as many relevant features as possible").]

## CONTEXT
[High-signal, non-obvious facts ONLY. Don't restate what the model knows.
 Point to files/paths it can read (just-in-time) instead of pasting them.
 Wrap distinct inputs in XML tags: <spec>…</spec>, <logs>…</logs>.
 Long docs (20k+ tokens) go ABOVE this line; the actual ask goes at the END.]

## CONSTRAINTS / DON'T
[True invariants → ALWAYS/NEVER. Judgment calls → softer phrasing.
 Don't scream CRITICAL/MUST — 4.8 overtriggers on it. Plain "Use X when…" is enough.
 Drop in only the needed snippets:
   - <minimize_overengineering> if generating code
   - anti-hardcoding block if there are tests
   - autonomy/safety block if it can touch shared/irreversible systems
   - subagent guidance if you want (or want to limit) fan-out
   - parallel-tool-calls block if it reads/searches many things]

## STOP CONDITIONS
[Define DONE precisely. When to stop searching / retrying / expanding scope.
 What to do when BLOCKED (ask vs. proceed with stated assumption).
 What to do when UNCERTAIN.
 For long-horizon: persistence snippet so it doesn't quit early near the context limit.]

## VERIFY
[Concrete self-check before finishing:
 "Run the tests in X and confirm green."
 "Re-read every file you claim you changed."
 "Verify the answer against [criteria]."
 For code review: split finding (coverage) from filtering — see the recall-trap snippet.]
```

---

## Pre-flight checklist (before you ship the prompt)

- [ ] Effort chosen from task class — not left implicit.
- [ ] `max_tokens` sized for the effort level (64k at xhigh/max).
- [ ] Scope stated explicitly (no reliance on the model generalizing).
- [ ] No carried-over CRITICAL/MUST/"if in doubt use X" anti-laziness language.
- [ ] No "think step by step" CoT scaffolding (adaptive thinking handles it).
- [ ] No prefill of the final assistant turn (400 on 4.8).
- [ ] Files pointed to, not pasted; long docs at top, query at bottom.
- [ ] STOP and VERIFY sections present (prevent premature "done" + catch errors).
- [ ] Only the quirk-snippets this task needs — nothing extra.
- [ ] Golden-rule check: a colleague with no context could follow it without confusion.
```
