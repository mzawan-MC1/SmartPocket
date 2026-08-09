#!/usr/bin/env node
/**
 * Smart Pocket — Translation Completeness Checker
 *
 * Validates every supported locale against the English canonical source.
 * Detects: missing namespaces, missing keys, orphaned keys, empty values,
 * interpolation mismatches, invalid JSON, values identical to English
 * (flagged for review only).
 *
 * Usage: node scripts/validate-i18n.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(process.cwd(), 'src', 'i18n', 'locales');

const CANONICAL_LOCALE = 'en';
const SUPPORTED_LOCALES = ['en', 'ar', 'fr', 'ru', 'tr', 'zh-CN', 'es', 'pt-BR'];
const NAMESPACES = [
  'common',
  'auth',
  'dashboard',
  'transactions',
  'budgets',
  'reports',
  'settings',
  'admin',
  'validation',
  'people',
  'public',
  'portal',
];

const INTERPOLATION_RE = /\{\{(\w+)\}\}/g;

function flattenKeys(obj, prefix = '', out = new Map()) {
  if (obj === null || obj === undefined) return out;
  if (Array.isArray(obj)) {
    obj.forEach((val, idx) => flattenKeys(val, `${prefix}[${idx}]`, out));
    return out;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const next = prefix ? `${prefix}.${k}` : k;
      flattenKeys(v, next, out);
    }
    return out;
  }
  out.set(prefix, obj);
  return out;
}

function safeReadJson(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ok: true, parsed, raw };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function localeDirName(code) {
  // Directories match BCP-47 exactly as the canonical locale codes (e.g., zh-CN, pt-BR).
  return code;
}

function extractPlaceholders(value) {
  if (typeof value !== 'string') return [];
  const seen = new Set();
  let m;
  const re = new RegExp(INTERPOLATION_RE.source, 'g');
  while ((m = re.exec(value)) !== null) seen.add(m[1]);
  return [...seen].sort();
}

const results = SUPPORTED_LOCALES.map((locale) => ({
  locale,
  namespacesMissing: [],
  invalidJson: [],
  missingKeys: [], // [ns, key]
  orphanKeys: [],
  emptyValues: [],
  interpolationMismatches: [], // [ns, key, expected, actual]
  enIdentical: [], // review only
  summary: {
    canonicalKeys: 0,
    localeKeys: 0,
  },
}));

function findResult(locale) {
  return results.find((r) => r.locale === locale);
}

// Load canonical EN for each namespace
const canonicalFlats = new Map(); // ns -> Map(key -> value)
for (const ns of NAMESPACES) {
  const file = join(ROOT, localeDirName(CANONICAL_LOCALE), `${ns}.json`);
  const { ok, parsed, error } = safeReadJson(file);
  if (!ok) {
    console.error(`FATAL — canonical EN ${ns} unreadable: ${error}`);
    process.exit(2);
  }
  canonicalFlats.set(ns, flattenKeys(parsed));
  const r = findResult('en');
  r.summary.canonicalKeys = canonicalFlats.get(ns).size;
  r.summary.localeKeys += canonicalFlats.get(ns).size;
}

let globalFailures = 0;

for (const locale of SUPPORTED_LOCALES) {
  if (locale === CANONICAL_LOCALE) continue;
  const r = findResult(locale);
  for (const ns of NAMESPACES) {
    const dir = join(ROOT, localeDirName(locale));
    let exists = false;
    try {
      exists = statSync(dir).isDirectory();
    } catch {
      exists = false;
    }
    const file = join(dir, `${ns}.json`);
    let fExists = false;
    try {
      fExists = statSync(file).isFile();
    } catch {
      fExists = false;
    }
    if (!exists || !fExists) {
      r.namespacesMissing.push(ns);
      globalFailures += 1;
      continue;
    }
    const { ok, parsed, error } = safeReadJson(file);
    if (!ok) {
      r.invalidJson.push(`${ns}.json — ${error}`);
      globalFailures += 1;
      continue;
    }
    const canonical = canonicalFlats.get(ns);
    const localeFlat = flattenKeys(parsed);
    r.summary.canonicalKeys += canonical.size;
    r.summary.localeKeys += localeFlat.size;

    const canonKeys = new Set(canonical.keys());
    const localeKeys = new Set(localeFlat.keys());

    // Missing
    for (const k of canonKeys) {
      if (!localeKeys.has(k)) {
        r.missingKeys.push([ns, k]);
        globalFailures += 1;
      }
    }
    // Orphan
    for (const k of localeKeys) {
      if (!canonKeys.has(k)) {
        r.orphanKeys.push([ns, k]);
      }
    }
    // Value checks per common key
    for (const k of canonKeys) {
      if (!localeKeys.has(k)) continue;
      const canonVal = canonical.get(k);
      const localeVal = localeFlat.get(k);
      if (typeof canonVal === 'string') {
        // Empty / whitespace only
        if (typeof localeVal !== 'string' || localeVal.trim() === '') {
          r.emptyValues.push([ns, k]);
          globalFailures += 1;
          continue;
        }
        // Interpolation placeholders
        const expectedPH = extractPlaceholders(canonVal);
        const actualPH = extractPlaceholders(localeVal);
        if (
          expectedPH.length !== actualPH.length ||
          !expectedPH.every((p, i) => p === actualPH[i])
        ) {
          r.interpolationMismatches.push([ns, k, expectedPH, actualPH]);
          globalFailures += 1;
        }
        // Identical to EN (review)
        if (locale === 'ar' || locale === 'zh-CN') {
          // Scripts differ strongly; a rare match is likely brand/acronym, ignore.
        } else if (localeVal === canonVal && canonVal.length > 12) {
          r.enIdentical.push([ns, k, canonVal.slice(0, 80)]);
        }
      }
    }
  }
}

// Reporting
let exitCode = 0;
const issueReportLines = [];

function header(title) {
  const sep = '='.repeat(80);
  issueReportLines.push('', sep, `  ${title}`, sep);
}

header('Smart Pocket — Translation Completeness Report');
issueReportLines.push(
  `Canonical: ${CANONICAL_LOCALE} | Locales: ${SUPPORTED_LOCALES.join(', ')}`,
  `Namespaces (${NAMESPACES.length}): ${NAMESPACES.join(', ')}`
);

for (const r of results) {
  const lines = [];
  lines.push('');
  const titleBar = `LOCALE: ${r.locale.padEnd(6)}  canonical_keys=${r.summary.canonicalKeys}  locale_keys=${r.summary.localeKeys}`;
  lines.push('-'.repeat(titleBar.length));
  lines.push(titleBar);
  lines.push('-'.repeat(titleBar.length));
  let localIssueCount = 0;

  if (r.namespacesMissing.length) {
    lines.push(`❌ Missing namespaces (${r.namespacesMissing.length}): ${r.namespacesMissing.join(', ')}`);
    localIssueCount += r.namespacesMissing.length;
  }
  if (r.invalidJson.length) {
    lines.push(`❌ Invalid JSON (${r.invalidJson.length}):`);
    for (const it of r.invalidJson) lines.push(`   • ${it}`);
    localIssueCount += r.invalidJson.length;
  }
  if (r.missingKeys.length) {
    const grouped = groupByNs(r.missingKeys);
    lines.push(`❌ Missing keys (${r.missingKeys.length}):`);
    for (const [ns, keys] of grouped) {
      const preview = keys.slice(0, 12).join(', ');
      const extra = keys.length > 12 ? ` … +${keys.length - 12} more` : '';
      lines.push(`   • [${ns}] ${preview}${extra}`);
    }
    localIssueCount += r.missingKeys.length;
  }
  if (r.orphanKeys.length) {
    const grouped = groupByNs(r.orphanKeys);
    lines.push(`⚠️  Orphan keys (${r.orphanKeys.length}) — not in EN source:`);
    for (const [ns, keys] of grouped) {
      const preview = keys.slice(0, 12).join(', ');
      const extra = keys.length > 12 ? ` … +${keys.length - 12} more` : '';
      lines.push(`   • [${ns}] ${preview}${extra}`);
    }
  }
  if (r.emptyValues.length) {
    const grouped = groupByNs(r.emptyValues);
    lines.push(`❌ Empty values (${r.emptyValues.length}):`);
    for (const [ns, keys] of grouped) {
      const preview = keys.slice(0, 12).join(', ');
      const extra = keys.length > 12 ? ` … +${keys.length - 12} more` : '';
      lines.push(`   • [${ns}] ${preview}${extra}`);
    }
    localIssueCount += r.emptyValues.length;
  }
  if (r.interpolationMismatches.length) {
    lines.push(`❌ Interpolation mismatches (${r.interpolationMismatches.length}):`);
    for (const [ns, k, exp, act] of r.interpolationMismatches) {
      lines.push(
        `   • [${ns}] ${k}  expected={${exp.join(',')}}  actual={${act.join(',')}}`
      );
    }
    localIssueCount += r.interpolationMismatches.length;
  }
  if (r.enIdentical.length) {
    lines.push(`ℹ️  EN-identical review candidates (${r.enIdentical.length}) — review only:`);
    for (const [ns, k, snippet] of r.enIdentical.slice(0, 20)) {
      lines.push(`   • [${ns}] ${k}  “${snippet}${snippet.length >= 80 ? '…' : ''}”`);
    }
    if (r.enIdentical.length > 20) {
      lines.push(`   … +${r.enIdentical.length - 20} more review entries omitted.`);
    }
  }

  if (localIssueCount === 0 && r.locale !== CANONICAL_LOCALE) {
    lines.push('✅ Passed (no blocking issues).');
  } else if (r.locale === CANONICAL_LOCALE) {
    lines.push('ℹ️  Canonical locale (reference source).');
  }

  issueReportLines.push(...lines);
  if (localIssueCount > 0) exitCode = 1;
}

function groupByNs(list) {
  const map = new Map();
  for (const [ns, k] of list) {
    if (!map.has(ns)) map.set(ns, []);
    map.get(ns).push(k);
  }
  return [...map.entries()];
}

// Summary table
header('Summary');
issueReportLines.push('');
issueReportLines.push(
  ['Locale'.padEnd(8), 'Missing NS'.padStart(10), 'Invalid JS'.padStart(10), 'Missing K'.padStart(10), 'Orphans'.padStart(9), 'Empty V'.padStart(9), 'PH Mismtch'.padStart(11), 'Review'.padStart(8)].join(' | ')
);
issueReportLines.push('-'.repeat(80));
for (const r of results) {
  issueReportLines.push(
    [
      r.locale.padEnd(8),
      String(r.namespacesMissing.length).padStart(10),
      String(r.invalidJson.length).padStart(10),
      String(r.missingKeys.length).padStart(10),
      String(r.orphanKeys.length).padStart(9),
      String(r.emptyValues.length).padStart(9),
      String(r.interpolationMismatches.length).padStart(11),
      String(r.enIdentical.length).padStart(8),
    ].join(' | ')
  );
}

console.log(issueReportLines.join('\n'));
console.log('');
if (exitCode === 0) {
  console.log('✅ Translation completeness check PASSED.');
} else {
  console.log(
    `❌ Translation completeness check FAILED — ${globalFailures} blocking issue(s) across locales.`
  );
}

process.exit(exitCode);
