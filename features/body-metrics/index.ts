/**
 * Public barrel for the "body-metrics" feature.
 *
 * This is the ONLY surface other features may import from (ARCHITECTURE.md
 * section 3.1, rule 4 - enforced by the import/no-restricted-paths zones in
 * eslint.config.js). Reaching into "features/body-metrics/<subfolder>/..." from any
 * other feature is a lint error; import from "@/features/body-metrics" instead.
 *
 * Nothing is exported yet - this feature's screens/services/domain land in a
 * later roadmap phase. Re-export the feature's public API here as it is built.
 */

export {};
