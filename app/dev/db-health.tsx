import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, ScrollView, View } from 'react-native';
import { Redirect } from 'expo-router';

import { Column, Row, Screen } from '@/components/layout';
import {
  Badge,
  Card,
  Divider,
  ListRow,
  Section,
  Surface,
  Text,
  type TextColor,
} from '@/components/ui';
import { ErrorState, Skeleton } from '@/components/feedback';
import {
  getDatabaseDiagnostics,
  type DatabaseDiagnostics,
  type LastMigration,
  type TableRowCount,
} from '@/database/diagnostics';
import { useContainer } from '@/services/container';
import { t } from '@/i18n';
import { space } from '@/theme/tokens';

/**
 * Dev-only database diagnostics screen - ADR-0014 part 2's "What exists
 * regardless of that decision" and ARCHITECTURE.md section 16's "Database
 * health" row.
 *
 * `__DEV__`-guard mechanism copied from `app/dev/gallery.tsx`: `__DEV__` is
 * replaced with a literal `true`/`false` at Metro bundle time, so in a
 * release build this evaluates to `false` unconditionally and the route is
 * never reachable - see gallery.tsx's header comment for the full rationale.
 */
export default function DbHealthScreen() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  return <DbHealthContent />;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; diagnostics: DatabaseDiagnostics };

