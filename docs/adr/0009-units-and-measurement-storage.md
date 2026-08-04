# ADR-0009: Store metric, display anything; rounding is a presentation concern

- Status: accepted
- Date: 2026-08-04

## Context

FR-26 requires kg/lb and cm/in switching. A user may switch units at any point,
including after years of history. Gyms in the same country mix plate sets. The wrong
decision here produces charts with visible discontinuities and PR values that change
when the user flips a toggle - both of which read as data corruption even when the
underlying numbers are fine.

## Options considered

**A. Store the value in whatever unit the user entered, plus a `unit` column.**
Preserves exactly what the user typed. Rejected decisively: every aggregate
(`SUM(weight_kg * reps)`) becomes wrong unless it carries a conversion, every comparison
between a 2024 lb entry and a 2026 kg entry needs a join, and the SQL views in
ARCHITECTURE.md section 7.10 become unwritable.

**B. Store canonically in metric; display and input convert.** **Chosen.**

**C. Store canonically in metric *and* keep the original entered value and unit for
display fidelity.** Gives perfect round-trip display. Rejected as over-engineering: two
extra columns on the hottest table to solve a problem that correct rounding (below)
already solves.

## Decision

- `workout_set.weight_kg`, `personal_record.weight_kg`, `body_metric_entry.value` for
  `body_weight`: **kilograms**, `REAL`.
- All circumference metrics: **centimetres**, `REAL`.
- `body_fat_pct`: percent, unitless.
- `distance_m`: metres. `duration_seconds`: seconds.
- Conversion happens **only** in `domain/Weight.ts` and `domain/Length.ts`. No other
  file may contain the constants 2.20462 or 0.393701. Enforced by a lint rule against
  those literals outside those two files - a small rule that prevents a real class of
  bug, because a stray hard-coded conversion in one screen is invisible until a user
  notices one number disagreeing with another.

### Conversion and rounding rules

```
kg -> lb : kg * 2.20462262185
lb -> kg : lb / 2.20462262185
cm -> in : cm / 2.54
```

Display rounding, which is what makes round-tripping stable:

| Context | Rounding |
|---------|----------|
| Weight in kg | Nearest 0.25 kg, trailing zeros trimmed (`80`, `82.5`, `100.25`) |
| Weight in lb | Nearest 0.5 lb |
| Body weight | 1 decimal in both units |
| Circumference cm | 1 decimal |
| Circumference in | 1 decimal |
| Volume totals | Nearest whole unit, thousands separated |
| Estimated 1RM | Nearest 0.5 in the display unit |

A user who enters `225 lb` stores `102.058...` kg and sees `225 lb` on redisplay because
`102.058 * 2.20462 = 224.999...` rounds to `225.0`. Round-trip stability across the
plausible input range is asserted by a `fast-check` property test - not by inspection,
because the failure mode (a value that displays as `224.5` after being entered as `225`)
is both subtle and infuriating.

### Quick-adjust increments

FR-12 specifies +1.25 / 2.5 / 5 / 10 kg. Those are the **display-unit** increments, not
kilogram increments. In lb mode the chips become +2.5 / 5 / 10 / 25 lb, which are the
real plate increments in an imperial gym - mechanically converting 1.25 kg to 2.76 lb
would produce a useless button.

The increment set is therefore a setting per display unit, defaulting to:
- kg: `[1.25, 2.5, 5, 10]`
- lb: `[2.5, 5, 10, 25]`

`QuickAdjustBar` receives increments in display units and emits deltas in display units;
the service converts once before writing kilograms.

### Bar-weight awareness

Deliberately out of scope for v1. `weight_kg` is the total external load the user
chooses to record, and whether that includes the bar is the user's convention. The app
does not attempt to infer it. A plate calculator would need this; it was confirmed out of
v1 scope (D-10) and is the top post-1.0 backlog candidate.

## Consequences

Positive:
- Switching units is a pure display toggle with zero data migration and zero risk.
- Every aggregate query is a plain arithmetic sum with no conversion joins.
- Import and export carry canonical metric values with the unit named in the envelope,
  so a file is unambiguous regardless of the exporting user's display setting.

Negative:
- Users who think exclusively in pounds see stored values they never typed if they
  inspect an export file. The export includes a `weight_lb` convenience column in CSV
  (ADR-0013) to soften this.
- Floating-point kilograms mean `SUM()` over 78,000 sets accumulates rounding error in
  the last few significant digits. At realistic magnitudes (tens of millions of kg
  lifetime volume) the error is far below display precision. Considered storing weights
  as integer grams to eliminate it entirely; rejected because it makes every read and
  write carry a scale factor for a problem that never becomes visible.
- The lint rule against conversion constants is crude and will occasionally need an
  eslint-disable in a test fixture. Acceptable.
