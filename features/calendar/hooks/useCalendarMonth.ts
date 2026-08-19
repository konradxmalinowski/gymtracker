import { useQuery } from '@tanstack/react-query';

import type { EntityId } from '@/repositories/contracts/repository';

import {
  computeDayIntensities,
  type DailyVolumePoint,
  type HeatmapLevel,
} from '../domain/intensityBinning';
import { generateMonthGrid } from '../domain/monthGrid';
import type { CalendarRepository } from '../repository/CalendarRepository';

import { calendarKeys } from './calendarKeys';

/**
 * One gap-filled day cell for the month grid - `generateMonthGrid`'s
 * `CalendarDayCell` (`localDate`/`isCurrentMonth`) plus this day's
 * `CalendarDayDto` fields (defaulted to "untrained" - zero volume, no
 * sessions - when the repository has no row for it) and its quartile-binned
 * `level`. `sessionIds`/`planDayNames` stay index-aligned exactly as
 * `CalendarDayDto` documents.
 */
export interface CalendarMonthDayCell {
  localDate: string;
  isCurrentMonth: boolean;
  level: HeatmapLevel;
  totalVolumeKg: number;
  sessionIds: EntityId[];
  planDayNames: (string | null)[];
}

/**
 * Composes `generateMonthGrid` (pure, no query) with
 * `calendarRepository.monthOverview` and `computeDayIntensities` into one
 * gap-free grid of `CalendarMonthDayCell`s - the screen sees a single
 * `isPending`/`isError`/`refetch` rather than juggling the grid and the
 * repository read separately, the same "one query per composed view"
 * acceptance criterion P10's `useHomeDashboard`/P11's
 * `useStatisticsDashboard` already established.
 *
 * `calendarRepository` is taken as a parameter rather than resolved via an
 * internal `useContainer()` call: this hook is barrel-exported
 * (`features/calendar/index.ts`), and `services/container.ts` imports that
 * same barrel to build `AppContainer` - a `useContainer()` call inside this
 * file would close a real `barrel -> hook -> container -> barrel` cycle
 * (`import/no-cycle`), the exact failure mode
 * `useCurrentRecords(recordService, ...)`/`useHomeDashboard(deps)` already
 * document and avoid the same way. `CalendarScreen.tsx` calls
 * `useContainer()` itself and passes `calendarRepository` in.
 *
 * Intensity is computed only over the month's own days
 * (`cell.isCurrentMonth`) - `computeDayIntensities`'s quartile thresholds are
 * meant to reflect this month's own trained-day spread, not skewed by a
 * leading/trailing filler day borrowed from an adjacent month purely for
 * grid-filling purposes.
 */
export function useCalendarMonth(
  calendarRepository: CalendarRepository,
  year: number,
  month: number,
) {
  return useQuery({
    queryKey: calendarKeys.month(year, month),
    queryFn: async (): Promise<CalendarMonthDayCell[]> => {
      const grid = generateMonthGrid(year, month);
      const dayRows = await calendarRepository.monthOverview(year, month);
      const dayRowByDate = new Map(dayRows.map((row) => [row.localDate, row]));

      const currentMonthDates = grid
        .filter((cell) => cell.isCurrentMonth)
        .map((cell) => cell.localDate);
      const volumePoints: DailyVolumePoint[] = dayRows.map((row) => ({
        localDate: row.localDate,
        totalVolumeKg: row.totalVolumeKg,
      }));
      const intensityByDate = new Map(
        computeDayIntensities(volumePoints, currentMonthDates).map((day) => [
          day.localDate,
          day.level,
        ]),
      );

      return grid.map((cell) => {
        const row = dayRowByDate.get(cell.localDate);
        return {
          localDate: cell.localDate,
          isCurrentMonth: cell.isCurrentMonth,
          level: intensityByDate.get(cell.localDate) ?? 0,
          totalVolumeKg: row?.totalVolumeKg ?? 0,
          sessionIds: row?.sessionIds ?? [],
          planDayNames: row?.planDayNames ?? [],
        };
      });
    },
  });
}