function DbHealthContent() {
  const container = useContainer();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(() => {
    let cancelled = false;

    getDatabaseDiagnostics(container.db)
      .then((diagnostics) => {
        if (!cancelled) {
          setState({ status: 'ready', diagnostics });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        // Never a silent console log - a repository/diagnostics failure is
        // exactly the kind of thing this screen exists to surface (CLAUDE.md,
        // ADR-0014 part 2).
        container.logging.error('dbHealth.diagnosticsLoadFailed', { error: message });
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, [container]);

  useEffect(() => load(), [load, attempt]);

  useEffect(() => {
    if (state.status === 'loading') {
      AccessibilityInfo.announceForAccessibility(t('dbHealth.loadingLabel'));
    }
  }, [state.status]);

  const handleRetry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  return (
    <Screen scroll testID="db-health-screen">
      <Column gap={8} style={{ paddingVertical: space[6] }}>
        <Text variant="display" color="primary">
          {t('dbHealth.title')}
        </Text>
        <Text variant="body" color="secondary">
          {t('dbHealth.subtitle')}
        </Text>

        {state.status === 'loading' ? <LoadingSections /> : null}

        {state.status === 'error' ? (
          <Surface level={1} radius="lg">
            <ErrorState
              error={t('dbHealth.errorMessage', { detail: state.message })}
              onRetry={handleRetry}
              testID="db-health-error"
            />
          </Surface>
        ) : null}

        {state.status === 'ready' ? <DiagnosticsSections diagnostics={state.diagnostics} /> : null}
      </Column>
    </Screen>
  );
}

function LoadingSections() {
  return (
    <View testID="db-health-loading">
      <Column gap={8}>
        {[0, 1, 2].map((section) => (
          <Column gap={2} key={section}>
            <Skeleton width="40%" height={20} />
            <Skeleton width="100%" height={72} radius="lg" />
          </Column>
        ))}
      </Column>
    </View>
  );
}

function DiagnosticsSections({ diagnostics }: { diagnostics: DatabaseDiagnostics }) {
  const [compileOptionsExpanded, setCompileOptionsExpanded] = useState(false);
  const integrityOk = diagnostics.integrityCheck === 'ok';

  useEffect(() => {
    const problems: string[] = [];
    if (!integrityOk) {
      problems.push(`${t('dbHealth.integrityFailedLabel')}: ${diagnostics.integrityCheck}`);
    }
    if (!diagnostics.fts5Available) {
      problems.push(`${t('dbHealth.fts5Label')}: ${t('dbHealth.unavailable')}`);
    }
    if (!diagnostics.partialIndexAvailable) {
      problems.push(`${t('dbHealth.partialIndexLabel')}: ${t('dbHealth.unavailable')}`);
    }
    if (problems.length > 0) {
      AccessibilityInfo.announceForAccessibility(problems.join('. '));
    }
  }, [
    integrityOk,
    diagnostics.integrityCheck,
    diagnostics.fts5Available,
    diagnostics.partialIndexAvailable,
  ]);

  return (
    <Column gap={8}>
      <Section title={t('dbHealth.schemaSection')}>
        <Card variant="outlined">
          <Column gap={3}>
            <KeyValueRow
              label={t('dbHealth.schemaVersionLabel')}
              value={String(diagnostics.schemaVersion)}
            />
            <Divider />
            <LastMigrationBlock lastMigration={diagnostics.lastMigration} />
          </Column>
        </Card>
      </Section>

      <Section title={t('dbHealth.storageSection')}>
        <Card variant="outlined">
          <Column gap={3}>
            <KeyValueRow
              label={t('dbHealth.fileSizeLabel')}
              value={formatBytes(diagnostics.fileSizeBytes)}
            />
            <Divider />
            <IntegrityRow ok={integrityOk} detail={diagnostics.integrityCheck} />
          </Column>
        </Card>
      </Section>

      <Section
        title={t('dbHealth.tablesSection')}
        action={
          <Badge
            label={t('dbHealth.tableCount', { count: diagnostics.tableRowCounts.length })}
            tone="neutral"
          />
        }
      >
        <Surface level={1} radius="lg">
          {diagnostics.tableRowCounts.map((entry) => (
            <TableRow key={entry.table} entry={entry} />
          ))}
        </Surface>
      </Section>

      <Section title={t('dbHealth.engineSection')}>
        <Column gap={3}>
          <Card variant="outlined">
            <KeyValueRow
              label={t('dbHealth.sqliteVersionLabel')}
              value={diagnostics.sqliteVersion}
            />
          </Card>
          <CompileOptionsBlock
            options={diagnostics.compileOptions}
            expanded={compileOptionsExpanded}
            onToggle={() => setCompileOptionsExpanded((value) => !value)}
          />
        </Column>
      </Section>

      <Section title={t('dbHealth.capabilitiesSection')}>
        <Card variant="outlined">
          <Column gap={3}>
            <StatusRow label={t('dbHealth.fts5Label')} available={diagnostics.fts5Available} />
            <Divider />
            <StatusRow
              label={t('dbHealth.partialIndexLabel')}
              available={diagnostics.partialIndexAvailable}
            />
          </Column>
        </Card>
      </Section>
    </Column>
  );
}

/** A label/value pair announced as one accessible unit, mirroring StatTile's non-pressable pattern. */
function KeyValueRow({
  label,
  value,
  valueColor = 'primary',
}: {
  label: string;
  value: string;
  valueColor?: TextColor;
}) {
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={`${label}: ${value}`}>
      <Row justify="space-between" align="center">
        <Text variant="body" color="secondary">
          {label}
        </Text>
        <Text variant="numeric" color={valueColor}>
          {value}
        </Text>
      </Row>
    </View>
  );
}

function LastMigrationBlock({ lastMigration }: { lastMigration: LastMigration | null }) {
  if (!lastMigration) {
    return (
      <Text variant="body" color="tertiary">
        {t('dbHealth.lastMigrationNone')}
      </Text>
    );
  }

  const applied = formatTimestamp(lastMigration.appliedAt);
  const accessibilityLabel = t('dbHealth.lastMigrationAccessibilityLabel', {
    version: lastMigration.version,
    name: lastMigration.name,
    date: applied,
    appVersion: lastMigration.appVersion,
  });

  return (
    <View accessible accessibilityRole="text" accessibilityLabel={accessibilityLabel}>
      <Column gap={1}>
        <Text variant="body" color="secondary">
          {t('dbHealth.lastMigrationLabel')}
        </Text>
        <Text variant="bodyMedium" color="primary">
          {t('dbHealth.lastMigrationVersionName', {
            version: lastMigration.version,
            name: lastMigration.name,
          })}
        </Text>
        <Text variant="footnote" color="tertiary">
          {t('dbHealth.lastMigrationApplied', {
            date: applied,
            appVersion: lastMigration.appVersion,
          })}
        </Text>
      </Column>
    </View>
  );
}

function IntegrityRow({ ok, detail }: { ok: boolean; detail: string }) {
  const statusLabel = ok ? t('dbHealth.integrityOk') : t('dbHealth.integrityFailedLabel');
  const accessibilityLabel = ok
    ? `${t('dbHealth.integrityLabel')}: ${statusLabel}`
    : `${t('dbHealth.integrityLabel')}: ${statusLabel} - ${detail}`;

  return (
    <View
      accessible
      accessibilityRole={ok ? 'text' : 'alert'}
      accessibilityLabel={accessibilityLabel}
    >
      <Column gap={2}>
        <Row justify="space-between" align="center">
          <Text variant="body" color="secondary">
            {t('dbHealth.integrityLabel')}
          </Text>
          <Badge label={statusLabel} tone={ok ? 'success' : 'danger'} />
        </Row>
        {!ok ? (
          <Text variant="footnote" color="danger">
            {detail}
          </Text>
        ) : null}
      </Column>
    </View>
  );
}

function StatusRow({ label, available }: { label: string; available: boolean }) {
  const statusLabel = available ? t('dbHealth.available') : t('dbHealth.unavailable');

  return (
    <View
      accessible
      accessibilityRole={available ? 'text' : 'alert'}
      accessibilityLabel={`${label}: ${statusLabel}`}
    >
      <Row justify="space-between" align="center">
        <Text variant="body" color="secondary">
          {label}
        </Text>
        <Badge label={statusLabel} tone={available ? 'success' : 'danger'} />
      </Row>
    </View>
  );
}

function TableRow({ entry }: { entry: TableRowCount }) {
  const rowCountLabel = t('dbHealth.rowCount', { count: entry.rowCount });

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${entry.table}, ${rowCountLabel}`}
    >
      <ListRow
        title={entry.table}
        trailing={
          <Text variant="numeric" color="secondary">
            {rowCountLabel}
          </Text>
        }
      />
    </View>
  );
}

function CompileOptionsBlock({
  options,
  expanded,
  onToggle,
}: {
  options: readonly string[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Column gap={2}>
      <Surface level={1} radius="lg">
        <ListRow
          title={t('dbHealth.compileOptionsLabel')}
          subtitle={t('dbHealth.compileOptionsCount', { count: options.length })}
          onPress={onToggle}
          showChevron
          testID="db-health-compile-options-toggle"
        />
      </Surface>
      {expanded ? (
        <Surface level={1} radius="lg" style={{ maxHeight: 220 }}>
          <ScrollView>
            <Column gap={1} style={{ padding: space[3] }}>
              {options.map((option) => (
                <Text key={option} variant="footnote" color="secondary">
                  {option}
                </Text>
              ))}
            </Column>
          </ScrollView>
        </Surface>
      ) : null}
    </Column>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(kb < 10 ? 2 : 1)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 2 : 1)} MB`;
}

function formatTimestamp(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
