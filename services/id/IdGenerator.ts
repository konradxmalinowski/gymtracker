/**
 * `IdGenerator` - ARCHITECTURE.md section 8.4 ("injectable: makes fixtures
 * reproducible"). This is the app-wide id service every repository's `create()`
 * goes through, distinct from `database/ids/uuidv7.ts` (a schema-layer/fixture
 * helper for `database/**` code, not for application code to import - see that
 * file's own header). `repositories/base/BaseSqliteRepository.ts` is the main
 * caller.
 */
export interface IdGenerator {
  /** A UUIDv7 `TEXT` primary key (ADR-0002 decision 1). Opaque to callers. */
  generate(): string;
}
