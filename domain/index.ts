/**
 * Shared domain kernel - cross-feature value objects with no natural single
 * feature owner (Weight is used by workout-logging, body-metrics and
 * statistics alike). Everything else in Clean Architecture terms lives inside
 * each feature's own `domain/` folder (ARCHITECTURE.md section 9); this
 * top-level `domain/` exists specifically for the small set of value objects
 * that would otherwise force an artificial cross-feature dependency.
 *
 * Pure domain code only: no React, Expo or SQLite imports (enforced by
 * eslint.config.js).
 */

export { Weight } from './Weight';
export { Length } from './Length';
