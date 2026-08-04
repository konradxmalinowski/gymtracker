# ADR-0010: Victory Native XL, behind a six-file adapter

- Status: accepted
- Date: 2026-08-04
- Supersedes nothing; the brief explicitly invited this evaluation

## Context

The brief names Victory Native but flags it: "or another actively maintained chart
library - open to architecture-agent's recommendation if Victory Native has maintenance
concerns, but must be justified". That instruction exists because the React Native
charting ecosystem has a history of abandonment, and because the old
`victory-native` (the React Native wrapper around Victory's web components) had genuine
performance problems and an uncertain future after Formidable Labs' reorganization.

Statistics is a Phase 2 feature (FR-21) but the exercise detail progress chart appears
earlier, so this choice is load-bearing from the mid-roadmap onward.

## Maintenance check performed

Checked on 2026-08-04:

- `victory-native` v41.x is **Victory Native XL**, a full rewrite built on Skia, D3 and
  Reanimated - not the old web-component wrapper. This is the material fact: the
  library the brief was worried about and the library it names are not the same
  codebase.
- Stewardship moved from Formidable Labs to **Nearform**, which states ongoing
  maintenance commitment for the foreseeable future.
- Release cadence is active: v41.26.0 published roughly two months before this date,
  with issues and pull requests being handled as recently as July 2026.

Conclusion: the maintenance concern that prompted the brief's caveat applies to the
pre-v41 line, not to the current library. There is no red flag that justifies deviating
from the stakeholder's stated preference.

## Options considered

**A. Victory Native XL (`victory-native` v41+).** Skia-rendered, so it stays smooth at
high point counts; first-class Reanimated integration for gesture-driven tooltips;
composable primitives (`CartesianChart`, `Line`, `Area`, `Bar`) rather than a monolithic
component; actively maintained by Nearform.
Cost: hard dependency on `@shopify/react-native-skia`, a large native module. That
increases binary size (single-digit MB), couples chart rendering to Skia's Expo SDK
compatibility, and makes the chart layer part of the native upgrade surface.

**B. `react-native-gifted-charts`.** Pure `react-native-svg`, no Skia. Very small
integration cost, wide chart-type coverage, popular. Weaker at high point counts (it is
SVG, so 500+ points on a line chart starts to cost), a more opinionated and less
composable API, and its animation story is thinner.

**C. `react-native-wagmi-charts`.** Excellent gesture-driven line charts with Reanimated,
built exactly for the "drag to inspect a data point" interaction this app wants on
progression charts. Narrow scope: essentially line and candlestick only, no bars, no
stacked charts. Would need a second library for volume bars and muscle-group breakdown.

**D. `react-native-svg` directly, hand-rolled charts.** Total control, zero library
risk, no Skia. Rejected: the app needs six chart types with axes, ticks, tooltips,
gestures and empty states. That is weeks of work and a permanent maintenance burden for
no differentiation.

## Decision

**Option A: Victory Native XL**, with `@shopify/react-native-skia` accepted as a
dependency, **and every use of it confined to `components/charts/`.**

The adapter is the important half of this decision. No screen, no feature and no hook
imports `victory-native`. They import:

```
components/charts/
  ChartCard.tsx           title, range selector, empty and loading states
  LineChartView.tsx       data: SeriesPoint[], xKey, yKeys, formatters, onPointPress
  BarChartView.tsx
  StackedBarChartView.tsx
  HeatmapView.tsx         custom, react-native-svg (Victory has no heatmap)
  ChartTooltip.tsx
  ChartLegend.tsx
  types.ts                SeriesPoint, TimeBucket - the app's own data shapes
```

The adapter's props are expressed in the app's own DTO types (`SeriesPoint`,
`TimeBucket`, `MuscleVolumeSlice`) which come straight from `StatisticsRepository`, not
in Victory's types. That is what makes the library swappable: replacing it means
rewriting six files against an unchanged public surface, and the compiler enforces the
surface.

## Why the adapter is worth it here specifically

This is normally the kind of indirection worth arguing about. It earns its place because:

1. The Skia dependency is the single largest native-upgrade risk in the whole app. Expo
   SDK bumps periodically break Skia compatibility for a few weeks. If that ever forces
   a temporary swap to the SVG-based option B, the adapter turns a multi-week rewrite
   into a two-day one.
2. Charts appear in at least eight screens. Even without a library change, a consistent
   axis format, empty state and tooltip across all of them is only achievable through a
   shared wrapper.

## Consequences

Positive:
- Skia rendering handles a multi-year progression chart (hundreds of points) at 60 fps,
  which SVG would struggle with - and long histories are an explicit product goal.
- Gesture-driven tooltips share the Reanimated runtime the rest of the app already uses.
- The stakeholder's stated preference is honored, with the maintenance question answered
  rather than assumed.

Negative:
- `@shopify/react-native-skia` adds meaningful size to the binary and a native module to
  the upgrade path. Budgeted against NFR-09 and re-measured at P16.
- Victory Native XL's composable API is more verbose than gifted-charts' one-liner
  components. That verbosity is absorbed once, inside the adapter.
- Charts cannot be rendered in Jest (Skia has no Node renderer). Chart components are
  therefore covered by snapshot tests of the *adapter's* prop mapping plus visual checks
  in Maestro, not by rendering assertions. Stated so it is not discovered as a surprise
  at P11.

## Revisit if

Skia blocks an Expo SDK upgrade for more than one release cycle, or if binary size
measured at P16 exceeds the NFR-09 budget and charts are a material contributor. The
fallback is option B behind the same adapter.
