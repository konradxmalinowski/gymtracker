/**
 * Weight value object - the single home for weight unit conversion.
 *
 * ARCHITECTURE.md section 8: weights are always persisted in kilograms; unit
 * conversion for display only ever happens in the presentation layer, through
 * this file. `eslint.config.js` bans unit-conversion literals/constants
 * (kg<->lb factors and similar) everywhere else in the codebase - this file
 * and `domain/Length.ts` are the two exempted locations.
 *
 * This is the domain layer: no React, Expo or SQLite imports allowed here
 * (enforced by the same eslint config).
 *
 * Conversion and rounding rules are the exact spec from ADR-0009
 * ("Store metric, display anything; rounding is a presentation concern"):
 *
 * - `kg -> lb`: `kg * 2.20462262185`; `lb -> kg`: `lb / 2.20462262185`.
 * - Display rounding: nearest 0.25 kg (trailing zeros trimmed), nearest 0.5 lb.
 *   This is what makes round-tripping stable - a value entered as `225 lb`
 *   stores `102.058... kg` and redisplays as `225 lb`, not `224.5`.
 */

/** kg per lb (ADR-0009). The only place this constant may live. */
const KG_PER_LB = 2.20462262185;

/** Denominator per display unit for ADR-0009's rounding table (1/step). */
const ROUNDING_DENOMINATOR: Record<'kg' | 'lb', number> = {
  kg: 4, // nearest 0.25 kg
  lb: 2, // nearest 0.5 lb
};

/**
 * Rounds `value` to the nearest `1/denominator` and back. `denominator` is
 * always a power of two here (2 or 4), so the final division is exact in
 * IEEE-754 double precision - no residual floating-point noise to clean up.
 */
function roundToNearestFraction(value: number, denominator: number): number {
  return Math.round(value * denominator) / denominator;
}

export class Weight {
  private constructor(private readonly kilograms: number) {}

  static fromKilograms(kilograms: number): Weight {
    return new Weight(kilograms);
  }

  static fromPounds(pounds: number): Weight {
    return new Weight(pounds / KG_PER_LB);
  }

  toKilograms(): number {
    return this.kilograms;
  }

  toPounds(): number {
    return this.kilograms * KG_PER_LB;
  }

  equals(other: Weight): boolean {
    return this.kilograms === other.kilograms;
  }

  /** ADR-0009 display rounding: nearest 0.25 kg or nearest 0.5 lb, trailing zeros trimmed. */
  toDisplayString(unit: 'kg' | 'lb'): string {
    const rawValue = unit === 'kg' ? this.toKilograms() : this.toPounds();
    const rounded = roundToNearestFraction(rawValue, ROUNDING_DENOMINATOR[unit]);
    return String(rounded);
  }
}
