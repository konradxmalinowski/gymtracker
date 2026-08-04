# ADR-0015: Epley e1RM by default, double progression for suggestions, PRs as a rebuildable cache

- Status: accepted
- Date: 2026-08-04

## Context

FR-15 requires the app to always show previous weight, previous reps, best weight, best
reps and an "estimated next progression". FR-21 requires estimated 1RM in statistics.
These are the app's only opinionated training content, and they appear on five different
surfaces, so the formulas need to be pinned down and owned by one module.

Three separate decisions: which 1RM formula, what "suggested progression" means, and how
personal records are computed and stored.

## Decision 1: estimated 1RM uses Epley by default, Brzycki selectable

| Formula | Expression | Behavior |
|---------|-----------|----------|
| Epley | `w * (1 + reps / 30)` | Slightly generous at high reps; the most widely recognized |
| Brzycki | `w * 36 / (37 - reps)` | More accurate at 1-10 reps; degenerates badly above 15 and is undefined at 37 |
| Lombardi | `w * reps^0.10` | Conservative; unfamiliar to most lifters |

**Epley is the default**, with Brzycki available via the `oneRm.formula` setting. The
reason for defaulting to Epley is not accuracy - the formulas are within a few percent of
each other in the rep ranges that matter - but recognizability: a lifter who has seen an
e1RM number before has almost certainly seen Epley's, and a number that disagrees with
their expectation reads as a bug.

Guard rails, which matter more than the formula choice:

- `reps === 1` returns the weight itself, not a formula result.
- Above 12 reps the estimate is unreliable for everyone and wildly wrong for some. The
  calculator returns `null` above 12 reps and the UI shows nothing rather than a
  fabricated number. Silence is more honest than a wrong number presented confidently.
- Only `normal` and `failure` sets are eligible (ADR-0006 semantics table). Warm-ups,
  drops, partials and assisted sets return `null`.
- `weight_kg <= 0` returns `null`.

The formula is injected into the calculator rather than imported, so the setting
genuinely changes every surface at once and the tests can pin a formula.

## Decision 2: suggested progression is double progression

### Options

**A. Linear progression** (add a fixed increment every session). Simple, and correct for
a true beginner for about eight weeks. Then it fails, and it fails by telling the user to
add weight they cannot lift, which is worse than saying nothing.

**B. Double progression** (work up to the top of a rep range at a given weight, then add
weight and drop back to the bottom of the range). The standard intermediate approach,
and it maps directly onto the `target_rep_min` / `target_rep_max` fields already on
`plan_day_exercise`.

**C. RPE-based autoregulation** (suggest load from recent RPE and estimated e1RM). More
sophisticated and genuinely better for advanced lifters. Rejected for v1: RPE is optional
in this app, so the input is frequently missing, and a suggestion engine that silently
degrades when its input is absent is confusing.

**D. No suggestion, just show previous and best.** Defensible - the brief asks for a
suggestion, so this is the fallback rather than the choice.

### Decision

**Option B**, implemented as a pure function in
`features/workout-logging/domain/ProgressionAdvisor.ts`:

```
given: the last completed session for this exercise, and the plan's target rep range

if no history                        -> no suggestion; show "first time"
if no target rep range on the plan   -> derive one from the last session's rep count (+/- 2)
if every working set last time hit target_rep_max
                                     -> suggest weight + increment, reps = target_rep_min
if any working set was below target_rep_min
                                     -> suggest the same weight, same reps ("repeat")
otherwise                            -> suggest the same weight, reps = last + 1
```

The increment comes from settings and depends on the movement, because 2.5 kg on a
lateral raise is a different proposition from 2.5 kg on a deadlift:

- `progression.upperIncrementKg` default 2.5, applied when the exercise's primary muscle
  is an upper-body group.
- `progression.lowerIncrementKg` default 5, applied for lower-body groups.
- Dumbbell exercises snap to the nearest 2 kg (dumbbells come in pairs and in discrete
  sizes), derived from `equipment_slug`.

The suggestion is always presented as a pre-fill the user can override in one tap. It is
never enforced, never auto-applied to a completed set, and is labeled as a suggestion.
The app does not know whether the user slept, ate or is deloading; overstating confidence
here is how a training app becomes annoying.

## Decision 3: personal records are a derived, rebuildable cache

### Record types

| `record_type` | `value` is | Eligible sets |
|---------------|-----------|---------------|
| `max_weight` | Heaviest weight lifted for at least 1 rep | `normal`, `failure` |
| `max_reps` | Most reps at any weight | `normal`, `failure` |
| `weight_at_reps` | Heaviest weight at exactly N reps, N in {1,2,3,5,8,10,12} (`rep_bucket`) | `normal`, `failure` |
| `max_set_volume` | Highest `weight * reps` in a single set | `normal`, `failure` |
| `max_session_volume` | Highest total volume for this exercise in one session | per ADR-0006 rules |
| `estimated_1rm` | Highest e1RM from any eligible set | `normal`, `failure`, reps <= 12 |
| `max_duration` / `max_distance` | For time- and distance-tracked exercises | as applicable |

`weight_at_reps` buckets exist because "I hit 100 kg for 5" is how lifters actually
experience progress, and a single `max_weight` record hides it - a 105 kg single does not
tell you your 5-rep strength improved.

### Maintenance

PRs are evaluated **inside the same transaction as the set completion** that might beat
them (ARCHITECTURE.md section 5.1). Either the set and its PR both commit, or neither
does. A superseded record keeps its row with `is_current = 0`, so the app can render a PR
timeline rather than only the current best.

The partial unique index `ux_pr_current` guarantees at most one current record per
`(exercise_id, record_type, rep_bucket)` at the database level.

**`PersonalRecordService.rebuildAll()` regenerates the entire table from `workout_set`.**
It runs after any import, after editing or deleting a historical session, and on demand
from Settings ("Recalculate records"). This is the property that makes the incremental
path safe to have: if the cache is ever wrong, it is provably fixable, because
`workout_set` is the source of truth and the rebuild uses the same domain calculators as
the incremental path.

A test asserts that incremental evaluation across a generated workout history produces
exactly the same table as a full rebuild. That equivalence is the whole justification for
the cache existing.

### Why cache at all

The alternative is computing PRs on demand with window functions. At the section 7.11
worst case that is a scan over tens of thousands of rows every time the workout screen
renders an exercise header - during a workout, on the app's most latency-sensitive
screen. The cache turns it into a point lookup. The rebuild path is what makes the cache
honest rather than a second source of truth.

## Consequences

Positive:
- One module owns every training formula, so the workout screen, the summary, the
  exercise detail, the statistics screens and the CSV export cannot disagree.
- All of it is pure and table-testable with no React and no database.
- Refusing to show an estimate outside its valid range builds more trust than filling
  every field.

Negative:
- Double progression assumes the user's plan has rep ranges. Plans created without
  `target_rep_min`/`target_rep_max` fall back to a derived range, which is a guess.
  Mitigated by making rep ranges prominent (and pre-filled with sensible defaults) in the
  plan editor.
- The PR cache is a second representation of information already in `workout_set`, with
  the drift risk that implies. The rebuild operation plus the equivalence test are the
  mitigation, and they are load-bearing rather than optional.
- Fixed `weight_at_reps` buckets mean a 6-rep set does not set a rep-specific PR. Chosen
  over per-rep-count records, which would produce a wall of near-identical PR
  notifications and cheapen the ones that matter.
