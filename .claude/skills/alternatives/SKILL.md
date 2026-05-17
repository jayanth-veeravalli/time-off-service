---
name: alternatives
description: Use this skill whenever producing an Architecture Decision Record (ADR) or alternatives analysis document. Triggers include any mention of "ADR", "alternatives", "alternatives considered", "design alternatives", "approaches considered", or requests to document the design options that were weighed before a decision was made. Use as a companion to a TRD — the TRD captures the chosen design; this document captures the problems that shaped it, what else was on the table, and why it didn't win.
---

# Architecture Decision Record (ADR) Format

This document captures the problem space, the approaches considered, and the rationale behind the chosen solution. It exists because real design work involves pressure-testing options and weighing tradeoffs — reasoning that is too valuable to lose but too detailed for the TRD itself.

The TRD links to this document. The TRD's Proposed Solution section references ADR.md for the decision rationale behind major choices.

## Output location

Write to `docs/ADR.md` unless the user specifies otherwise.

## Core principles

- **Problems before solutions.** The first job of this document is to establish *why* the design was hard. State the properties of the problem that constrained the solution space before presenting any approach.
- **Assumptions are explicit.** Any assumption that changes the tradeoffs (availability SLA, rate limiting, scale target) must be named. If an assumption is violated in production, the decision needs revisiting.
- **Be honest about what you considered.** If an approach was dismissed without analysis, say so — don't pretend you weighed it.
- **Cons are not weakness signals; missing cons are.** Every approach has tradeoffs. An approach with only pros means you didn't think hard enough.
- **Remaining weaknesses are mandatory.** The chosen approach has downsides. Name them. Silence here causes surprises later.

## Document structure

### Header

```markdown
# ADR: <Service or Feature Name> — Architecture Decisions

> <One-sentence summary of what this ADR covers and why it exists.>
>
> Related: [TRD](./TRD.md) · [Test Plan](./TEST-PLAN.md)
```

### Status

```markdown
## Status

PENDING REVIEW | ACCEPTED | SUPERSEDED BY <link>
```

### Overview

2-3 sentences on what the TRD is building and why the design choices in this ADR matter. Link to [Overview](./TRD.md#1-overview) and [Goals](./TRD.md#2-goals) in the TRD rather than restating them.

### Problems That Shape the Solution

Enumerate the properties of the problem that constrained the solution space. For each:
- **Named property.** One sentence stating the constraint or tension.
- A clarifying sentence on *why* this property makes a naive solution fail.

End with a "What matters most to the caller" statement — the value that must be preserved above all else in the design.

#### Assumptions subsection

List the assumptions the design depends on. Number them. For each assumption that, if violated, would change the chosen approach, note what the fallback would be.

### Approaches Considered

One H3 subsection per approach. Use named approaches, not "Option A/B". Each approach section contains:

- **Description.** One paragraph on how it works end-to-end.
- **Pros.** What it is genuinely good at.
- **Cons.** What it costs or gives up.

Separate approaches with `---`.

### Comparison

A markdown table comparing approaches against the concerns that differentiate them. Rows are concerns (accuracy, failure modes, complexity, UX, etc.); columns are approaches. Column headers should link to the approach's section anchor. Every cell should be a short phrase, not a sentence.

### Decision

- State the chosen approach with a link to its section.
- Link to the [Proposed Solution](./TRD.md#5-proposed-solution) in the TRD for how the decision is reflected in the implementation.
- 2-3 sentences of rationale: why this approach over the others, tied explicitly to the problems stated above.
- A **"Why this approach?"** bullet list for any reasoning that didn't fit cleanly in the prose.
- **Remaining weaknesses.** Bullet list of acknowledged downsides. Every chosen approach has some.

## Common failure modes to avoid

- **Straw-man alternatives.** Don't list options you never seriously considered just to make the chosen one look better.
- **Asymmetric analysis.** All approaches deserve the same depth of pros and cons. Lopsided analysis signals bias.
- **Missing comparison table.** The table is what makes the decision defensible at a glance. Without it, "we chose B because it felt right" is what you've written.
- **Decisions without weaknesses.** If the chosen approach has no acknowledged downsides, you haven't stress-tested it enough.
- **Assumptions buried in prose.** If an assumption changes the tradeoffs, it must appear in the Assumptions section — not hidden in an approach description.
- **Cosmetic alternatives.** Each approach must make meaningfully different tradeoffs. Approaches that differ only in surface details are one approach.
