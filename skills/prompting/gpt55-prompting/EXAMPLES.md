# Real Prompts: What Worked vs What Failed

From 7 Codex CLI sessions, 100+ commits, 68 test flows.

## WORKED: Reflection Prompt

```markdown
# Stop. Read everything. Think. Write what you see.

You've made 100 changes over ~22 hours. Do not make another commit until you've completed this reflection.

## Evidence
18 full QE runs. Judge scores: 0,0,0,0,0,0,15,15,13,21,22,30,26,28,31,28,30,28
You oscillated 26-31 for last 6 runs despite 40+ commits.

## Required analysis
A. Trace 3 flows end-to-end through pipeline (line numbers)
B. Answer why score oscillates (name the coupling)
C. Write what you'd do if you could start over

## Nothing is sacred
Question everything. If BETO is wrong, say so. If your own commits were wasted, say that.

## DON'T
- Don't propose fixes yet. Think first.
- Don't protect previous work. Be honest.
- Don't latch onto one observation.
```

**Why it worked**: "Stop. Think." breaks execution mode. "Nothing is sacred" gives permission to criticize. Specific trace requirements prevent shallow analysis.

## WORKED: Design Prompt

```markdown
# Write design document for [system] v4.

## Pre-mortem
Assume design failed. List 5 failure modes. How does design prevent each?

## Required sections
1. Current pipeline map (file:line, what works, what breaks)
2. Proposed pipeline map (contracts, interfaces, verification)
3. Frame problem (missing fields, transcript evidence for each)
4. [Component] specification
5. Model retrain scope
6. Response generation design
7. State machine promotion plan
8. Router cleanup
9. QE stabilization
10. Flow-by-flow accountability table

## Rules
- No code. Contracts only.
- Cite file:line.
- OPEN QUESTION for unknowns.
- Every sentence carries information.
```

**Why it worked**: Pre-mortem forces confronting failure modes. "No code" prevents premature implementation. 10 specific sections prevent omissions.

## FAILED: Execution Prompt (No Gates)

```markdown
# Implement DESIGN-RUNTIME-V4

Follow the design. Phases: 0-5. Start with Phase 0.

## Rules
- Golden tests first
- One phase at a time
- Shadow before cutover
```

**Why it failed**: Too many phases, too much freedom. "If you discover something wrong, update the design" became license to ignore design. No stuck detection. No verification per phase.

**Result**: TurnPlan built but stayed shadow. State machines built but delegated to legacy. Score didn't move.

## CORRECTED: Execution Prompt (With Gates)

```markdown
# Implement [component] from [design doc]

## Scope
Implement ONLY: [specific files]
Do NOT: [out of scope]

## Anti-shortcut
- Don't delegate to legacy code
- Show your work: document each file

## Verification gates (ALL must pass)
- [ ] Unit tests for [behavior]
- [ ] Shadow comparison: new vs old
- [ ] Zero unsafe divergence
- [ ] Golden tests pass
- [ ] npm run verify passes

## Stuck detection
If 3 attempts don't pass all gates, STOP.
Write: "Blocked: tried [X,Y,Z]. Root cause: [assessment]."

## Done criteria
1. All gates pass
2. Design doc updated if deviated
3. Changelog entry with Problem/Approach/Fix/Tests/Verification
```

**What changed**: Specific scope (not "implement everything"). Explicit gates with checkboxes. Stuck detection. Done criteria.

## WORKED: Outcome-Based Execution (Vertical D, S14)

```markdown
# Goal
Fix 6 broken conversation patterns. Each documented with REAL conversations
(what user said, what Sofia did, what SHOULD have happened).
You decide the best implementation.

## Design philosophy
Elegance over patches. If 2+ patterns share a root cause, fix it ONCE.
The best fix is the smallest number of changes that resolves the most patterns.
Document why your approach is elegant and what alternatives you rejected.

## Mandatory exploration — BEFORE implementing
Read ALL transitions in the relevant files. List every guard/transition
that could cause the SAME class of problem. Fix siblings if in scope.

## Each pattern includes:
- Real conversation transcript (user/BETO/Sofia/Should)
- "Why this matters" — argued from user experience
- "Why it happens" — observed cause, not prescribed fix

## Success criteria are OUTCOMES:
- "A correction does NOT cause abort" (not "add guard X")
- "Sofia never repeats the same response 2+ times" (not "add loop counter")
```

**Why it worked**: Agent found elegant centralized solutions instead of 6 patches. Discovered 4 sibling patterns we missed. Documented approach vs alternatives in changelog. Tests verified outcomes through public interface. Result: +284/-14 lines, 944 tests, 7/13 QE pass.

**Key patterns that made this work**:
1. **Real conversations as evidence** — not categories, not numbers, not forensic classifications. The actual words the user said and what Sofia answered wrong.
2. **"Why this matters" per pattern** — forces the agent to understand the user's experience, not just the code.
3. **"You decide the implementation"** — describing problems + desired outcomes, not specific code changes. The agent chose `hasContinuingTransactionalContent` as a generalizable guard — we wouldn't have prescribed that.
4. **Mandatory exploration** — reading ALL code before implementing prevented blind spots. Agent found 4 siblings we didn't know about.
5. **Elegance instruction** — "smallest number of changes that resolves the most patterns" produced structural changes, not if-block patches.
6. **Changelog must explain WHY** — "what alternatives you rejected" forces the agent to argue its approach.

**What to avoid**: Previous prompts (V1-V4) prescribed specific guard conditions and code changes. Result: 3 of them partially reverted each other (-7 judge). Over-specifying the HOW prevents the agent from finding better solutions.

## The Pattern

```
REFLECTION (evidence) → DESIGN (contracts) → EXECUTION (with gates)
```

**Shortcut**: Skipping to Execution. **Result**: Code compiles, doesn't solve problem.

**80% Problem**: GPT-5.5 gives 80% for free. Last 20% requires forcing via gates.
