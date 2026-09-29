# AUA — Ask User for Approval

**Status:** Shared convention. This file is the canonical definition; every
repo carries an identical copy, and each repo's `CLAUDE.md` points here so any
Claude session in any project uses the same approval format.

## The rule

Any reply that **offers to do work** — anything a person would answer with
"yes, do that" / "no" / "let's talk about it first" — must be presented as a
**selectable approval prompt** (an `AskUserQuestion`), never as prose that asks
the reader to "say the word" or "let me know." If you are offering work, offer
it as an AUA. If you are not offering work, no AUA is needed.

## The format

Present the decision as an `AskUserQuestion` whose body carries two labelled
sections:

- **YOUR REQUEST** — what the user asked for, in one or two lines.
- **PROPOSED IMPLEMENTATION** — what you propose to do about it, concretely.

Then exactly three **numbered** options, in this fixed order:

1. **(Recommended)** — your recommended course of action. It is option `1`, and
   the word *Recommended* appears in its label so the user can confirm the
   recommendation at a glance.
2. **Discuss** — do not execute yet; talk it through or refine the scope first.
3. **Neutral / decline** — the low-commitment out: don't do it now, keep things
   as they are, or capture-only.

The user selects by number. Never bury an offer of work in prose to dodge the
prompt; either raise it as an AUA or drop the offer phrasing.

## Why

Offers made in prose get lost, and "they told me to proceed generally" is not
the same as "they approved this specific action" — especially for
outward-facing or hard-to-reverse steps (a push, a send, a delete). The AUA
makes every unit of work an explicit, on-the-record yes/no, in one consistent
shape across every project.

## Origin

Distilled from the enforced AUA rule recorded in
`Jarvis-U/NOTES/Session-JarvisInstallVerify-fd9121c4.md`.
