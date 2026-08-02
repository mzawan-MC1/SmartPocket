'use client';

import React from 'react';
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import type {
  FullFinancialReportPdfSnapshot,
  ReportPdfMetric,
  ReportPdfSnapshot,
  ReportPdfTable,
  StandardReportPdfSection,
  StandardReportPdfSnapshot,
} from './report-pdf-types';

const reportPdfFontUrl = new URL(
  '../../../../../node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf',
  import.meta.url
).toString();

let pdfFontsRegistered = false;

function ensurePdfFontsRegistered() {
  if (pdfFontsRegistered) return;

  Font.register({
    family: 'SmartPocketPdf',
    src: reportPdfFontUrl,
    fontStyle: 'normal',
    fontWeight: 400,
  });

  pdfFontsRegistered = true;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingBottom: 38,
    paddingHorizontal: 30,
    fontFamily: 'SmartPocketPdf',
    fontSize: 9,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    lineHeight: 1.35,
  },
  header: {
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 10,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerBrand: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    flexGrow: 1,
    flexShrink: 1,
  },
  logo: {
    width: 28,
    height: 28,
    objectFit: 'contain',
  },
  brandEyebrow: {
    fontSize: 8,
    color: '#64748b',
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 9,
    color: '#475569',
    marginTop: 2,
  },
  identityCard: {
    minWidth: 138,
    maxWidth: 200,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 9,
    backgroundColor: '#f8fafc',
  },
  identityLabel: {
    fontSize: 7,
    color: '#64748b',
    marginBottom: 4,
  },
  identityName: {
    fontSize: 9,
    fontWeight: 700,
  },
  identityMeta: {
    fontSize: 8,
    color: '#475569',
    marginTop: 2,
  },
  metaWrap: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaItem: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 7,
    backgroundColor: '#f8fafc',
    minWidth: '31%',
    maxWidth: '48%',
    flexGrow: 1,
  },
  metaLabel: {
    fontSize: 7,
    color: '#64748b',
  },
  metaValue: {
    fontSize: 8.5,
    color: '#0f172a',
    marginTop: 2,
  },
  section: {
    marginTop: 10,
  },
  sectionHeader: {
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
  },
  sectionDescription: {
    fontSize: 8,
    color: '#475569',
    marginTop: 2,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metricCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 8,
    backgroundColor: '#f8fafc',
  },
  metricLabel: {
    fontSize: 7,
    color: '#64748b',
  },
  metricValue: {
    fontSize: 10,
    fontWeight: 700,
    marginTop: 3,
  },
  metricHelper: {
    fontSize: 7.5,
    color: '#475569',
    marginTop: 3,
  },
  positive: {
    color: '#15803d',
  },
  negative: {
    color: '#b91c1c',
  },
  neutral: {
    color: '#0f172a',
  },
  paragraph: {
    fontSize: 8.5,
    color: '#0f172a',
    marginTop: 4,
  },
  inlineNote: {
    fontSize: 8,
    color: '#475569',
    marginTop: 4,
  },
  emptyMessage: {
    marginTop: 4,
    fontSize: 8,
    color: '#64748b',
  },
  tableGroup: {
    marginTop: 6,
  },
  tableTitle: {
    fontSize: 9,
    fontWeight: 700,
  },
  tableDescription: {
    fontSize: 7.5,
    color: '#475569',
    marginTop: 2,
    marginBottom: 3,
  },
  table: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 3,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 5,
  },
  tableHeaderCell: {
    fontSize: 7,
    color: '#64748b',
    paddingHorizontal: 6,
    fontWeight: 700,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 5,
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  tableCell: {
    fontSize: 8,
    color: '#0f172a',
    paddingHorizontal: 6,
  },
  tableCellSecondary: {
    fontSize: 7.25,
    color: '#475569',
    marginTop: 2,
  },
  footer: {
    position: 'absolute',
    left: 30,
    right: 30,
    bottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 7.5,
    color: '#64748b',
  },
  rtlText: {
    textAlign: 'right',
  },
  rtlRow: {
    flexDirection: 'row-reverse',
  },
});

function mergeStyles(...items: Array<unknown>) {
  return items.filter((item) => item !== undefined) as any[];
}

function splitDisplayValue(value: string | null | undefined) {
  if (!value) return ['—'];

  const parts = value
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return [value];
  }

  return Array.from(new Set(parts));
}

