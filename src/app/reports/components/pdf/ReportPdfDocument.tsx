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
    width: 72,
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
  tableBlock: {
    marginTop: 3,
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
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 4,
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
    paddingVertical: 4,
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  tableCell: {
    fontSize: 8,
    color: '#0f172a',
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
  moneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  moneyRowRight: {
    justifyContent: 'flex-end',
  },
  moneySymbol: {
    width: 8,
    height: 8,
    objectFit: 'contain',
  },
  moneySymbolSecondary: {
    width: 7,
    height: 7,
    objectFit: 'contain',
  },
});

function mergeStyles(...items: Array<unknown>) {
  return items.filter((item) => item !== undefined) as any[];
}

const PDF_BIDI_CONTROL_REGEX = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

function sanitizePdfText(value: string | null | undefined) {
  return (value || '').replace(PDF_BIDI_CONTROL_REGEX, '').trim();
}

function splitDisplayValue(value: string | null | undefined) {
  const sanitizedValue = sanitizePdfText(value);
  if (!sanitizedValue) return ['—'];

  const parts = sanitizedValue
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return [sanitizedValue];
  }

  return Array.from(new Set(parts));
}

function isMeaningfulValue(value: string | null | undefined) {
  const normalized = sanitizePdfText(value);
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

function matchCurrencyAmount(value: string) {
  const sanitizedValue = sanitizePdfText(value);
  const match = sanitizedValue.match(/^([−-]\s*)?([A-Z]{3})\s+(.+)$/u);
  if (!match) {
    return null;
  }

  return {
    sign: match[1] ? '−' : '',
    currencyCode: sanitizePdfText(match[2]).toUpperCase(),
    numberText: sanitizePdfText(match[3]) || '0.00',
  };
}

function renderValueLine(args: {
  snapshot: ReportPdfSnapshot;
  value: string;
  textStyle: any;
  align?: 'left' | 'right';
  secondary?: boolean;
}) {
  const sanitizedValue = sanitizePdfText(args.value) || '—';
  const matchedAmount = matchCurrencyAmount(sanitizedValue);

  if (matchedAmount?.currencyCode === 'AED' && args.snapshot.officialDirhamSymbolUrl) {
    return (
      <View
        style={mergeStyles(
          styles.moneyRow,
          args.align === 'right' ? styles.moneyRowRight : undefined,
        )}
      >
        {matchedAmount.sign ? (
          <Text style={args.textStyle}>{matchedAmount.sign}</Text>
        ) : null}
        <Image
          src={args.snapshot.officialDirhamSymbolUrl}
          style={args.secondary ? styles.moneySymbolSecondary : styles.moneySymbol}
        />
        <Text style={args.textStyle}>{matchedAmount.numberText}</Text>
      </View>
    );
  }

  return <Text style={args.textStyle}>{sanitizedValue}</Text>;
}

function renderInlineValue(snapshot: ReportPdfSnapshot, value: string, tone: ReportPdfMetric['tone']) {
  const parts = splitDisplayValue(value);
  const toneStyle = tone === 'positive' ? styles.positive : tone === 'negative' ? styles.negative : styles.neutral;

  return (
    <View>
      {renderValueLine({
        snapshot,
        value: parts[0],
        textStyle: mergeStyles(styles.metricValue, toneStyle),
      })}
      {parts.slice(1).map((part) => (
        <View key={`${value}-${part}`}>
          {renderValueLine({
            snapshot,
            value: part,
            textStyle: styles.metricHelper,
            secondary: true,
          })}
        </View>
      ))}
    </View>
  );
}

function PdfMetricGrid({ items, snapshot }: { items: ReportPdfMetric[]; snapshot: ReportPdfSnapshot }) {
  return (
    <View style={styles.metricsGrid}>
      {items.map((item) => (
        <View key={`${item.label}-${item.value}`} style={styles.metricCard} wrap={false}>
          <Text style={styles.metricLabel}>{sanitizePdfText(item.label)}</Text>
          {renderInlineValue(snapshot, item.value, item.tone)}
          {item.helper ? (
            <Text style={styles.metricHelper}>{sanitizePdfText(item.helper)}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function buildProjectedTable(snapshot: ReportPdfSnapshot, table: ReportPdfTable) {
  const firstHeader = sanitizePdfText(table.headers[0]);
  const secondHeader = sanitizePdfText(table.headers[1]);
  const normalizedTitle = sanitizePdfText(table.title);

  const isLoanTable = normalizedTitle === sanitizePdfText(snapshot.labels.loans)
    || (/lender|person/i.test(firstHeader) && /original/i.test(secondHeader));
  if (isLoanTable && table.headers.length >= 8) {
    return {
      table: {
        ...table,
        headers: [table.headers[0], table.headers[1], table.headers[2], table.headers[3], table.headers[5], table.headers[7]],
        rows: table.rows.map((row) => [row[0], row[1], row[2], row[3], row[5], row[7]]),
      },
      widths: ['24%', '15%', '15%', '15%', '18%', '13%'],
      chunkSize: 16,
    };
  }

  const isPeopleTable = normalizedTitle === sanitizePdfText(snapshot.labels.people)
    || (/person/i.test(firstHeader) && table.headers.some((header) => /receivable|payable/i.test(sanitizePdfText(header))));
  if (isPeopleTable && table.headers.length >= 9) {
    return {
      table: {
        ...table,
        headers: [table.headers[0], table.headers[3], table.headers[4], table.headers[5], table.headers[6], table.headers[8]],
        rows: table.rows.map((row) => [row[0], row[3], row[4], row[5], row[6], row[8]]),
      },
      widths: ['24%', '16%', '16%', '12%', '12%', '20%'],
      chunkSize: 16,
    };
  }

  return {
    table,
    widths: table.headers.map((_, index) => getCellWidth(table.headers.length, index)),
    chunkSize: table.headers.length >= 6 ? 15 : table.compact ? 22 : 18,
  };
}

function renderTableChunk(args: {
  snapshot: ReportPdfSnapshot;
  table: ReportPdfTable;
  rows: string[][];
  chunkIndex: number;
  widths: string[];
}) {
  const rtl = args.snapshot.dir === 'rtl';

  return (
    <View key={`${args.table.title || 'table'}-${args.chunkIndex}`} style={styles.table} wrap={false}>
      <View style={mergeStyles(styles.tableHeader, rtl ? styles.rtlRow : undefined)}>
        {args.table.headers.map((header, index) => (
          <Text
            key={`${header}-${index}`}
            style={[
              styles.tableHeaderCell,
              {
                width: args.widths[index] || getCellWidth(args.table.headers.length, index),
                textAlign: rtl ? 'right' : 'left',
              },
            ]}
          >
            {sanitizePdfText(header)}
          </Text>
        ))}
      </View>
      {args.rows.map((row, rowIndex) => (
        <View
          key={`${args.table.title || 'row'}-${args.chunkIndex}-${rowIndex}`}
          style={mergeStyles(
            styles.tableRow,
            rtl ? styles.rtlRow : undefined,
            rowIndex === args.rows.length - 1 ? styles.tableRowLast : undefined,
          )}
        >
          {row.map((cell, cellIndex) => {
            const parts = splitDisplayValue(cell || '—');
            const header = args.table.headers[cellIndex] || '';
            const align = isAmountLike(header, parts[0]) ? 'right' : rtl ? 'right' : 'left';

            return (
              <View
                key={`${cell}-${cellIndex}`}
                style={{
                  width: args.widths[cellIndex] || getCellWidth(args.table.headers.length, cellIndex),
                  paddingHorizontal: 0,
                }}
              >
                <View style={{ paddingHorizontal: 6 }}>
                  {renderValueLine({
                    snapshot: args.snapshot,
                    value: parts[0],
                    textStyle: mergeStyles(styles.tableCell, { textAlign: align }),
                    align,
                  })}
                </View>
                {parts.slice(1).map((part) => {
                  const partAlign = isAmountLike(header, part) ? 'right' : rtl ? 'right' : 'left';
                  return (
                    <View key={`${cell}-${part}`} style={{ paddingHorizontal: 6 }}>
                      {renderValueLine({
                        snapshot: args.snapshot,
                        value: part,
                        textStyle: mergeStyles(styles.tableCellSecondary, { textAlign: partAlign }),
                        secondary: true,
                        align: partAlign,
                      })}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function PdfTable({ table, snapshot }: { table: ReportPdfTable; snapshot: ReportPdfSnapshot }) {
  const projected = buildProjectedTable(snapshot, table);
  const normalizedTable = projected.table;

  if (normalizedTable.rows.length === 0) {
    return <Text style={styles.emptyMessage}>{sanitizePdfText(normalizedTable.emptyMessage)}</Text>;
  }

  const chunks = chunkRows(normalizedTable.rows, projected.chunkSize);
  const firstChunk = chunks[0] || [];
  const remainingChunks = chunks.slice(1);

  return (
    <View style={styles.tableGroup}>
      <View style={styles.tableBlock} wrap={false} minPresenceAhead={58}>
        {normalizedTable.title ? (
          <Text style={mergeStyles(styles.tableTitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
            {sanitizePdfText(normalizedTable.title)}
          </Text>
        ) : null}
        {normalizedTable.description ? (
          <Text style={mergeStyles(styles.tableDescription, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
            {sanitizePdfText(normalizedTable.description)}
          </Text>
        ) : null}
        {renderTableChunk({
          snapshot,
          table: normalizedTable,
          rows: firstChunk,
          chunkIndex: 0,
          widths: projected.widths,
        })}
      </View>
      {remainingChunks.map((rows, index) =>
        renderTableChunk({
          snapshot,
          table: normalizedTable,
          rows,
          chunkIndex: index + 1,
          widths: projected.widths,
        })
      )}
    </View>
  );
}

function PdfHeader({ snapshot }: { snapshot: ReportPdfSnapshot }) {
  const preparedForName = sanitizePdfText(snapshot.identity.fullName) || sanitizePdfText(snapshot.labels.userFallback);

  return (
    <View
      style={mergeStyles(styles.header, {
        borderBottomColor: snapshot.branding.accentColor || '#e2e8f0',
      })}
      fixed={false}
    >
      <View style={mergeStyles(styles.headerTop, snapshot.dir === 'rtl' ? styles.rtlRow : undefined)}>
        <View style={styles.headerBrand}>
          {snapshot.branding.logoUrl ? (
            <Image
              src={snapshot.branding.logoUrl}
              style={styles.logo}
            />
          ) : null}
          <View style={{ flexGrow: 1, flexShrink: 1 }}>
            <Text style={mergeStyles(styles.brandEyebrow, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {sanitizePdfText(snapshot.branding.appName || snapshot.branding.shortBrandName)}
            </Text>
            <Text
              style={mergeStyles(
                styles.title,
                { color: snapshot.branding.primaryColor || '#0f172a' },
                snapshot.dir === 'rtl' ? styles.rtlText : undefined,
              )}
            >
              {sanitizePdfText(snapshot.title)}
            </Text>
            {snapshot.subtitle ? (
              <Text style={mergeStyles(styles.subtitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
                {sanitizePdfText(snapshot.subtitle)}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.identityCard}>
          <Text style={mergeStyles(styles.identityLabel, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
            {sanitizePdfText(snapshot.labels.preparedFor)}
          </Text>
          <Text style={mergeStyles(styles.identityName, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
            {preparedForName}
          </Text>
          {snapshot.identity.email ? (
            <Text style={mergeStyles(styles.identityMeta, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {sanitizePdfText(snapshot.identity.email)}
            </Text>
          ) : null}
          {snapshot.identity.country ? (
            <Text style={mergeStyles(styles.identityMeta, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {sanitizePdfText(snapshot.identity.country)}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={mergeStyles(styles.metaWrap, snapshot.dir === 'rtl' ? styles.rtlRow : undefined)}>
        {snapshot.metadata.map((item) => (
          <View key={`${item.label}-${item.value}`} style={styles.metaItem} wrap={false}>
            <Text style={mergeStyles(styles.metaLabel, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {sanitizePdfText(item.label)}
            </Text>
            <Text style={mergeStyles(styles.metaValue, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {sanitizePdfText(item.value)}
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
      <Text style={styles.footerText}>{sanitizePdfText(snapshot.branding.shortBrandName || snapshot.branding.appName)}</Text>
      <Text style={styles.footerText}>{sanitizePdfText(snapshot.periodLabel)}</Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) => `${sanitizePdfText(snapshot.labels.page)} ${pageNumber} of ${totalPages}`}
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
          {sanitizePdfText(snapshot.title)}
        </Text>
        <Text style={mergeStyles(styles.emptyMessage, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
          {sanitizePdfText(snapshot.labels.noActivity)}
        </Text>
      </View>
    );
  }

  return meaningfulSections.map((section) => (
    <View key={section.title} style={styles.section} minPresenceAhead={90}>
      <View style={styles.sectionHeader}>
        <Text style={mergeStyles(styles.sectionTitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
          {sanitizePdfText(section.title)}
        </Text>
        {section.description ? (
          <Text style={mergeStyles(styles.sectionDescription, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
            {sanitizePdfText(section.description)}
          </Text>
        ) : null}
      </View>
      {(section.paragraphs || []).map((paragraph) => (
        <Text key={`${section.title}-${paragraph}`} style={mergeStyles(styles.paragraph, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
          {sanitizePdfText(paragraph)}
        </Text>
      ))}
      {section.tables.map((table, index) => (
        <PdfTable key={`${section.title}-${index}`} table={table} snapshot={snapshot} />
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
            {sanitizePdfText(snapshot.labels.executiveSummary)}
          </Text>
          <Text style={mergeStyles(styles.sectionDescription, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
            {sanitizePdfText(data.dateBasis.overview)}
          </Text>
        </View>
        <PdfMetricGrid items={executiveMetrics} snapshot={snapshot} />
        {data.executiveSummary.narratives.map((paragraph) => (
          <Text key={paragraph} style={mergeStyles(styles.paragraph, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
            {sanitizePdfText(paragraph)}
          </Text>
        ))}
        {data.currencySummary.converted.rows.length > 0 || data.currencySummary.originals.rows.length > 0 ? (
          <View style={styles.section} minPresenceAhead={70}>
            <Text style={mergeStyles(styles.tableTitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {sanitizePdfText(snapshot.labels.currencySummary)}
            </Text>
            {data.currencySummary.notes.slice(0, 2).map((note) => (
              <Text key={note} style={mergeStyles(styles.inlineNote, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
                {sanitizePdfText(note)}
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
                snapshot={snapshot}
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
                snapshot={snapshot}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      {periodTables.some((table) => table.rows.length > 0) ? (
        <View style={styles.section} minPresenceAhead={110}>
          <View style={styles.sectionHeader}>
            <Text style={mergeStyles(styles.sectionTitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {sanitizePdfText(snapshot.labels.periodActivity)}
            </Text>
            <Text style={mergeStyles(styles.sectionDescription, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {sanitizePdfText(data.dateBasis.periodActivity)}
            </Text>
          </View>
          <PdfMetricGrid items={data.incomeExpenses.metrics.filter((metric) => isMeaningfulValue(metric.value))} snapshot={snapshot} />
          {data.incomeExpenses.comparisonSummary ? (
            <Text style={mergeStyles(styles.paragraph, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {sanitizePdfText(data.incomeExpenses.comparisonSummary)}
            </Text>
          ) : null}
          {periodTables.map((table, index) => (
            <PdfTable key={`period-${index}`} table={table} snapshot={snapshot} />
          ))}
        </View>
      ) : null}

      {financialPositionTables.some((table) => table.rows.length > 0) ? (
        <View style={styles.section} minPresenceAhead={110}>
          <View style={styles.sectionHeader}>
            <Text style={mergeStyles(styles.sectionTitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {sanitizePdfText(snapshot.labels.financialPosition)}
            </Text>
            <Text style={mergeStyles(styles.sectionDescription, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {sanitizePdfText(data.dateBasis.financialPosition)}
            </Text>
          </View>
          <PdfMetricGrid items={data.accounts.summary.filter((metric) => isMeaningfulValue(metric.value))} snapshot={snapshot} />
          {financialPositionTables.map((table, index) => (
            <PdfTable key={`position-${index}`} table={table} snapshot={snapshot} />
          ))}
        </View>
      ) : null}

      {data.people.table.rows.length > 0 ? (
        <View style={styles.section} minPresenceAhead={90}>
          <View style={styles.sectionHeader}>
            <Text style={mergeStyles(styles.sectionTitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {sanitizePdfText(snapshot.labels.people)}
            </Text>
            <Text style={mergeStyles(styles.sectionDescription, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {sanitizePdfText(data.dateBasis.people)}
            </Text>
          </View>
          <PdfMetricGrid items={data.people.summary.filter((metric) => isMeaningfulValue(metric.value))} snapshot={snapshot} />
          <PdfTable
            table={{
              title: snapshot.labels.people,
              headers: data.people.table.headers,
              rows: data.people.table.rows,
              emptyMessage: data.people.table.emptyMessage,
              compact: true,
            }}
            snapshot={snapshot}
          />
        </View>
      ) : null}

      {commitmentsTables.some((table) => table.rows.length > 0) ? (
        <View style={styles.section} minPresenceAhead={90}>
          <View style={styles.sectionHeader}>
            <Text style={mergeStyles(styles.sectionTitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {sanitizePdfText(snapshot.labels.commitments)}
            </Text>
            <Text style={mergeStyles(styles.sectionDescription, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {sanitizePdfText(data.dateBasis.commitments)}
            </Text>
          </View>
          <PdfMetricGrid items={data.subscriptions.summary.filter((metric) => isMeaningfulValue(metric.value))} snapshot={snapshot} />
          {commitmentsTables.map((table, index) => (
            <PdfTable key={`commitment-${index}`} table={table} snapshot={snapshot} />
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
              snapshot={snapshot}
            />
          ) : null}
        </View>
      ) : null}

      {snapshot.includeTransactionDetails && data.transactions.rows.length > 0 ? (
        <View style={styles.section} minPresenceAhead={90}>
          <View style={styles.sectionHeader}>
            <Text style={mergeStyles(styles.sectionTitle, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {sanitizePdfText(snapshot.labels.detailedTransactions)}
            </Text>
            <Text style={mergeStyles(styles.sectionDescription, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
              {sanitizePdfText(data.dateBasis.periodActivity)}
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
            snapshot={snapshot}
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
      title={sanitizePdfText(snapshot.title)}
      author={sanitizePdfText(snapshot.branding.appName)}
      subject={sanitizePdfText(snapshot.subtitle || snapshot.title)}
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
                  {sanitizePdfText(snapshot.labels.executiveSummary)}
                </Text>
                <Text style={mergeStyles(styles.sectionDescription, snapshot.dir === 'rtl' ? styles.rtlText : undefined)}>
                  {sanitizePdfText(snapshot.periodLabel)}
                </Text>
              </View>
              <PdfMetricGrid items={snapshot.summary.filter((metric) => isMeaningfulValue(metric.value))} snapshot={snapshot} />
            </View>
            {renderStandardSections(snapshot)}
          </>
        )}

        <PdfFooter snapshot={snapshot} />
      </Page>
    </Document>
  );
}
