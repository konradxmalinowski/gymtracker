/**
 * Makes Jest's globals (`describe`, `it`, `expect`, ...) visible to `tsc`.
 *
 * `expo/tsconfig.base` does not pull `@types/jest` in automatically, and the
 * alternative - adding an explicit `types` array to tsconfig.json - would switch
 * off automatic `@types` resolution for every *other* package at the same time.
 * A single reference file is the narrower change.
 */

/// <reference types="jest" />
