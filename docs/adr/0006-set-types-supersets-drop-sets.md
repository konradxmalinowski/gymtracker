# ADR-0006: Set types are a flat enum; supersets and drop sets are relationships

- Status: accepted
- Date: 2026-08-04
- Accepted: 2026-08-04. The stakeholder approved the six-value enum with supersets as a
  relation, the superset rest-timer rule, and the assisted-set treatment exactly as
  proposed. Nothing in this ADR remains open.

## Context

The brief lists seven "set types": Warm-up, Normal, Drop Set, Failure, Superset,
Assisted, Partial. Taken literally, that is a single `set_type` column with seven
values. That literal reading is wrong in two places, and getting it wrong would be
baked into every row the user ever logs.

## The problem with a flat seven-value enum

**"Superset" is not a property of a set.** A superset is "do exercise A, then exercise
B, then rest" - it is a relationship between two or more *exercises*, expressed across
all of their sets. Marking individual sets as `superset` cannot answer "which exercises
are paired?", cannot drive the rest-timer behavior that is the entire point of a
superset, and breaks as soon as an exercise participates in a superset in one workout
and not in another.

**"Drop set" is not one set.** `100 kg x 8 -> 80 kg x 6 -> 60 kg x 5` is one working
set with two drops. Storing three independent rows loses the fact that they are one
effort, and makes the set counter say "3 sets" when the user did one. Storing it as one
row with an array of drops makes the values unqueryable.

## Options considered

**A. Flat seven-value enum, exactly as written in the brief.**
Rejected for the reasons above.

**B. `set_type` enum of six, plus `superset_group INTEGER` on `session_exercise`, plus
`parent_set_id` self-reference on `workout_set` for drop chains.** **Chosen.**

**C. A separate `set_modifier` join table (a set can be both `failure` and `partial`).**
More expressive - a set genuinely can be taken to failure *and* finished with partials.
Rejected for v1: it turns a single-column read into a join on the hottest table in the
app, and the compound cases are rare enough that picking the dominant modifier is
acceptable. Revisit if users ask.

**D. Superset as a first-class `superset` table with ordered members.**
Cleaner in theory. Rejected as over-modeled: a nullable integer group column on
`session_exercise` and `plan_day_exercise` expresses the same thing, supports arbitrary
group sizes (tri-sets, giant sets) for free, and needs no extra joins.

## Decision

### Set type

```sql
set_type TEXT NOT NULL DEFAULT 'normal'
    CHECK (set_type IN ('warmup','normal','drop','failure','assisted','partial'))
```

Six values. `superset` is deliberately absent.

### Supersets

`superset_group INTEGER NULL` on both `session_exercise` and `plan_day_exercise`.
`NULL` means standalone; equal non-null values within the same session (or plan day)
mean grouped. Group numbers are local to their parent and are renumbered on reorder.

This supports pairs, tri-sets and giant sets with no schema change, survives an
exercise being supersetted in one workout and standalone in another, and gives the UI
exactly what it needs to render a bracket down the left edge of the grouped cards.

Rest-timer behavior for a group (**decided**): completing a set of a non-terminal member
of the group does **not** start the rest timer; completing a set of the last member does.
That is what a superset means in training, and it is why the grouping must be visible to
the timer service. Implemented in P7.

### Drop sets

`parent_set_id TEXT NULL REFERENCES workout_set(id) ON DELETE CASCADE`, constrained by
`CHECK (parent_set_id IS NULL OR set_type = 'drop')`.

A drop segment is a real `workout_set` row - so its weight and reps are queryable and
count toward volume - that points at the set it dropped from. `ON DELETE CASCADE` means
deleting the parent removes its drops, which is the only sensible behavior.

Display and counting rules:
- Drop segments render indented under their parent, sharing the parent's set number.
- `set_index` is not incremented for drop segments; the "sets completed" counter counts
  parents only.
- Drop segments contribute volume but are **not** evaluated for personal records - the
  parent set is the effort that counts. A 60 kg drop after a 100 kg top set is not a
  60 kg PR.

### The normative semantics table

Reproduced from ARCHITECTURE.md section 6.3 because it is the actual contract:

| Set type | Volume | PR / e1RM | Set count | `weight_kg` means |
|----------|--------|-----------|-----------|-------------------|
| `warmup` | No | No | No | External load |
| `normal` | Yes | Yes | Yes | External load |
| `drop` | Yes | No | No (grouped with parent) | External load |
| `failure` | Yes | Yes | Yes | External load |
| `assisted` | No | No | Yes | Assistance magnitude, positive |
| `partial` | No | No | Yes | External load |

These rules live in exactly one place in code: the `SetVolume` domain calculator and
the `v_working_set` SQL view, which must agree. A repository test asserts that the
view's volume expression and the TypeScript calculator produce identical results across
a generated matrix of set types and values. That test is the only thing keeping two
implementations of one rule honest, and it is not optional.

### Assisted sets

For `assisted`, `weight_kg` stores the **assistance** as a positive number (60 kg of
band or machine assistance on a pull-up is `weight_kg = 60`). It is not stored as a
negative external load, because a negative value would silently produce negative volume
in any query that forgot the set-type rule.

The theoretically correct load is `bodyweight - assistance`, which needs a reliable
bodyweight at the time of the set. Body metrics do not ship until P13, and a user who
never logs bodyweight would get either wrong numbers or gaps.

**Decided v1 behavior:** assisted sets are excluded from volume and from PR evaluation
entirely, and are displayed as `-60 kg` with an "assisted" badge. They still count as
completed sets so the workout feels correct.

The roadmap is explicitly **not** reordered to pull body measurements earlier in support
of this. Bodyweight-relative volume stays a post-1.0 backlog item: because the raw
assistance value is what is stored, computing `max(0, bodyweightAtDate - assistance) *
reps` later is a read-time display change, not a schema change or a migration.

## Consequences

Positive:
- Supersets and drop sets are modeled as what they actually are, so the rest timer,
  the set counter and the PR logic can all behave correctly without special cases
  scattered through the UI.
- Adding a set type later is a `CHECK` constraint migration plus one row in the
  semantics table.

Negative:
- The brief said seven types and this delivers six plus two relationships. This is a
  deliberate deviation from a literal reading of the brief; the stakeholder reviewed and
  approved it on 2026-08-04.
- `set_index` no longer equals "position in the list" once drop sets exist, so display
  numbering is computed rather than read. Handled once, in the set-list view model.
- The two-implementations problem (SQL view and TypeScript calculator) is real and is
  mitigated by a test rather than eliminated. The alternative - computing volume only in
  SQL - would force statistics through the database for values the UI needs
  synchronously during a workout.
