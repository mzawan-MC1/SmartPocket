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

export function openPrintWindowForElement(args: {
  element: HTMLElement;
  title: string;
  lang?: string;
  dir?: 'ltr' | 'rtl';
}) {
  const { element, title, lang = document.documentElement.lang || 'en', dir = 'ltr' } = args;
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1120,height=900');

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
    <div class="smart-pocket-print-shell">${element.innerHTML}</div>
  </body>
</html>`);
  printWindow.document.close();

  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 300);

  return true;
}
