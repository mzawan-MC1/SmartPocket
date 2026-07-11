import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

export function escapeCsvValue(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsvRow(values: unknown[]) {
  return values.map((value) => escapeCsvValue(value)).join(',');
}

export function downloadCsvFile(filename: string, csv: string) {
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function waitForPrintableDocument(printWindow: Window) {
  await new Promise<void>((resolve) => {
    printWindow.requestAnimationFrame(() => {
      printWindow.requestAnimationFrame(() => resolve());
    });
  });

  const fonts = (printWindow.document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (fonts?.ready) {
    try {
      await fonts.ready;
    } catch {
      // Ignore font readiness failures and continue to print.
    }
  }

  const pendingImages = Array.from(printWindow.document.images).filter((image) => !image.complete);
  if (pendingImages.length > 0) {
    await Promise.race([
      Promise.all(
        pendingImages.map((image) => new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener('error', () => resolve(), { once: true });
        }))
      ),
      new Promise<void>((resolve) => {
        window.setTimeout(() => resolve(), 1500);
      }),
    ]);
  }

  await new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), 250);
  });
}

export async function openPrintWindowForDocument(args: {
  content: ReactElement;
  title: string;
  lang?: string;
  dir?: 'ltr' | 'rtl';
}) {
  const { content, title, lang = document.documentElement.lang || 'en', dir = 'ltr' } = args;
  const printWindow = window.open('', '_blank', 'width=1120,height=900');

  if (!printWindow) {
    return false;
  }

  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((node) => node.outerHTML)
    .join('\n');
  const htmlClassName = document.documentElement.className;
  const bodyClassName = document.body.className;
  const bodyStyle = document.body.getAttribute('style') || '';

  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
<html lang="${lang}" dir="${dir}" class="${htmlClassName}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <base href="${window.location.origin}" />
    <title>${title}</title>
    ${styles}
    <style>
      html, body {
        background: #ffffff !important;
      }

      body {
        margin: 0;
        color: #0f172a;
      }

      .smart-pocket-print-shell {
        min-height: 100vh;
        padding: 32px 24px;
        background: #ffffff;
      }

      @page {
        size: A4;
        margin: 14mm;
      }

      @media print {
        .smart-pocket-print-shell {
          padding: 0;
        }
      }
    </style>
  </head>
  <body class="${bodyClassName}" style="${bodyStyle}">
    <div id="smart-pocket-print-root" class="smart-pocket-print-shell"></div>
  </body>
</html>`);
  printWindow.document.close();

  const rootElement = printWindow.document.getElementById('smart-pocket-print-root');
  if (!rootElement) {
    printWindow.close();
    return false;
  }

  const root = createRoot(rootElement);
  root.render(content);

  const cleanup = () => {
    try {
      root.unmount();
    } catch {
      // Ignore unmount errors during cleanup.
    }
  };

  printWindow.addEventListener('beforeunload', cleanup, { once: true });
  printWindow.addEventListener('afterprint', cleanup, { once: true });

  await waitForPrintableDocument(printWindow);
  printWindow.focus();
  printWindow.print();

  return true;
}
