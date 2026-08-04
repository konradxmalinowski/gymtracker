# ADR-0008: Four state stores, one source of truth, one deliberate exception

- Status: accepted
- Date: 2026-08-04

## Context

The brief fixes four state technologies without saying what each is for: Zustand,
TanStack Query, Expo SQLite, MMKV. Four overlapping stores with no boundary rules is
the most reliable way to end up with the same fact stored in three places and disagreeing.

TanStack Query is normally a *server* cache. This app has no server. That needs
justifying rather than assuming.

## Decision: the boundary table

| Store | Owns | Never holds |
|-------|------|-------------|
| **SQLite** | All persistent domain data. Sole source of truth. | Nothing is excluded - if it must survive a restart, it is here |
| **TanStack Query** | The async read cache in front of repositories: dedup, staleness, invalidation, background refetch, suspense | Anything it did not read from a repository; no mutation-only state |
| **Zustand** | Ephemeral UI state: focused set, sheet visibility, filter panel draft, chart range selection, timer tick | Anything that must survive a restart (except the section below) |
| **MMKV** | Boot-critical flags read before SQLite opens: `onboarding.completed`, `session.active`, `catalog.version`, `units.*` mirror | Domain data. It is a cache of facts SQLite owns |
| **React Hook Form** | Form field state | Anything outside its form |

## Why TanStack Query at all, with no server

Considered dropping it in favor of plain `useState` + `useEffect` over repositories.
Rejected, because local repository reads are still asynchronous and still have all the
problems Query exists to solve: three components on the Home screen each needing the
streak would fire three queries; nothing would dedupe them; after finishing a workout,
every screen holding stale data would need manual refresh wiring; and there would be no
standard loading/error surface.

What Query is explicitly **not** used for here:

- **Persistence.** `@tanstack/query-async-storage-persister` writing the cache to MMKV
  is a common pattern and would be actively harmful: the underlying store is already a
  local database, so persisting a cache of a local database duplicates data and adds a
  staleness bug surface for zero benefit. Cold start reads from SQLite.
- **Retries.** `retry: 0` globally. A failed local read will not succeed on the second
  attempt; retrying just delays the error.
- **Refetch on window focus.** Off. Nothing changes the database except this app.

Global defaults: `staleTime: Infinity`, `gcTime: 30 min`, `retry: 0`,
`refetchOnWindowFocus: false`. Data is invalidated explicitly by mutations, never by
time, because nothing external can change it.

## Query key and invalidation conventions

Keys are structured `[domain, scope, ...params]` (full list in ARCHITECTURE.md section
12.1). Invalidation lives in one module per feature (`hooks/invalidation.ts`) rather
than inline in each mutation, so the blast radius of "finishing a workout" is written
down in one place and reviewable:

```ts
export function invalidateAfterWorkoutFinish(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['sessions'] });
  qc.invalidateQueries({ queryKey: ['records'] });
  qc.invalidateQueries({ queryKey: ['stats'] });
  qc.invalidateQueries({ queryKey: ['calendar'] });
  qc.invalidateQueries({ queryKey: ['home'] });
  qc.invalidateQueries({ queryKey: ['exercises', 'history'] });
}
```

## The one deliberate exception: the active workout

During an active workout, `workout/active` reads from a Zustand `activeWorkoutStore`
rather than from TanStack Query. This is the only place in the app where a Zustand store
mirrors persisted data.

**Why the exception exists.** NFR-01 budgets the set-completion interaction at under
100 ms perceived. Routing every `+2.5 kg` tap and every completion through Query's
mutation lifecycle (`onMutate` optimistic update, cache write, `onSettled`
invalidation, refetch) adds latency and re-render churn on exactly the interaction the
product is judged on. The workout screen also holds a large, deeply nested structure
(exercises, sets, drop chains, previous-performance hints) that is cheaper to keep in a
purpose-shaped store with selector-level subscriptions than in a serialized cache entry.

**The rules that keep it from becoming a second source of truth:**

1. The store is hydrated from SQLite on mount, and only on mount, via
   `WorkoutSessionRepository.findInProgress()`.
2. Every edit updates the store synchronously **and** dispatches a repository write
   through the service layer.
3. If a write fails, the store is reconciled **from the database** and a non-blocking
   error toast is shown. The database always wins. There is no path where the store
   corrects the database.
4. The store is cleared on finish, discard and unmount, and Query keys are invalidated
   at that point.
5. The store's lifetime is bounded to one screen and one workout. It is not a global
   app store.

This exception is written down, bounded and given a precedence rule precisely because
an unwritten version of it is how apps end up with a UI showing sets that were never
saved.

## Zustand store inventory

| Store | Scope | Contents |
|-------|-------|----------|
| `activeWorkoutStore` | Workout lifetime | Session aggregate mirror, focused set id, dirty-write queue status |
| `restTimerStore` | Workout lifetime | Derived remaining seconds ticked from `timer_deadline_at`; never the source of the deadline |
| `exerciseFilterStore` | App lifetime | Current library filter selection (not persisted; resets on cold start by design) |
| `uiStore` | App lifetime | Toast queue, active bottom sheet, keyboard-avoidance offsets |

Every store is consumed with selectors (`useActiveWorkoutStore(s => s.focusedSetId)`),
never with the bare hook, so a set-value change does not re-render the exercise list.

## MMKV key inventory

`onboarding.completed`, `session.active`, `session.activeId`, `catalog.version`,
`units.weight`, `units.length`, `haptics.enabled`. All accessed through
`services/kv` with a typed key union - no string literals at call sites.

The unit and haptics mirrors exist so that presentation code can read them
synchronously during render without an async settings query. SQLite's `app_setting`
remains authoritative; the mirror is rewritten whenever the setting is written, and
re-synced from SQLite on app start.

## Consequences

Positive: every piece of state has one owner and one written-down precedence rule. The
"where does this live" question has a table answer rather than a judgment call.

Negative:
- Four stores is genuinely more to learn than one. The boundary table is the mitigation
  and it belongs in `CLAUDE.md` when that file is generated.
- The active-workout exception is a real coupling: `activeWorkoutStore` must be kept
  structurally in sync with the session aggregate shape. Mitigated by deriving the store's
  types from the repository's aggregate types rather than redeclaring them.
- Mirroring units into MMKV means two writes per unit change. The alternative - blocking
  render on an async settings read - is worse.