function isMeaningfulValue(value: string | null | undefined) {
  const normalized = (value || '').trim();
  if (!normalized || normalized === '—' || normalized === '-') return false;
  if (/^(0|0\.0+)\s*$/.test(normalized)) return false;
  if (/^[A-Z]{3}\s0(?:\.0+)?$/.test(normalized)) return false;
  return true;
}

function getCellWidth(columnCount: number, index: number) {
  if (columnCount <= 2) return index === 0 ? '50%' : '50%';
  if (columnCount === 3) return index === 0 ? '40%' : '30%';
  if (columnCount === 4) return index === 0 ? '34%' : '22%';
  if (columnCount === 5) return index === 0 ? '28%' : '18%';
  if (columnCount === 6) return index === 0 ? '22%' : index === 1 ? '22%' : '14%';
  return index === 0 ? '22%' : index === 1 ? '18%' : `${Math.max(10, Math.floor(60 / Math.max(1, columnCount - 2)))}%`;
}

function isAmountLike(header: string, value: string) {
  if (/(amount|total|balance|income|expense|net|spent|remaining|receivable|payable|loan|credit|debit|budget|progress|equivalent)/i.test(header)) {
    return true;
  }

  return /(^|[\s(])[-+]?(\p{Sc}|[A-Z]{3}\s)?\d[\d,.\s]*%?$/u.test(value.trim());
}

function chunkRows(rows: string[][], size: number) {
  const chunks: string[][][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function renderInlineValue(value: string, tone: ReportPdfMetric['tone']) {
  const parts = splitDisplayValue(value);
  return (
    <View>
      <Text style={[
        styles.metricValue,
        tone === 'positive' ? styles.positive : tone === 'negative' ? styles.negative : styles.neutral,
      ]}>
        {parts[0]}
      </Text>
      {parts.slice(1).map((part) => (
        <Text key={`${value}-${part}`} style={styles.metricHelper}>
          {part}
        </Text>
      ))}
    </View>
  );
}

function PdfMetricGrid({ items }: { items: ReportPdfMetric[] }) {
  return (
    <View style={styles.metricsGrid}>
      {items.map((item) => (
        <View key={`${item.label}-${item.value}`} style={styles.metricCard} wrap={false}>
          <Text style={styles.metricLabel}>{item.label}</Text>
          {renderInlineValue(item.value, item.tone)}
          {item.helper ? (
            <Text style={styles.metricHelper}>{item.helper}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function PdfTable({ table, rtl = false }: { table: ReportPdfTable; rtl?: boolean }) {
  if (table.rows.length === 0) {
    return <Text style={styles.emptyMessage}>{table.emptyMessage}</Text>;
  }

  const chunkSize = table.headers.length >= 6 ? 18 : table.compact ? 24 : 20;
  const chunks = chunkRows(table.rows, chunkSize);

  return (
    <View style={styles.tableGroup}>
      {table.title ? <Text style={mergeStyles(styles.tableTitle, rtl ? styles.rtlText : undefined)}>{table.title}</Text> : null}
      {table.description ? <Text style={mergeStyles(styles.tableDescription, rtl ? styles.rtlText : undefined)}>{table.description}</Text> : null}
      {chunks.map((rows, chunkIndex) => (
        <View key={`${table.title || 'table'}-${chunkIndex}`} style={styles.table} wrap={false}>
          <View style={mergeStyles(styles.tableHeader, rtl ? styles.rtlRow : undefined)}>
            {table.headers.map((header, index) => (
              <Text
                key={`${header}-${index}`}
                style={[
                  styles.tableHeaderCell,
                  {
                    width: getCellWidth(table.headers.length, index),
                    textAlign: rtl ? 'right' : 'left',
                  },
                ]}
              >
                {header}
              </Text>
            ))}
          </View>
          {rows.map((row, rowIndex) => (
            <View
              key={`${table.title || 'row'}-${chunkIndex}-${rowIndex}`}
              style={mergeStyles(
                styles.tableRow,
                rtl ? styles.rtlRow : undefined,
                rowIndex === rows.length - 1 ? styles.tableRowLast : undefined,
              )}
            >
              {row.map((cell, cellIndex) => {
                const parts = splitDisplayValue(cell || '—');
                const header = table.headers[cellIndex] || '';
                return (
                  <View
                    key={`${cell}-${cellIndex}`}
                    style={{
                      width: getCellWidth(table.headers.length, cellIndex),
                      paddingHorizontal: 0,
                    }}
                  >
                    <Text
                      style={[
                        styles.tableCell,
                        {
                          textAlign: isAmountLike(header, parts[0]) ? 'right' : rtl ? 'right' : 'left',
                        },
                      ]}
                    >
                      {parts[0]}
                    </Text>
                    {parts.slice(1).map((part) => (
                      <Text
                        key={`${cell}-${part}`}
                        style={[
                          styles.tableCellSecondary,
                          {
                            textAlign: isAmountLike(header, part) ? 'right' : rtl ? 'right' : 'left',
                            paddingHorizontal: 6,
                          },
                        ]}
                      >
                        {part}
                      </Text>
                    ))}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function PdfHeader({ snapshot }: { snapshot: ReportPdfSnapshot }) {
  const preparedForName = snapshot.identity.fullName || snapshot.labels.userFallback;

  return (
    <View style={styles.header} fixed={false}>
      <View style={mergeStyles(styles.headerTop, snapshot.dir === 'rtl' ? styles.rtlRow : undefined)}>
        <View style={styles.headerBrand}>
          <Image
            src={`${snapshot.assetBaseUrl}/assets/images/app_logo.png`}
            style={styles.logo}
          />
          <View style={{ flexGrow: 1, flexShrink: 1 }}>
            <Text style={mergeStyles(styles.brandEyebrow, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              Smart Pocket
            </Text>
            <Text style={mergeStyles(styles.title, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {snapshot.title}
            </Text>
            {snapshot.subtitle ? (
              <Text style={mergeStyles(styles.subtitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
                {snapshot.subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.identityCard}>
          <Text style={mergeStyles(styles.identityLabel, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
            {snapshot.labels.preparedFor}
          </Text>
          <Text style={mergeStyles(styles.identityName, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
            {preparedForName}
          </Text>
          {snapshot.identity.email ? (
            <Text style={mergeStyles(styles.identityMeta, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {snapshot.identity.email}
            </Text>
          ) : null}
          {snapshot.identity.country ? (
            <Text style={mergeStyles(styles.identityMeta, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {snapshot.identity.country}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={mergeStyles(styles.metaWrap, snapshot.dir === 'rtl' ? styles.rtlRow : undefined)}>
        {snapshot.metadata.map((item) => (
          <View key={`${item.label}-${item.value}`} style={styles.metaItem} wrap={false}>
            <Text style={mergeStyles(styles.metaLabel, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {item.label}
            </Text>
            <Text style={mergeStyles(styles.metaValue, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {item.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PdfFooter({ snapshot }: { snapshot: ReportPdfSnapshot }) {
  return (
    <View style={mergeStyles(styles.footer, snapshot.dir === 'rtl' ? styles.rtlRow : undefined)} fixed>
      <Text style={styles.footerText}>Smart Pocket</Text>
      <Text style={styles.footerText}>{snapshot.periodLabel}</Text>
        <Text
          style={styles.footerText}
          render={({ pageNumber, totalPages }) => `${snapshot.labels.page} ${pageNumber} of ${totalPages}`}
        />
    </View>
  );
}

function renderStandardSections(snapshot: StandardReportPdfSnapshot) {
  const meaningfulSections = snapshot.sections.filter((section) =>
    section.paragraphs?.length || section.tables.some((table) => table.rows.length > 0)
  );

  if (meaningfulSections.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={mergeStyles(styles.sectionTitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
          {snapshot.title}
        </Text>
        <Text style={mergeStyles(styles.emptyMessage, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
          {snapshot.labels.noActivity}
        </Text>
      </View>
    );
  }

  return meaningfulSections.map((section) => (
    <View key={section.title} style={styles.section} minPresenceAhead={90}>
      <View style={styles.sectionHeader}>
        <Text style={mergeStyles(styles.sectionTitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
          {section.title}
        </Text>
        {section.description ? (
          <Text style={mergeStyles(styles.sectionDescription, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
            {section.description}
          </Text>
        ) : null}
      </View>
      {(section.paragraphs || []).map((paragraph) => (
        <Text key={`${section.title}-${paragraph}`} style={mergeStyles(styles.paragraph, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
          {paragraph}
        </Text>
      ))}
      {section.tables.map((table, index) => (
        <PdfTable key={`${section.title}-${index}`} table={table} rtl={snapshot.dir === 'rtl'} />
      ))}
    </View>
  ));
}

function renderFullFinancialSections(snapshot: FullFinancialReportPdfSnapshot) {
  const { data } = snapshot;

  const executiveMetrics = [
    data.executiveSummary.metrics[0],
    data.incomeExpenses.metrics[0],
    data.incomeExpenses.metrics[1],
    data.incomeExpenses.metrics[2],
    data.incomeExpenses.metrics[3],
    data.executiveSummary.metrics[5],
    data.executiveSummary.metrics[6],
    data.executiveSummary.metrics[7],
  ].filter((metric): metric is ReportPdfMetric => Boolean(metric && isMeaningfulValue(metric.value)));

  const periodTables: ReportPdfTable[] = [
    {
      title: snapshot.labels.topIncomeSources,
      headers: data.incomeExpenses.topIncomeSources.headers,
      rows: data.incomeExpenses.topIncomeSources.rows,
      emptyMessage: data.incomeExpenses.topIncomeSources.emptyMessage,
      compact: true,
    },
    {
      title: snapshot.labels.topExpenseCategories,
      headers: data.incomeExpenses.topExpenseCategories.headers,
      rows: data.incomeExpenses.topExpenseCategories.rows,
      emptyMessage: data.incomeExpenses.topExpenseCategories.emptyMessage,
      compact: true,
    },
    {
      title: snapshot.labels.transactionSummary,
      headers: data.transactions.summaryTable.headers,
      rows: data.transactions.summaryTable.rows,
      emptyMessage: data.transactions.summaryTable.emptyMessage,
      compact: true,
    },
    ...(data.budgets.table.rows.length > 0 ? [{
      title: snapshot.labels.budgetPerformance,
      headers: data.budgets.table.headers,
      rows: data.budgets.table.rows,
      emptyMessage: data.budgets.table.emptyMessage,
      compact: true,
    }] : []),
  ];

  const financialPositionTables: ReportPdfTable[] = [
    ...(data.accounts.personal.rows.length > 0 ? [{
      title: snapshot.labels.accountSummary,
      headers: data.accounts.personal.headers,
      rows: data.accounts.personal.rows,
      emptyMessage: data.accounts.personal.emptyMessage,
      compact: true,
    }] : []),
    ...(data.accounts.shared.rows.length > 0 ? [{
      title: snapshot.labels.sharedAccounts,
      headers: data.accounts.shared.headers,
      rows: data.accounts.shared.rows,
      emptyMessage: data.accounts.shared.emptyMessage,
      compact: true,
    }] : []),
    ...(data.accounts.spaces.rows.length > 0 ? [{
      title: snapshot.labels.spaceAccounts,
      headers: data.accounts.spaces.headers,
      rows: data.accounts.spaces.rows,
      emptyMessage: data.accounts.spaces.emptyMessage,
      compact: true,
    }] : []),
    ...(data.loans.table.rows.length > 0 ? [{
      title: snapshot.labels.loans,
      headers: data.loans.table.headers,
      rows: data.loans.table.rows,
      emptyMessage: data.loans.table.emptyMessage,
      compact: true,
    }] : []),
  ];

  const commitmentsTables: ReportPdfTable[] = [
    ...(data.subscriptions.table.rows.length > 0 ? [{
      title: snapshot.labels.activeSubscriptions,
      headers: data.subscriptions.table.headers,
      rows: data.subscriptions.table.rows,
      emptyMessage: data.subscriptions.table.emptyMessage,
      compact: true,
    }] : []),
    ...(data.subscriptions.upcomingTable.rows.length > 0 ? [{
      title: snapshot.labels.upcomingSubscriptionRenewals,
      headers: data.subscriptions.upcomingTable.headers,
      rows: data.subscriptions.upcomingTable.rows,
      emptyMessage: data.subscriptions.upcomingTable.emptyMessage,
      compact: true,
    }] : []),
    ...(data.recurring.table.rows.length > 0 ? [{
      title: snapshot.labels.recurringTransactions,
      headers: data.recurring.table.headers,
      rows: data.recurring.table.rows,
      emptyMessage: data.recurring.table.emptyMessage,
      compact: true,
    }] : []),
    ...(snapshot.includeUpcomingCommitments && data.commitments.overdue.rows.length > 0 ? [{
      title: snapshot.labels.overdueCommitments,
      headers: data.commitments.overdue.headers,
      rows: data.commitments.overdue.rows,
      emptyMessage: data.commitments.overdue.emptyMessage,
      compact: true,
    }] : []),
    ...(snapshot.includeUpcomingCommitments && data.commitments.next7Days.rows.length > 0 ? [{
      title: snapshot.labels.next7Days,
      headers: data.commitments.next7Days.headers,
      rows: data.commitments.next7Days.rows,
      emptyMessage: data.commitments.next7Days.emptyMessage,
      compact: true,
    }] : []),
    ...(snapshot.includeUpcomingCommitments && data.commitments.next30Days.rows.length > 0 ? [{
      title: snapshot.labels.next30Days,
      headers: data.commitments.next30Days.headers,
      rows: data.commitments.next30Days.rows,
      emptyMessage: data.commitments.next30Days.emptyMessage,
      compact: true,
    }] : []),
    ...(snapshot.includeUpcomingCommitments && data.commitments.later.rows.length > 0 ? [{
      title: snapshot.labels.laterCommitments,
      headers: data.commitments.later.headers,
      rows: data.commitments.later.rows,
      emptyMessage: data.commitments.later.emptyMessage,
      compact: true,
    }] : []),
  ];

  return (
    <>
      <View style={styles.section} minPresenceAhead={110}>
        <View style={styles.sectionHeader}>
          <Text style={mergeStyles(styles.sectionTitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
            {snapshot.labels.executiveSummary}
          </Text>
          <Text style={mergeStyles(styles.sectionDescription, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
            {data.dateBasis.overview}
          </Text>
        </View>
        <PdfMetricGrid items={executiveMetrics} />
        {data.executiveSummary.narratives.map((paragraph) => (
          <Text key={paragraph} style={mergeStyles(styles.paragraph, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
            {paragraph}
          </Text>
        ))}
        {data.currencySummary.converted.rows.length > 0 || data.currencySummary.originals.rows.length > 0 ? (
          <View style={styles.section}>
            <Text style={mergeStyles(styles.tableTitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {snapshot.labels.currencySummary}
            </Text>
            {data.currencySummary.notes.slice(0, 2).map((note) => (
              <Text key={note} style={mergeStyles(styles.inlineNote, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
                {note}
              </Text>
            ))}
            {data.currencySummary.converted.rows.length > 0 ? (
              <PdfTable
                table={{
                  title: snapshot.labels.reportingTotals,
                  headers: data.currencySummary.converted.headers,
                  rows: data.currencySummary.converted.rows,
                  emptyMessage: data.currencySummary.converted.emptyMessage,
                  compact: true,
                }}
                rtl={snapshot.dir === 'rtl'}
              />
            ) : null}
            {data.currencySummary.originals.rows.length > 0 ? (
              <PdfTable
                table={{
                  title: snapshot.labels.originalCurrencyBreakdown,
                  headers: data.currencySummary.originals.headers,
                  rows: data.currencySummary.originals.rows,
                  emptyMessage: data.currencySummary.originals.emptyMessage,
                  compact: true,
                }}
                rtl={snapshot.dir === 'rtl'}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      {periodTables.some((table) => table.rows.length > 0) ? (
        <View style={styles.section} minPresenceAhead={110}>
          <View style={styles.sectionHeader}>
            <Text style={mergeStyles(styles.sectionTitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {snapshot.labels.periodActivity}
            </Text>
            <Text style={mergeStyles(styles.sectionDescription, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {data.dateBasis.periodActivity}
            </Text>
          </View>
          <PdfMetricGrid items={data.incomeExpenses.metrics.filter((metric) => isMeaningfulValue(metric.value))} />
          {data.incomeExpenses.comparisonSummary ? (
            <Text style={mergeStyles(styles.paragraph, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {data.incomeExpenses.comparisonSummary}
            </Text>
          ) : null}
          {periodTables.map((table, index) => (
            <PdfTable key={`period-${index}`} table={table} rtl={snapshot.dir === 'rtl'} />
          ))}
        </View>
      ) : null}

      {financialPositionTables.some((table) => table.rows.length > 0) ? (
        <View style={styles.section} minPresenceAhead={110}>
          <View style={styles.sectionHeader}>
            <Text style={mergeStyles(styles.sectionTitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {snapshot.labels.financialPosition}
            </Text>
            <Text style={mergeStyles(styles.sectionDescription, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {data.dateBasis.financialPosition}
            </Text>
          </View>
          <PdfMetricGrid items={data.accounts.summary.filter((metric) => isMeaningfulValue(metric.value))} />
          {financialPositionTables.map((table, index) => (
            <PdfTable key={`position-${index}`} table={table} rtl={snapshot.dir === 'rtl'} />
          ))}
        </View>
      ) : null}

      {data.people.table.rows.length > 0 ? (
        <View style={styles.section} minPresenceAhead={90}>
          <View style={styles.sectionHeader}>
            <Text style={mergeStyles(styles.sectionTitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {snapshot.labels.people}
            </Text>
            <Text style={mergeStyles(styles.sectionDescription, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {data.dateBasis.people}
            </Text>
          </View>
          <PdfMetricGrid items={data.people.summary.filter((metric) => isMeaningfulValue(metric.value))} />
          <PdfTable
            table={{
              headers: data.people.table.headers,
              rows: data.people.table.rows,
              emptyMessage: data.people.table.emptyMessage,
              compact: true,
            }}
            rtl={snapshot.dir === 'rtl'}
          />
        </View>
      ) : null}

      {commitmentsTables.some((table) => table.rows.length > 0) ? (
        <View style={styles.section} minPresenceAhead={90}>
          <View style={styles.sectionHeader}>
            <Text style={mergeStyles(styles.sectionTitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {snapshot.labels.commitments}
            </Text>
            <Text style={mergeStyles(styles.sectionDescription, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {data.dateBasis.commitments}
            </Text>
          </View>
          <PdfMetricGrid items={data.subscriptions.summary.filter((metric) => isMeaningfulValue(metric.value))} />
          {commitmentsTables.map((table, index) => (
            <PdfTable key={`commitment-${index}`} table={table} rtl={snapshot.dir === 'rtl'} />
          ))}
          {snapshot.includeItemInsights && data.itemInsights && data.itemInsights.recurringSuggestions.rows.length > 0 ? (
            <PdfTable
              table={{
                title: snapshot.labels.recurringItemSuggestions,
                headers: data.itemInsights.recurringSuggestions.headers,
                rows: data.itemInsights.recurringSuggestions.rows,
                emptyMessage: data.itemInsights.recurringSuggestions.emptyMessage,
                compact: true,
              }}
              rtl={snapshot.dir === 'rtl'}
            />
          ) : null}
        </View>
      ) : null}

      {snapshot.includeTransactionDetails && data.transactions.rows.length > 0 ? (
        <View style={styles.section} minPresenceAhead={90}>
          <View style={styles.sectionHeader}>
            <Text style={mergeStyles(styles.sectionTitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {snapshot.labels.detailedTransactions}
            </Text>
            <Text style={mergeStyles(styles.sectionDescription, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {data.dateBasis.periodActivity}
            </Text>
          </View>
          <PdfTable
            table={{
              headers: [
                snapshot.labels.date,
                snapshot.labels.description,
                snapshot.labels.category,
                snapshot.labels.account,
                snapshot.labels.type,
                snapshot.labels.amount,
              ],
              rows: data.transactions.rows.map((row) => [
                row.date,
                row.description,
                row.category || '—',
                row.account || '—',
                row.typeLabel,
                row.reportingAmount === null
                  ? `${row.originalCurrency} ${row.originalAmount.toFixed(2)}`
                  : `${row.reportingCurrency} ${row.reportingAmount.toFixed(2)} | ${row.originalCurrency} ${row.originalAmount.toFixed(2)}`,
              ]),
              emptyMessage: 'No transactions match the selected report filters.',
              compact: true,
            }}
            rtl={snapshot.dir === 'rtl'}
          />
        </View>
      ) : null}
    </>
  );
}

export default function ReportPdfDocument({ snapshot }: { snapshot: ReportPdfSnapshot }) {
  ensurePdfFontsRegistered();

  return (
    <Document
      title={snapshot.title}
      author="Smart Pocket"
      subject={snapshot.subtitle || snapshot.title}
      language={snapshot.language}
    >
      <Page size="A4" style={styles.page} wrap>
        <PdfHeader snapshot={snapshot} />

        {snapshot.kind === 'full-financial' ? (
          renderFullFinancialSections(snapshot)
        ) : (
          <>
            <View style={styles.section} minPresenceAhead={110}>
              <View style={styles.sectionHeader}>
                <Text style={mergeStyles(styles.sectionTitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
                  {snapshot.labels.executiveSummary}
                </Text>
                <Text style={mergeStyles(styles.sectionDescription, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
                  {snapshot.periodLabel}
                </Text>
              </View>
              <PdfMetricGrid items={snapshot.summary.filter((metric) => isMeaningfulValue(metric.value))} />
            </View>
            {renderStandardSections(snapshot)}
          </>
        )}

        <PdfFooter snapshot={snapshot} />
      </Page>
    </Document>
  );
}
