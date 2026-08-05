import { useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  Divider,
  IconButton,
  ListRow,
  NumberField,
  ProgressRing,
  SegmentedControl,
  Section,
  Slider,
  StatTile,
  StepperField,
  Surface,
  Switch,
  Text,
  TextField,
} from '@/components/ui';
import {
  BottomSheet,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Skeleton,
  Toast,
  UndoToast,
} from '@/components/feedback';
import { DraggableList, SwipeableRow } from '@/components/gestures';
import { color, space } from '@/theme/tokens';

/**
 * Dev-only component review surface (ARCHITECTURE.md section 11's "gallery
 * route" - purpose specified there, production-exclusion mechanism is this
 * phase's own call to make).
 *
 * Mechanism: a runtime `__DEV__` guard that redirects home. `__DEV__` is a
 * global React Native/Metro replaces with a literal `true`/`false` at bundle
 * time (not an env var read at runtime), so in a release build this
 * evaluates to `false` unconditionally and the route is never reachable -
 * there is no path in the app that links to `/dev/gallery`, so "unreachable"
 * here means genuinely inert, not just hidden from a menu. This does not
 * remove the gallery's own JSX from the production JS bundle (Metro doesn't
 * tree-shake across a runtime conditional the way a bundler with static
 * dead-code elimination would), but the components it renders are the same
 * `components/ui`/`components/feedback`/`components/gestures` primitives
 * real feature screens need anyway - the marginal bundle cost of this file
 * itself is a few KB of screen-composition code, not a second copy of the
 * design system. A build-time route-exclusion (e.g. stripping `app/dev/`
 * from the production route manifest) would be strictly better and is a
 * reasonable follow-up once a feature phase's screens exist to compare
 * against, but isn't necessary for this phase's "must not ship" bar.
 */
export default function GalleryScreen() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  return <GalleryContent />;
}

