import { useQuery } from '@tanstack/react-query';

import { computeDayIntensities, type DayIntensity } from '../domain/intensityBinning';
import { generateDateRange } from '../domain/localDate';
import type { CalendarRepository } from '../repository/CalendarRepository';

import { calendarKeys } from './calendarKeys';

/**
 * Composes `calendarRepository.yearOverview` with a full-year
 * `generateDateRange('${year}-01-01', '${year}-12-31')` gap-fill and
 * `computeDayIntensities` into one `DayIntensity[]` for the compact year
 * view - the exact shape `HeatmapView` already consumes (P11's
 * `useStatisticsDashboard`'s `yearlyHeatmap` composes the same three pieces
 * for the Stats tab's own yearly heatmap; this is that same composition over
 * this feature's own read model, per `CalendarRepository.ts`'s header
 * comment: `calendar` never depends on `statistics`).
 *
 * `calendarRepository` is a parameter, not an internal `useContainer()` call
 * - see `useCalendarMonth`'s doc comment for the `import/no-cycle` reasoning
 * this mirrors exactly.
 */
export function useCalendarYear(calendarRepository: CalendarRepository, year: number) {
  return useQuery({
    queryKey: calendarKeys.year(year),
    queryFn: async (): Promise<DayIntensity[]> => {
      const rows = await calendarRepository.yearOverview(year);
      const allDates = generateDateRange(`${year}-01-01`, `${year}-12-31`);
      return computeDayIntensities(rows, allDates);
    },
  });
}
