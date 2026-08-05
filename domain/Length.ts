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
 * Conversion methods (toInches/fromInches, display formatting per user unit
 * preference) are intentionally not implemented yet - they land with the
 * body-metrics / settings phases once there is a unit-preference store to
 * read from. This type is the recognized, canonical place for that logic
 * when it arrives, kept honest rather than stubbed with TODOs.
 */

export class Length {
  private constructor(private readonly centimeters: number) {}

  static fromCentimeters(centimeters: number): Length {
    return new Length(centimeters);
  }

  toCentimeters(): number {
    return this.centimeters;
  }

  equals(other: Length): boolean {
    return this.centimeters === other.centimeters;
  }
}
