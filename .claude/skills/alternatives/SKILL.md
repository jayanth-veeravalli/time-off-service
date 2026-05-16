---
name: alternatives
description: Use this skill whenever producing an alternatives analysis document or capturing the approaches considered for an architectural decision. Triggers include any mention of "alternatives", "alternatives considered", "design alternatives", "approaches considered", "ADR", or requests to document the design options that were weighed before a decision was made. Use as a companion to a TRD — the TRD captures the chosen design; this document captures what else was on the table and why it didn't win.
---

# Alternatives Considered Format

This document captures the full design analysis that led to the decisions recorded in the TRD. It exists because real design work involves multiple options, pressure-testing, and tradeoffs — and that reasoning is too valuable to lose, but too detailed to live inside the TRD itself.

The TRD links to this document. Each major decision in `TRD.md` Section 6 (Decision Summary) points to a corresponding section here.

## Output location

Write to `docs/ALTERNATIVES.md` unless the user specifies otherwise.

## Core principles

- **Be honest about what you considered.** If an approach was dismissed without analysis, say so — don't pretend you weighed it.
- **Cons are not weakness signals; missing cons are.** Every approach has tradeoffs. An approach with only pros means you didn't think hard enough.
- **Pressure-test outcomes matter.** Note where an approach failed under questioning, even if you ultimately chose it.
- **Link back to challenges.** Approaches are evaluated against the challenges in `TRD.md` Section 3. Reference them by ID (C-1, C-2, ...).

## Document structure

### Header

Start with:
> Companion to [`docs/TRD.md`](./TRD.md). Each decision below corresponds to an entry in TRD Section 6.

### One subsection per major decision

For each architectural decision that had real alternatives (data model, consistency model, sync strategy, conflict resolution, async architecture, external integration pattern, etc.), produce a section with the structure below. Use H2 headings (`##`) for each decision so they're easy to link to.

#### Structure for each decision

**## Decision N: [Short name of the decision]**

**Context.** 2-3 sentences on what problem this decision addresses and which challenges (C-N from the TRD) it relates to.

**Approaches considered.** For each approach (typically 2-3, sometimes more):

- **Name.** A short, memorable name (e.g., "Synchronous write-through", "Outbox + reconciliation worker", "Event sourcing with snapshots").
- **Description.** One paragraph on how the approach works.
- **Pros.** What this approach is genuinely good at.
- **Cons.** What it costs, what it gives up, what gets harder.
- **Pressure-test notes.** Observations from stress-testing the approach: what failure modes it handles well, where it breaks down, unanswered questions that surfaced.

**Comparison.** A short matrix (markdown table) comparing approaches against the relevant challenges and requirements. Rows are challenges/requirements; columns are approaches; cells show how each approach scores.

**Decision.** The approach chosen, with the reasoning. Tie it explicitly back to which challenges drove the choice. Name the weaknesses the chosen approach still has — every approach has them, and acknowledging them prevents surprises later.

### Example structure

```markdown
## Decision N: <Short name of the decision>

**Context.** 2-3 sentences on what problem this decision addresses and which challenges (C-N from the TRD) it relates to.

**Approaches considered.**

### Approach A: <Name>
**Description.** One paragraph on how this approach works.

**Pros.**
- <Strength>
- <Strength>

**Cons.**
- <Tradeoff or cost>
- <Tradeoff or cost>

**Pressure-test notes.** Observations from stress-testing: which failure modes it handles well, where it breaks down, unanswered questions that surfaced.

### Approach B: <Name>
**Description.** ...

(Repeat for each approach considered.)

**Comparison.**

| Concern         | Approach A | Approach B | Approach C |
|-----------------|------------|------------|------------|
| <Challenge C-1> | <score>    | <score>    | <score>    |
| <Challenge C-2> | <score>    | <score>    | <score>    |
| <Other concern> | <score>    | <score>    | <score>    |

**Decision.** The approach chosen, with reasoning tied explicitly to the challenges and requirements that drove the choice.

**Remaining weaknesses.** Honest acknowledgment of what the chosen approach still gives up or doesn't handle well. Every approach has some — naming them prevents surprises later.
```

## Common failure modes to avoid

- **Straw-man alternatives.** Don't list options you never seriously considered just to make the chosen one look better.
- **Asymmetric analysis.** All approaches deserve the same depth of pros, cons, and pressure-testing. Lopsided analysis signals bias.
- **Missing comparison.** The matrix is what makes a decision defensible. Without it, "we chose B because it felt right" is what you've written.
- **Decisions without weaknesses.** If the chosen approach has no acknowledged downsides, you haven't stress-tested it enough.
- **Cosmetic alternatives.** Don't include options that differ only in surface details. Each approach should make meaningfully different tradeoffs.
