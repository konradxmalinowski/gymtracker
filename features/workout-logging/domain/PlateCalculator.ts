/**
 * Gravitus-inspired refresh: "how do I load the bar to hit this weight"
 * (`PlateCalculatorSheet`). Domain-pure per `gymtracker/domain-purity` (no
 * React/RN/Expo import) - a plain greedy knapsack over one side of the bar,
 * everything in kg (ADR-0009: canonical storage/domain unit; display-unit
 * conversion, if ever needed, happens only in `domain/Weight.ts`, never
 * inline here).
 *
 * The bar is symmetric - every plate counted here is mirrored on the other
 * side, so `achievedWeightKg = barWeightKg + 2 * (sum of one side's plates)`.
 * The algorithm is a straightforward greedy fill (largest plate first,
 * floor-divide the remaining per-side target, repeat) - optimal for a
 * "canonical" plate set (each size a multiple relationship of the smaller
 * ones, which every real gym's plate set is), and never overshoots the
 * per-side target since each step only ever subtracts a whole number of
 * plates that fit within what's left.
 */

export interface PlateCalculatorInput {
  /** The weight the lifter wants on the bar, in kg. */
  targetWeightKg: number;
  /** The bar's own weight, in kg (e.g. 20 for a standard bar, 10 for an EZ-bar). */
  barWeightKg: number;
  /** Available plate sizes, in kg, each representing one physical plate. Order doesn't matter - this function sorts descending internally. */
  availablePlatesKg: readonly number[];
}

export interface PlateBreakdownEntry {
  /** One plate's weight, in kg. */
  plateWeightKg: number;
  /** How many of this plate go on **one side** of the bar. Always >= 1 - zero-count plates are omitted from the breakdown entirely. */
  count: number;
}

export interface PlateCalculatorResult {
  barWeightKg: number;
  /** Descending by `plateWeightKg`, one entry per plate size actually used - never a zero-count entry. */
  perSide: readonly PlateBreakdownEntry[];
  /** `barWeightKg + 2 * (sum of perSide's plates)` - what the bar actually ends up loaded to. */
  achievedWeightKg: number;
  /** `achievedWeightKg - targetWeightKg`. Zero when exactly achievable; negative when the plate set can't reach the target (the bar is under-loaded), positive only when `targetWeightKg` is below `barWeightKg` itself (the bar alone already exceeds it). */
  deltaKg: number;
}

/**
 * Greedily fills one side of the bar toward `(targetWeightKg - barWeightKg) / 2`
 * using the largest available plate that still fits, repeating until no
 * available plate fits in what remains. Never throws: a non-finite or
 * negative `barWeightKg`/`targetWeightKg` is clamped to zero, and any
 * non-finite or non-positive entry in `availablePlatesKg` is ignored rather
 * than crashing the calculation.
 */
export function calculatePlateBreakdown({
  targetWeightKg,
  barWeightKg,
  availablePlatesKg,
}: PlateCalculatorInput): PlateCalculatorResult {
  const safeBarWeightKg = Number.isFinite(barWeightKg) && barWeightKg > 0 ? barWeightKg : 0;
  const safeTargetWeightKg =
    Number.isFinite(targetWeightKg) && targetWeightKg > 0 ? targetWeightKg : 0;

  const sortedPlates = availablePlatesKg
    .filter((plateWeightKg) => Number.isFinite(plateWeightKg) && plateWeightKg > 0)
    .slice()
    .sort((a, b) => b - a);

  let remainingPerSideKg = Math.max(0, (safeTargetWeightKg - safeBarWeightKg) / 2);
  const perSide: PlateBreakdownEntry[] = [];

  for (const plateWeightKg of sortedPlates) {
    const count = Math.floor(remainingPerSideKg / plateWeightKg);
    if (count > 0) {
      perSide.push({ plateWeightKg, count });
      remainingPerSideKg -= count * plateWeightKg;
    }
  }

  const achievedPerSideKg = perSide.reduce(
    (sum, entry) => sum + entry.plateWeightKg * entry.count,
    0,
  );
  const achievedWeightKg = safeBarWeightKg + 2 * achievedPerSideKg;

  return {
    barWeightKg: safeBarWeightKg,
    perSide,
    achievedWeightKg,
    deltaKg: achievedWeightKg - safeTargetWeightKg,
  };
}
