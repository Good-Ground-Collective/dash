# 11 · Objectives

## Why now
The design direction (#2) made objectives the centre of the home screen: active objectives, sorted by priority and then due date, each with progress, a latest update, its crew and what's next. None of the other discussions cover how objectives work.

## What we know (from the planning notes)
- They're personal objectives, **nestable**, and **tieable to task trackers** (GitHub issues and Projects first, Jira later).
- The home screen shows, for each objective:
  - priority (P1–P3)
  - due date
  - progress (done of total)
  - a one-line latest update
  - the agents working on it
  - the next item
- A plain-language briefing on open is planned (#21), and it reads from objectives.

## Questions
1. **Model:** objective → child objectives → linked tracker items? How deep can nesting go?
2. **Progress:** computed from linked items (closed of total), set by hand, or both?
3. **Status:** what makes an objective "in flight" versus parked or done? Derived (it has active agents or open items) or set by hand?
4. **Priority and due:** P1–P3 only, or a ranked order as well? Does a child inherit its parent's due date (it may be earlier, never later)?
5. **Linking:** link a GitHub issue, a milestone or a Projects item? Two-way sync, or read-only from Dash?
6. **"Latest update":** taken from the newest heartbeat or comment on a linked item, written by hand, or generated (#21)?
7. **Crew:** derived from agents whose heartbeats reference the objective's linked items?
8. **Slice:** do objectives ship in slice 1 (the home screen needs them) or slice 2?

## Done when
The data model, the progress and status rules, the linking approach and the slice are agreed, and the issues are written.
