import { fireEvent, render } from '@testing-library/react-native';

import { ActivePlanCard } from '@/features/home/components/ActivePlanCard';
import type { PlanAggregate, PlanDay } from '@/features/plans';

jest.mock('@expo/vector-icons', () => require('../../../__mocks__/vectorIconsMock'));

function makeDay(overrides: Partial<PlanDay> = {}): PlanDay {
  return {
    id: 'day-1',
    planId: 'plan-1',
    name: 'Push Day',
    note: null,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    exercises: [],
    ...overrides,
  };
}

function makePlan(overrides: Partial<PlanAggregate> = {}): PlanAggregate {
  return {
    id: 'plan-1',
    name: 'Push Pull Legs',
    description: null,
    color: null,
    isActive: true,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    days: [makeDay()],
    ...overrides,
  };
}

function baseProps() {
  return {
    onStart: jest.fn(),
    onChangeDay: jest.fn(),
    onOpenPlan: jest.fn(),
    onGoToPlans: jest.fn(),
    testID: 'active-plan-card',
  };
}

describe('ActivePlanCard', () => {
  it('renders the no-active-plan empty state and fires onGoToPlans', async () => {
    const props = baseProps();
    const { findByTestId, findByText } = await render(
      <ActivePlanCard activePlan={null} suggestedDay={null} {...props} />,
    );

    expect(await findByTestId('active-plan-card-empty')).toBeTruthy();
    fireEvent.press(await findByText('Go to Plans'));
    expect(props.onGoToPlans).toHaveBeenCalledTimes(1);
  });

  it('renders the no-days message for an active plan with zero days, and fires onOpenPlan', async () => {
    const props = baseProps();
    const plan = makePlan({ name: 'Push Pull Legs', days: [] });
    const { findByText } = await render(
      <ActivePlanCard activePlan={plan} suggestedDay={null} {...props} />,
    );

    expect(await findByText('Push Pull Legs')).toBeTruthy();
    expect(await findByText('Push Pull Legs has no days yet.')).toBeTruthy();

    fireEvent.press(await findByText('Open plan'));
    expect(props.onOpenPlan).toHaveBeenCalledWith('plan-1');
  });

  it('renders the suggested day and fires onStart with its id', async () => {
    const props = baseProps();
    const day = makeDay({ id: 'day-suggested', name: 'Leg Day' });
    const plan = makePlan({ days: [day] });
    const { findByText, findByTestId } = await render(
      <ActivePlanCard activePlan={plan} suggestedDay={day} {...props} />,
    );

    expect(await findByText('Next up: Leg Day')).toBeTruthy();
    fireEvent.press(await findByTestId('active-plan-card-start-button'));
    expect(props.onStart).toHaveBeenCalledWith('day-suggested');
  });

  it('hides the change-day action for a single-day plan', async () => {
    const props = baseProps();
    const day = makeDay();
    const plan = makePlan({ days: [day] });
    const { queryByTestId, findByTestId } = await render(
      <ActivePlanCard activePlan={plan} suggestedDay={day} {...props} />,
    );

    await findByTestId('active-plan-card-start-button');
    expect(queryByTestId('active-plan-card-change-day-button')).toBeNull();
  });

  it('shows the change-day action for a multi-day plan and fires onChangeDay with the plan id', async () => {
    const props = baseProps();
    const day = makeDay({ id: 'day-1' });
    const plan = makePlan({
      id: 'plan-multi',
      days: [day, makeDay({ id: 'day-2', sortOrder: 1 })],
    });
    const { findByTestId } = await render(
      <ActivePlanCard activePlan={plan} suggestedDay={day} {...props} />,
    );

    fireEvent.press(await findByTestId('active-plan-card-change-day-button'));
    expect(props.onChangeDay).toHaveBeenCalledWith('plan-multi');
  });

  it('marks the start button busy while isStarting is true', async () => {
    const props = baseProps();
    const day = makeDay();
    const plan = makePlan({ days: [day] });
    const { findByTestId } = await render(
      <ActivePlanCard activePlan={plan} suggestedDay={day} isStarting {...props} />,
    );

    const startButton = await findByTestId('active-plan-card-start-button');
    expect(startButton.props.accessibilityState?.busy).toBe(true);
  });
});
