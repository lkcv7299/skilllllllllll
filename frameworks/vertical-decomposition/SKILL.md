---
name: decomposing-verticals
description: Decomposes a forensic/autopsy report with N failures into M independent implementation verticals. Each vertical has target flows, file interference matrix, risk scoring, and batch execution order. Use when you have a quality report, bug analysis, or failure audit and need to convert it into executable agent prompts. Triggers on "decompose", "verticals", "break down failures", "create implementation plan from report", or after a forensic analysis is complete.
---

# Decomposing Verticals

Turn a failure report into independent, executable implementation units.

## Quick Start

```
Input:  Investigation report with root causes + evidence
Output: M vertical prompts + interference matrix + batch execution order
```

## When to Use

- After a QE/quality run identifies multiple failures
- After an investigation produces root causes with file:line evidence
- When you need to parallelize fixes across agents
- When a foundational change must land before dependent changes can begin

## Core Principle: File-Set Independence

A vertical is parallelizable if and only if its set of modified files has ZERO intersection with every other vertical's file set. Everything else — conceptual independence, domain separation, layer boundaries — is secondary to this mechanical check.

Source: AgenticFlict dataset (142K agent PRs) shows 27.67% conflict rate without file isolation, near-zero with it.

## Workflow

### Step 1: Read the report completely

Read every root cause. For each, extract:
- **Root cause ID** (RC1, RC2, etc.)
- **Files it touches** (the exact files that need modification)
- **Flows it affects** (which QE/test flows are explained by this RC)
- **Evidence** (file:line + flow:turn citations from the investigation)

### Step 2: Group by FILE, not by root cause

Root causes that touch the same file MUST be in the same vertical, even if they're conceptually different. This prevents merge conflicts.

```
WRONG: "RC1 = one vertical, RC2 = another" (root-cause-based, ignores file overlap)
RIGHT: "RC1 + RC5 both touch response-strategy.ts = same vertical" (file-based)
```

### Step 3: Build the interference matrix

| File | Verticals | Risk |
|------|-----------|------|
| response-strategy.ts | V1 only | LOW |
| response-act-plan.ts | V2 only | LOW |
| response-realizer.ts | V3 only | LOW |
| runtime-turn.ts | V0 only | LOW |

Files touched by 2+ verticals = HIGH risk. Either merge those verticals or extract the shared work into a foundation vertical.

### Step 4: Identify foundational verticals

If one vertical creates something that others depend on (new module, new type, new interface), it's **foundational** and must run FIRST as a prep commit. Others branch from its output.

```
V0 (FOUNDATION): Creates ResponseSituation type + builder
  → V1, V2, V3 all import from V0's output
  → V0 runs alone in Batch 1
  → V1, V2, V3 run in parallel in Batch 2
```

### Step 5: Score risk per vertical

| Axis | 1 (safe) | 5 (risky) |
|------|----------|-----------|
| File spread | 1-2 files | 5+ files |
| Shared surface | 0 files shared | 3+ shared |
| Behavioral complexity | Pure additions | Control flow / state machine rewrite |
| Test coverage | >80% of touched code | <20% of touched code |

**Risk = max(axes), not average.** A vertical touching 2 files but rewriting a state machine with 10% coverage is HIGH risk.

### Step 6: Order batches

1. **Foundation verticals first** — prep commits that others depend on
2. **Independent verticals in parallel** — zero file intersection, 2-4 agents max (sweet spot per Osmani's research)
3. **Dependent verticals after their dependencies** — shared files run sequential

### Step 7: Write vertical prompts

Use the gpt55-prompting skill template. Each vertical prompt must have:
- Role, Goal, Evidence (point to files), Success criteria, Constraints, Output, Verify, Stop rules
- The investigation document as reference (the agent reads it, don't paste it)
- Which flows this vertical is expected to affect (with honest uncertainty)
- File scope: list which files this vertical is expected to modify. This is guidance for focus, not enforcement — use worktrees or separate branches for actual isolation

### Step 8: Audit after each batch

A separate agent or human must verify each vertical's output before merging. The same model that wrote the code cannot reliably review it.

## Calibration Rules

- **Never predict 100% flip rate.** Use ranges: "likely 3-5 of 8 flows."
- **Anchor predictions to history.** If previous batch predicted 47 and got 10 (21% hit rate), calibrate.
- **Budget for regressions.** If history shows 50% regression rate, account for it.
- **BETO/NLU gaps are irreducible.** Mark explicitly. Code adds damage control, not root fix.

## Anti-Patterns

- Grouping by root cause without checking file overlap
- Declaring verticals "independent" without the interference matrix
- 6+ parallel agents (merge chaos exceeds throughput gains)
- "Don't touch X" as the only file guard (instructions aren't enforcement — only file isolation prevents conflict)
- Batching "related" fixes into one fat vertical (each vertical = one testable outcome)
- Skipping the audit step between batches
- Mixing foundational work with dependent work in the same batch

## Sources

- AgenticFlict dataset: 142K agent PRs, 27.67% conflict without isolation (arxiv.org/html/2604.03551)
- Code Agent Orchestra — Addy Osmani: 3 focused agents > 1 generalist 3x longer, 2-4 sweet spot
- Tracer Bullets — Pragmatic Programmer: highest-risk vertical first to learn fast
- Vertical Slice Architecture — Jimmy Bogard: scope by outcome, not by layer
