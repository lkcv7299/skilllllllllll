---
name: gpt55-prompting
description: Craft professional, outcome-first prompts optimized for GPT-5.5 and Codex CLI. Prevents agent loops, implements stopping conditions, and structures discourse for long-horizon tasks. Use when prompting GPT-5.5, Codex CLI, building autonomous agents, or optimizing prompts for latest OpenAI models.
---

# GPT-5.5 Prompt Engineering

## Official Guidance (source: developers.openai.com, May 2025)

GPT-5.5 works best with **shorter, outcome-first prompts**. Describe what good looks like, what constraints matter, what evidence is available — let the model choose its path.

Key behavioral facts from OpenAI:
- **Outcome-optimized**: finds the statistically cheapest path to your request. Satisfies surface form while skipping depth unless you force verification.
- **The 80% Problem**: excels at first 80%. Last 20% requires explicit forcing via success criteria and verification gates.
- **Over-specifying process degrades performance**: legacy prompts that prescribe step-by-step how to think "add noise, narrow the model's search space, or lead to overly mechanical answers."
- **Reserve ALWAYS/NEVER for true invariants**: safety rules, required output fields, actions that must never happen. Use softer framing for judgment calls.
- **Separate personality from task**: personality = tone/warmth/empathy. Task = goals/criteria/constraints. Keep both short.
- **Explicit stopping conditions prevent loops**: add decision rules for when to stop searching, retrying, or expanding scope.
- **Don't paste what the model can read from files**: excess context = noise = worse shortcuts. Point to files, don't paste content.

## Base Template

```markdown
# Role
[1-2 sentences. Expertise area, not "You are X." Descriptor, not persona.]

## Goal
[Specific, verifiable outcome. Not direction. Describe the destination, not every step.]

## Evidence
[What data exists and WHERE to find it. Don't paste content — point to files/paths.]

## What was already tried
[Concise table: what was done, what happened. Prevents re-discovery.]

## Success criteria
[Exact criteria for "done." If unclear, GPT-5.5 declares victory at 80%.]
[Every affected case must be accounted for — no sampling, no cherry-picking.]

## Constraints
[True invariants only — things that must NEVER happen (safety, data integrity).]
[For judgment calls, use softer framing: "prefer X" not "NEVER do Y".]

## Output
[Required sections in the deliverable. Prescribe WHAT, not HOW to think.]

## Verify
[ONE section. Before finalizing, check: correctness, grounding, formatting.]
[Include what the human will verify separately.]

## Stop rules
[When to stop searching/retrying/expanding scope.]
[Stuck detection: if N attempts don't improve, STOP and report what was tried.]
```

### What changed from previous version
- **3 verification layers → 1**: the old template split verification into prompt/test/human. This added noise and redundant checks. The GPT-5.5 guidance says one verification loop before finalizing. Human checks are stated but don't need their own section.
- **"Don't" → "Constraints"**: "Don't" encouraged writing 5-6 prohibitions that were judgment calls, not invariants. "Constraints" limits to true invariants per the guidance.
- **"Anti-Shortcuts" removed as a mandatory section**: predicting failure modes is useful for Design prompts (as Pre-mortem) but not for every prompt. Over-specifying what NOT to do is itself over-specification.
- **"Context" → "Evidence"**: renamed to emphasize pointing to data sources, not pasting content.
- **"Never send Execution without Design doc" removed**: too rigid. Sometimes the investigation produces enough clarity to execute directly.

## Prompt Types

| Type | Use When | Never For |
|---|---|---|
| **Reflection** | After work, before next step | Jumping to fixes |
| **Investigation** | Unknown root cause | Patching symptoms |
| **Outcome-Based** | Behavioral/architectural fix where HOW is uncertain | Mechanical fixes |

For Investigation and Outcome-Based, add a **Pre-mortem**: "Assume your proposal fails. List N failure modes."

## Outcome-Based Prompts (proven S14)

For complex behavioral fixes, describe PROBLEMS + DESIRED OUTCOMES, not code changes:

```markdown
## Each pattern includes:
1. Real conversation/behavior (what happened, what SHOULD happen)
2. "Why this matters" — from the user's perspective

## Success criteria are OUTCOMES:
- "A correction does NOT cause abort" (not "add guard X with conditions Y")
- Every affected case must be accounted for individually

## Design philosophy:
- The agent decides the implementation — describe problems, not solutions
- Document why the chosen approach is better than alternatives
```

**Why**: Prescribing specific code changes (V1-V4) produced 3 prompts that partially reverted each other (-7 judge). Describing outcomes (VD) produced elegant centralized solutions + discovered 4 sibling patterns. The agent found better implementations than we would have prescribed.

**Key principle**: Don't bias the investigation. Don't presuppose the root cause. Don't limit the solution space. Give evidence, describe symptoms, let the agent figure it out.

## Common Biases to Avoid

These are patterns that FEEL like good prompt engineering but actually degrade results:

| Bias | Example | Why it's bad |
|---|---|---|
| **Presupposing root cause** | "signals get lost between frame and realizer" | Narrows investigation before it starts |
| **Artificial limits** | "max 5 files", "under 500 lines" | Prevents the right solution if it's bigger |
| **Prescribing process** | "start by tracing the data flow" | Over-specifies HOW instead of WHAT |
| **Small sample mandate** | "pick 3 flows" | Sampling bias — let the agent decide coverage |
| **Vague scavenger hunts** | "find the S12 artifacts" | Either give the exact path or remove the reference |
| **Prescribing architecture** | "state implies capability" | Your principle might be wrong — let the agent form their own |

## Loop Prevention

```
MAX ATTEMPTS: [N]
STUCK RULE: If no progress after [N] tries, STOP. Report: "Tried X, Y, Z. Blocked: [why]."
STRATEGY CHANGE: Each retry must use different approach.
```

## Pre-mortem (for Investigation and Outcome-Based prompts)

```
Assume your analysis fails. List N ways it could fail and how you prevent each.
```

See [EXAMPLES.md](EXAMPLES.md) for real prompts that worked vs failed.
See [REFERENCE.md](REFERENCE.md) for GPT-5.5 behavior patterns and scenario templates.
