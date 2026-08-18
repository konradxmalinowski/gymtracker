import { View } from 'react-native';

/**
 * Stand-in for `victory-native` (Victory Native XL) in tests. The real
 * library renders through `@shopify/react-native-skia`'s Canvas, which needs
 * a WASM `CanvasKit` runtime and a non-default Jest `testEnvironment` to run
 * at all under Node (the library's own `jestEnv.js`) - a heavyweight,
 * repo-wide test-infrastructure change for a single feature's charts, and
 * unnecessary here: `components/charts` (ADR-0010) is the *only* place in
 * the app that imports `victory-native` at all, so mocking it here is
 * sufficient to test every card/screen that composes a chart, without
 * needing to verify Skia's own pixel-level rendering (out of scope for this
 * app's own component tests, same as this project never testing Reanimated's
 * actual animation frames, only that the right worklet call happened).
 *
 * `CartesianChart` renders its `children` render-prop with a synthetic
 * `points`/`chartBounds` shape good enough for `Line`/`Bar` mocks below to
 * read a length from, so a test can assert "some data rendered" without
 * depending on Skia's real `PointsArray` internals.
 */
export function CartesianChart({
  data,
  children,
}: {
  data: readonly Record<string, unknown>[];
  children: (arg: {
    points: Record<string, readonly unknown[]>;
    chartBounds: { left: number; right: number; top: number; bottom: number };
  }) => React.ReactNode;
}) {
  const points = { value: data };
  const chartBounds = { left: 0, right: 100, top: 0, bottom: 100 };
  return <View testID="mock-cartesian-chart">{children({ points, chartBounds })}</View>;
}

export function Line({ points }: { points: readonly unknown[] }) {
  return <View testID="mock-line-chart" accessibilityLabel={`${points.length} points`} />;
}

export function Bar({ points }: { points: readonly unknown[] }) {
  return <View testID="mock-bar-chart" accessibilityLabel={`${points.length} points`} />;
}
