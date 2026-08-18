import { useQuery } from '@tanstack/react-query';

import { formatExerciseName, type ExerciseService } from '@/features/exercise-library';
import type { PlanAggregate, PlanDay, PlanService } from '@/features/plans';
import type { PersonalRecord, PersonalRecordService } from '@/features/records';
import type { Clock } from '@/services/clock';

import {
  calculateStreak,
  formatLocalDate,
  ONE_DAY_MS,
  parseLocalDate,
} from '../domain/StreakCalculator';
import { nextSuggestedPlanDay } from '../domain/nextSuggestedPlanDay';
import type {
  HomeDashboardRepository,
  HomeLastSessionDto,
  HomeWeeklySummary,
} from '../repository/HomeDashboardRepository';

/**
 * Week-boundary calendar math specific to the weekly-summary range - built
 * on `StreakCalculator.ts`'s shared `parseLocalDate`/`formatLocalDate`/
 * `ONE_DAY_MS` primitives rather than a second copy of them. `Date.UTC` is
 * used purely as calendar-math scratch space here too, never as a stand-in
 * for wall-clock time - the same non-negotiable `StreakCalculator.ts`'s own
 * header comment documents.
 */
function addDays(localDate: string, days: number): string {
  return formatLocalDate(parseLocalDate(localDate) + days * ONE_DAY_MS);
}

/**
 * Monday=0..Sunday=6 index for `localDate`, matching this project's
 * bit0=Monday `active_weekdays` convention (ARCHITECTURE.md section 7.12).
 */
function mondayIndexOf(localDate: string): number {
  const jsDay = new Date(parseLocalDate(localDate)).getUTCDay(); // 0=Sunday..6=Saturday
  return (jsDay + 6) % 7;
}

/** The Monday on/before `todayLocalDate` - the start of the current Monday-start calendar week. */
function currentWeekStart(todayLocalDate: string): string {
  return addDays(todayLocalDate, -mondayIndexOf(todayLocalDate));
}

/** How far back `getTrainingLocalDates` looks for streak purposes - generous enough that no real user's streak is ever truncated by the window, small enough to stay a cheap indexed range scan (`ix_session_local_date`). */
export const STREAK_LOOKBACK_DAYS = 400;

export const homeDashboardKeys = {
  dashboard: ['home', 'dashboard'] as const,
};

/**
 * Every dependency taken as a parameter rather than resolved via
 * `useContainer()` inside this hook - the same pattern
 * `useCurrentRecords(recordService, ...)`/`useStartWorkout(sessionService)`
 * already establish in their own feature barrels, and for a related reason:
 * this hook reaches across `plans`, `records` and `exercise-library`
 * (through their barrels), and keeping it dependency-injected means its own
 * tests never need to stand up a full `useContainer()` provider tree just to
 * exercise the composition logic. `exerciseService` is a deliberate addition
 * beyond the plan brief's named three dependencies
 * (`homeDashboardRepository`/`planService`/`recordService`) - resolving the
 * latest PR's exercise name needs it, the same "records reaches into
 * exercise-library's barrel for exactly this" precedent
 * `useRecordExerciseNames.ts` already documents and justifies.
 */
export interface HomeDashboardDependencies {
  homeDashboardRepository: HomeDashboardRepository;
  planService: PlanService;
  recordService: PersonalRecordService;
  exerciseService: ExerciseService;
  clock: Clock;
}

export interface HomeDashboardData {
  activePlan: PlanAggregate | null;
  suggestedDay: PlanDay | null;
  lastSession: HomeLastSessionDto | null;
  streak: number;
  weeklySummary: HomeWeeklySummary;
  latestRecord: PersonalRecord | null;
  latestRecordExerciseName: string | null;
}

/**
 * One `useQuery` under `homeDashboardKeys.dashboard` composing every piece
 * the Home dashboard needs - the screen sees a single `isPending`/`isError`/
 * `refetch`, not five independent ones (this phase's own acceptance
 * criterion). The independent reads (training dates, weekly summary, last
 * session, plan list, recent records) run via `Promise.all`; the two reads
 * that depend on which plan is active (the full plan aggregate, and its most
 * recently completed day) necessarily run after that first batch resolves -
 * there is no plan id to query with before `listPlans()` returns - but run
 * concurrently with *each other* via their own `Promise.all`, since neither
 * needs the other's result, only the already-resolved active plan id.
 */
export function useHomeDashboard(deps: HomeDashboardDependencies) {
  const { homeDashboardRepository, planService, recordService, exerciseService, clock } = deps;

  return useQuery({
    queryKey: homeDashboardKeys.dashboard,
    queryFn: async (): Promise<HomeDashboardData> => {
      const today = clock.localDate();
      const sinceLocalDate = addDays(today, -STREAK_LOOKBACK_DAYS);
      const weekStart = currentWeekStart(today);

      const [trainingLocalDates, weeklySummary, lastSession, plans, recentRecords] =
        await Promise.all([
          homeDashboardRepository.getTrainingLocalDates(sinceLocalDate),
          homeDashboardRepository.getWeeklySummary(weekStart, today),
          homeDashboardRepository.getLastCompletedSession(),
          planService.listPlans(),
          recordService.listRecent(1),
        ]);

      const streak = calculateStreak(trainingLocalDates, today);
      const latestRecord = recentRecords[0] ?? null;

      let latestRecordExerciseName: string | null = null;
      if (latestRecord) {
        const exercise = await exerciseService.getById(latestRecord.exerciseId);
        latestRecordExerciseName = exercise
          ? formatExerciseName({
              nameEn: exercise.nameEn,
              namePl: exercise.namePl,
              displayNameOverride: exercise.userData.displayNameOverride,
            })
          : null;
      }

      const activePlanItem = plans.find((plan) => plan.isActive) ?? null;
      let activePlan: PlanAggregate | null = null;
      let suggestedDay: PlanDay | null = null;
      if (activePlanItem) {
        // Neither read depends on the other's result - both only need
        // `activePlanItem.id`, already known - so they run concurrently
        // rather than paying two sequential round trips.
        const [plan, lastCompletedPlanDayId] = await Promise.all([
          planService.getPlan(activePlanItem.id),
          homeDashboardRepository.getMostRecentCompletedPlanDayId(activePlanItem.id),
        ]);
        activePlan = plan;
        if (activePlan) {
          suggestedDay = nextSuggestedPlanDay(activePlan.days, lastCompletedPlanDayId);
        }
      }

      return {
        activePlan,
        suggestedDay,
        lastSession,
        streak,
        weeklySummary,
        latestRecord,
        latestRecordExerciseName,
      };
    },
  });
}