function GalleryContent() {
  const [textValue, setTextValue] = useState('');
  const [textError, setTextError] = useState('');
  const [numberValue, setNumberValue] = useState<number | null>(42.5);
  const [stepperValue, setStepperValue] = useState<number | null>(60);
  const [switchOn, setSwitchOn] = useState(true);
  const [checked, setChecked] = useState(true);
  const [sliderValue, setSliderValue] = useState(0.4);
  const [segment, setSegment] = useState<'day' | 'week' | 'month'>('week');
  const [chipSelected, setChipSelected] = useState(true);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [undoToastVisible, setUndoToastVisible] = useState(false);
  const [draggableData, setDraggableData] = useState([
    { id: '1', label: 'Bench press' },
    { id: '2', label: 'Squat' },
    { id: '3', label: 'Deadlift' },
  ]);
  const [draggableHandleData, setDraggableHandleData] = useState([
    { id: '1', label: 'Bench press' },
    { id: '2', label: 'Squat' },
    { id: '3', label: 'Deadlift' },
  ]);

  return (
    <Screen scroll testID="gallery-screen">
      <Column gap={8} style={{ paddingVertical: space[6] }}>
        <Text variant="display" color="primary">
          Component gallery
        </Text>
        <Text variant="body" color="secondary">
          Every P1 primitive, every documented variant and state. Dev-only - see this file&apos;s
          header for why it never ships.
        </Text>

        <Section title="Text">
          <Column gap={1}>
            <Text variant="display">Display</Text>
            <Text variant="title1">Title 1</Text>
            <Text variant="title2">Title 2</Text>
            <Text variant="title3">Title 3</Text>
            <Text variant="body">Body</Text>
            <Text variant="bodyMedium">Body medium</Text>
            <Text variant="callout">Callout</Text>
            <Text variant="subhead">Subhead</Text>
            <Text variant="footnote">Footnote</Text>
            <Text variant="caption">Caption</Text>
            <Text variant="numeric">1234.5 numeric</Text>
            <Text variant="numericLarge">98.5 numericLarge</Text>
            <Text variant="label">LABEL</Text>
            <Text variant="body" numberOfLines={1} style={{ maxWidth: 200 }}>
              A deliberately long line of text to demonstrate truncation behavior or wrapping
            </Text>
          </Column>
        </Section>

        <Section title="Button">
          <Column gap={3}>
            {(['primary', 'secondary', 'ghost', 'destructive'] as const).map((variant) => (
              <Row key={variant} gap={3} wrap align="center">
                <StateLabel label={variant} />
                <Button variant={variant} label="Default" onPress={() => {}} />
                <Button variant={variant} label="Loading" loading onPress={() => {}} />
                <Button variant={variant} label="Disabled" disabled onPress={() => {}} />
              </Row>
            ))}
            <Row gap={3} align="center">
              <StateLabel label="pressed (static preview)" />
              <View
                style={{
                  height: 44,
                  paddingHorizontal: space[4],
                  borderRadius: 12,
                  backgroundColor: color.accentPressed,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text color="inverse">Pressed</Text>
              </View>
            </Row>
          </Column>
        </Section>

        <Section title="IconButton">
          <Row gap={3} align="center">
            <IconButton icon={<Text>+</Text>} accessibilityLabel="Add" onPress={() => {}} />
            <IconButton icon={<Text>+</Text>} accessibilityLabel="Add" loading onPress={() => {}} />
            <IconButton
              icon={<Text>+</Text>}
              accessibilityLabel="Add"
              disabled
              onPress={() => {}}
            />
            <IconButton
              icon={<Text>*</Text>}
              accessibilityLabel="Favorite"
              variant="accent"
              onPress={() => {}}
            />
          </Row>
        </Section>

        <Section title="Chip">
          <Row gap={2} wrap align="center">
            <Chip label="Default" onPress={() => {}} />
            <Chip
              label="Selected"
              selected={chipSelected}
              onPress={() => setChipSelected((v) => !v)}
            />
            <Chip label="Disabled" disabled onPress={() => {}} />
            <Chip label="Removable" onRemove={() => {}} />
          </Row>
        </Section>

        <Section title="SegmentedControl">
          <SegmentedControl
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
            value={segment}
            onChange={setSegment}
          />
        </Section>

        <Section title="Card / Surface">
          <Column gap={3}>
            <Card variant="default">
              <Text>Default card</Text>
            </Card>
            <Card variant="elevated">
              <Text>Elevated card</Text>
            </Card>
            <Card variant="outlined">
              <Text>Outlined card</Text>
            </Card>
            <Card variant="default" disabled>
              <Text>Disabled card</Text>
            </Card>
            <Card variant="default" onPress={() => {}} accessibilityLabel="Pressable card">
              <Text>Pressable card</Text>
            </Card>
            <Row gap={2}>
              {[0, 1, 2, 3].map((level) => (
                <Surface key={level} level={level as 0 | 1 | 2 | 3} radius="md" padding={3}>
                  <Text variant="caption">L{level}</Text>
                </Surface>
              ))}
            </Row>
          </Column>
        </Section>

        <Section title="ListRow">
          <Surface level={1} radius="lg">
            <ListRow
              title="Default row"
              subtitle="With a subtitle"
              onPress={() => {}}
              showChevron
            />
            <ListRow
              title="Disabled row"
              subtitle="Cannot be pressed"
              onPress={() => {}}
              disabled
            />
            <ListRow title="Destructive row" onPress={() => {}} destructive />
            <ListRow title="No action" subtitle="Not pressable" />
          </Surface>
        </Section>

        <Section title="TextField">
          <Column gap={3}>
            <TextField
              label="Default"
              value={textValue}
              onChangeText={setTextValue}
              placeholder="Type here"
            />
            <TextField
              label="With error"
              value={textError}
              onChangeText={setTextError}
              error="This field is required"
            />
            <TextField label="Disabled" value="Locked value" onChangeText={() => {}} disabled />
            <TextField
              label="With helper"
              value=""
              onChangeText={() => {}}
              helper="Helper text goes here"
            />
          </Column>
        </Section>

        <Section title="NumberField / StepperField">
          <Column gap={3}>
            <NumberField
              value={numberValue}
              onChange={setNumberValue}
              min={0}
              max={500}
              precision={1}
              unitSuffix="kg"
              accessibilityLabel="Weight"
            />
            <NumberField
              value={null}
              onChange={() => {}}
              accessibilityLabel="Empty field"
              min={0}
              max={10}
            />
            <NumberField
              value={10}
              onChange={() => {}}
              min={0}
              max={10}
              disabled
              accessibilityLabel="Disabled field"
            />
            <StepperField
              value={stepperValue}
              onChange={setStepperValue}
              min={0}
              max={300}
              step={5}
              unitSuffix="s"
              accessibilityLabel="Rest duration"
            />
          </Column>
        </Section>

        <Section title="Switch / Checkbox / Slider">
          <Column gap={3}>
            <Row gap={3} align="center">
              <Switch
                value={switchOn}
                onValueChange={setSwitchOn}
                accessibilityLabel="Enable haptics"
              />
              <Switch
                value={false}
                onValueChange={() => {}}
                disabled
                accessibilityLabel="Disabled switch"
              />
            </Row>
            <Row gap={3} align="center">
              <Checkbox
                value={checked}
                onValueChange={setChecked}
                accessibilityLabel="Accept terms"
              />
              <Checkbox
                value={false}
                onValueChange={() => {}}
                disabled
                accessibilityLabel="Disabled checkbox"
              />
            </Row>
            <Slider
              value={sliderValue}
              onValueChange={setSliderValue}
              accessibilityLabel="Volume"
            />
          </Column>
        </Section>

        <Section title="Avatar / Badge">
          <Column gap={3}>
            <Row gap={3} align="center">
              <Avatar name="Konrad Malinowski" size="sm" />
              <Avatar name="Konrad Malinowski" size="md" editable onPress={() => {}} />
              <Avatar name="Konrad Malinowski" size="lg" />
            </Row>
            <Row gap={2} wrap>
              <Badge label="Neutral" tone="neutral" />
              <Badge label="Accent" tone="accent" />
              <Badge label="Success" tone="success" />
              <Badge label="Warning" tone="warning" />
              <Badge label="Danger" tone="danger" />
            </Row>
          </Column>
        </Section>

        <Section title="StatTile / ProgressRing">
          <Column gap={3}>
            <Row gap={3} wrap>
              <StatTile label="Volume" value={12450} unit="kg" delta="+8%" trend="up" />
              <StatTile label="Sessions" value={4} delta="-1" trend="down" onPress={() => {}} />
              <StatTile label="Streak" value={12} unit="days" trend="flat" delta="0" />
            </Row>
            <Row gap={4} align="center">
              <ProgressRing progress={0.65} size={64} strokeWidth={8}>
                <Text variant="caption">65%</Text>
              </ProgressRing>
              <ProgressRing progress={0} size={64} strokeWidth={8} />
              <ProgressRing progress={1} size={64} strokeWidth={8} color={color.success} />
            </Row>
          </Column>
        </Section>

        <Section title="Divider / Spacer / Section">
          <Column gap={2}>
            <Text>Above divider</Text>
            <Divider />
            <Text>Below divider</Text>
          </Column>
        </Section>

        <Section title="Skeleton">
          <Column gap={2}>
            <Skeleton width="80%" height={16} />
            <Skeleton width="60%" height={16} />
            <Skeleton width={64} height={64} radius="full" />
          </Column>
        </Section>

        <Section title="EmptyState / ErrorState">
          <Column gap={4}>
            <Surface level={1} radius="lg">
              <EmptyState
                title="No workouts yet"
                message="Start your first session to see it here."
                actionLabel="Start workout"
                onAction={() => {}}
              />
            </Surface>
            <Surface level={1} radius="lg">
              <ErrorState error="Could not load your workout history." onRetry={() => {}} />
            </Surface>
          </Column>
        </Section>

        <Section title="ConfirmDialog">
          <Button label="Open confirm dialog" onPress={() => setConfirmVisible(true)} />
          <ConfirmDialog
            visible={confirmVisible}
            title="Delete workout?"
            message="This cannot be undone."
            destructive
            onConfirm={() => setConfirmVisible(false)}
            onCancel={() => setConfirmVisible(false)}
          />
        </Section>

        <Section title="BottomSheet">
          <Button label="Open sheet" onPress={() => setSheetVisible(true)} />
          <BottomSheet visible={sheetVisible} onDismiss={() => setSheetVisible(false)}>
            <Text variant="title3">Sheet content</Text>
            <Text color="secondary">Drag down or tap the backdrop to dismiss.</Text>
          </BottomSheet>
        </Section>

        <Section title="Toast / UndoToast">
          <Row gap={3} wrap>
            <Button label="Show toast" onPress={() => setToastVisible(true)} />
            <Button label="Show undo toast" onPress={() => setUndoToastVisible(true)} />
          </Row>
          {toastVisible ? (
            <Toast message="Set logged" onDismiss={() => setToastVisible(false)} />
          ) : null}
          {undoToastVisible ? (
            <UndoToast
              message="Set deleted"
              onAction={() => setUndoToastVisible(false)}
              onDismiss={() => setUndoToastVisible(false)}
            />
          ) : null}
        </Section>

        <Section title="SwipeableRow">
          <Surface level={1} radius="lg">
            <SwipeableRow
              leftAction={{
                icon: <Text color="inverse">Done</Text>,
                label: 'Complete',
                color: color.success,
                onTrigger: () => {},
              }}
              rightAction={{
                icon: <Text color="inverse">Delete</Text>,
                label: 'Delete',
                color: color.danger,
                onTrigger: () => {},
              }}
            >
              <ListRow title="Swipe me left or right" subtitle="Reveals an action on each side" />
            </SwipeableRow>
          </Surface>
        </Section>

        <Section title="DraggableList">
          <Column gap={3}>
            <Text variant="label" color="tertiary">
              dragHandle=&quot;row&quot; (default) - long-press anywhere on the row
            </Text>
            <Surface level={1} radius="lg" style={{ height: 3 * 56 }}>
              <DraggableList
                data={draggableData}
                keyExtractor={(item) => item.id}
                rowHeight={56}
                onReorder={(orderedIds) => {
                  const byId = new Map(draggableData.map((item) => [item.id, item]));
                  setDraggableData(
                    orderedIds
                      .map((id) => byId.get(id))
                      .filter((item): item is (typeof draggableData)[number] => item !== undefined),
                  );
                }}
                renderItem={(item) => (
                  <View
                    style={{ height: 56, justifyContent: 'center', paddingHorizontal: space[4] }}
                  >
                    <Text>{item.label}</Text>
                  </View>
                )}
              />
            </Surface>

            <Text variant="label" color="tertiary">
              dragHandle=&quot;handle&quot; - drag only from the grip glyph
            </Text>
            <Surface level={1} radius="lg" style={{ height: 3 * 56 }}>
              <DraggableList
                data={draggableHandleData}
                dragHandle="handle"
                keyExtractor={(item) => item.id}
                rowHeight={56}
                onReorder={(orderedIds) => {
                  const byId = new Map(draggableHandleData.map((item) => [item.id, item]));
                  setDraggableHandleData(
                    orderedIds
                      .map((id) => byId.get(id))
                      .filter(
                        (item): item is (typeof draggableHandleData)[number] => item !== undefined,
                      ),
                  );
                }}
                renderItem={(item, _index, handle) => (
                  <Row align="center" style={{ height: 56, paddingHorizontal: space[4] }}>
                    <Text style={{ flex: 1 }}>{item.label}</Text>
                    {handle}
                  </Row>
                )}
              />
            </Surface>
          </Column>
        </Section>
      </Column>
    </Screen>
  );
}

function StateLabel({ label }: { label: string }) {
  return (
    <Text variant="label" color="tertiary" style={{ width: 90 }}>
      {label}
    </Text>
  );
}
