# GPT-5.5 Reference

## What GPT-5.5 Is

Outcome-optimized, not process-optimized. Finds the statistically cheapest path to your request. Will satisfy surface form while skipping depth unless you force verification.

**The 80% Problem**: Excels at first 80%. Last 20% requires explicit forcing. Without it, declares victory early.

**Reasoning tokens**: Expose them for complex analysis. Disable for simple transformations.

## Official OpenAI Guidance (May 2025)

Source: developers.openai.com/api/docs/guides/prompt-guidance?model=gpt-5.5

Key facts from OpenAI:
- **"Shorter, outcome-first prompts"** outperform verbose process-heavy ones
- **"Carrying over every instruction from an older prompt stack" degrades performance** — legacy prompts over-specified process because earlier models needed it; GPT-5.5 doesn't
- **Prescribe output structure, not thinking process** — "describe what good looks like" and let the model choose its path
- **ALWAYS/NEVER reserved for true invariants** — safety rules, required fields, forbidden actions. Softer framing for judgment calls
- **Separate personality from task** — personality = tone/empathy/warmth (short). Task = goals/criteria/constraints
- **Explicit stopping conditions** — tell the model when to stop searching, retrying, expanding
- **Don't paste context the model can read from files** — excess context = noise = worse shortcuts
- **`text.verbosity` parameter** — API default is `medium`; set `low` for concise output
- **Pre-mortem works** — "Assume design failed. List failure modes." forces confronting uncertainty

OpenAI template structure:
```
Role: [1-2 sentences]
# Personality — [tone, demeanor]
# Goal — [user-visible outcome]
# Success criteria — [what must be true before final answer]
# Constraints — [policy, safety, evidence limits]
# Output — [sections, length, tone]
# Stop rules — [when to retry, fallback, abstain]
```

Note: "add detail only where it changes behavior."

## Why Execution Prompts Fail

| Without | Result |
|---|---|
| Verification gates | Code compiles, misses edge cases |
| Design doc | Surface reorganization, same complexity |
| Anti-shortcut rules | Happy-path tests only |
| Stuck detection | Infinite loops on same approach |

**Rule**: Execution without design + verification = shortcuts.

## Reflection-Design-Execution Hierarchy

```
REFLECTION: "What is true?" (evidence, not opinion)
    ↓
DESIGN: "What should be?" (contracts, no code)
    ↓
EXECUTION: "Make it so." (bounded by design)
```

**Anti-pattern**: Skipping layers. Direct execution = shortcuts everywhere.

## Anti-Shortcut Tactics

1. **Show your work**: Force intermediate steps. Makes jumping to answer impossible.
2. **Pre-mortem**: Assume failure. List 5 failure modes before designing.
3. **Concrete over vague**: Every instruction must be verifiable.
4. **Self-criticism gate**: "What might be wrong? What did I assume?"
5. **Forced comparison**: If 2 ways exist, show both. Document rejected approach.
6. **Evidence or silence**: "I don't know" > speculation.
7. **Ratchet rule**: Existing working behavior must be preserved. Regressions block commits.

## 3 Verification Layers

### Prompt-Level (Model Self-Check)
Prevents 80% problems. Model verifies before delivering.

```
Before output, verify:
- [ ] All requirements addressed
- [ ] Edge cases listed
- [ ] No assumptions unverified
- [ ] Self-criticism written
```

### Test-Level (Automated)
Prevents 15% problems. Model generates tests, human runs them.

```
After implementation, produce:
- Unit tests: target case + 2 edge cases
- Integration test: full flow through pipeline
- Regression test: previously passing behavior still passes
```

### Human-Level (Manual Review)
Prevents 5% problems. Product judgment.

```
I will verify:
- Transcript review: does it sound like a real receptionist?
- Behavior: does it handle the edge case we discussed?
- No enum leaks, no generic fallbacks
```

**All 3 mandatory.** Prompt-level alone = false confidence.

## Loop Prevention

```
MAX ITERATIONS: [N]
PROGRESS METRIC: [how to measure improvement]
STUCK RULE: If no progress after [N] attempts, STOP
STRATEGY CHANGE: Each retry must use different approach
ESCALATION: After [N] failures, ask human
```

## Codex CLI Patterns

**Expand-Contract**: New stage alongside old → shadow comparison → migrate → delete old.

**Golden tests first**: Lock passing behavior before any change.

**Ratchet rule**: Passing tests can only grow. Regressions block commits.

## Scenarios

### Reflection
```
Stop. Read everything. Think.

You've [done X]. Do not [do Y] until complete.

## Evidence
[Concrete data]

## Required analysis
A. [Specific trace with line numbers]
B. [Specific comparison]
C. [Specific root cause]

## Nothing is sacred
Question everything. If [component] is wrong, say so with evidence.

## DON'T
- Don't propose fixes yet. Think first.
- Don't protect previous work. Be honest.
- Don't latch onto one observation.
```

### Design
```
Write design document for [system].

## Pre-mortem
Assume design failed. List 5 failure modes. How does design prevent each?

## Required sections
1. Current state: what works, what breaks (cite evidence)
2. Proposed state: contracts, interfaces, data structures
3. Verification: how to prove it works

## Rules
- No code. Contracts only.
- Cite file:line.
- OPEN QUESTION for unknowns.
```

### Execution
```
Implement [specific component] from [design doc].

## Scope
Implement ONLY: [files/functions]
Do NOT: [out of scope]

## Anti-shortcut
- Don't delegate to legacy code
- Show your work: document each file's purpose

## Verification gates
- [ ] Unit tests for [behavior]
- [ ] Shadow comparison: new vs old
- [ ] Golden tests pass
- [ ] npm run verify passes

## Stuck detection
If 3 attempts don't pass all gates, STOP.
Write: "Blocked: tried [X, Y, Z]. Root cause: [assessment]."
```
