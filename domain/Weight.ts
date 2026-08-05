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
 * Conversion methods (toLb/fromLb, display formatting per user unit
 * preference) are intentionally not implemented yet - they land with the
 * body-metrics / settings phases once there is a unit-preference store to
 * read from. This type is the recognized, canonical place for that logic
 * when it arrives, kept honest rather than stubbed with TODOs.
 */

export class Weight {
  private constructor(private readonly kilograms: number) {}

  static fromKilograms(kilograms: number): Weight {
    return new Weight(kilograms);
  }

  toKilograms(): number {
    return this.kilograms;
  }

  equals(other: Weight): boolean {
    return this.kilograms === other.kilograms;
  }
}
