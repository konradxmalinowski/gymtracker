/**
 * Repository-layer error. Kept local to `repositories/base` rather than the
 * project-root `errors/` directory: that directory is still an empty skeleton
 * (P3+ concern per its `.gitkeep`) and is not part of this phase's owned files -
 * a future error-handling phase can promote/re-export this if it wants a single
 * project-wide hierarchy.
 */
export class RepositoryNotFoundError extends Error {
  constructor(
    public readonly table: string,
    public readonly id: string,
  ) {
    super(`No row in "${table}" with id "${id}".`);
    this.name = 'RepositoryNotFoundError';
  }
}
