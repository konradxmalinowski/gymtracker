/**
 * Length value object - the single home for length unit conversion.
 *
 * ARCHITECTURE.md section 8: lengths (height, body measurements) are always
 * persisted in centimeters; unit conversion for display only ever happens in
 * the presentation layer, through this file. `eslint.config.js` bans
 * unit-conversion literals/constants (cm<->inch factors and similar)
 * everywhere else in the codebase - this file and `domain/Weight.ts` are the
 * two exempted locations.
 *
 * This is the domain layer: no React, Expo or SQLite imports allowed here
 * (enforced by the same eslint config).
 *
 * Conversion and rounding rules are the exact spec from ADR-0009: `cm -> in`
 * is `cm / 2.54` (and `in -> cm` is `in * 2.54`); display always shows 1
 * decimal in both units.
 */

/** cm per inch (ADR-0009). The only place this constant may live. */
const CM_PER_INCH = 2.54;

export class Length {
  private constructor(private readonly centimeters: number) {}

  static fromCentimeters(centimeters: number): Length {
    return new Length(centimeters);
  }

  static fromInches(inches: number): Length {
    return new Length(inches * CM_PER_INCH);
  }

  toCentimeters(): number {
    return this.centimeters;
  }

  toInches(): number {
    return this.centimeters / CM_PER_INCH;
  }

  equals(other: Length): boolean {
    return this.centimeters === other.centimeters;
  }

  /** ADR-0009 display rounding: always 1 decimal, in both units. */
  toDisplayString(unit: 'cm' | 'in'): string {
    const rawValue = unit === 'cm' ? this.toCentimeters() : this.toInches();
    return rawValue.toFixed(1);
  }
}
