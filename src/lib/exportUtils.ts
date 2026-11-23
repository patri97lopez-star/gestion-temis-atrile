import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { fetchDocumentBytes } from './fileStorage';
import { buildInvoicePdfDoc, buildQuarterlyClosingPdfBlob } from './pdfGenerator';
import type { CompanySettings, DocumentRecord, Expense, Invoice } from '../types/erp';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent =
    '\uFEFF' +
    [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))].join('\n');
  triggerDownload(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }), filename);
}

export async function exportExcel(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number)[][]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  sheet.addRow(headers);

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF203C35' },
  };

  rows.forEach((r) => sheet.addRow(r));
  sheet.columns.forEach((col) => {
    col.width = 20;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename
  );
}

export async function generateQuarterlyZipPackage(params: {
  fiscalYear: number;
  quarter: '1T' | '2T' | '3T' | '4T';
  company: CompanySettings | null;
  issuedInvoices: Invoice[];
  expenses: Expense[];
  documents: DocumentRecord[];
  incidences: string[];
}): Promise<void> {
  const { fiscalYear, quarter, company, issuedInvoices, expenses, documents, incidences } = params;
  const zip = new JSZip();

  // 1. Summary PDF
  const summaryPdfBlob = buildQuarterlyClosingPdfBlob({
    fiscalYear,
    quarter,
    company,
    issuedInvoices,
    expenses,
    incidences,
  });
  zip.file(`00_Resumen_Trimestre_${fiscalYear}_${quarter}.pdf`, summaryPdfBlob);

  // 2. Issued invoices CSV + individual PDFs
  const issuedCsv =
    '\uFEFF' +
    [
      'Numero;Serie;Fecha;Cliente;CIF;Base Imponible;IVA;Retencion;Total;Estado',
      ...issuedInvoices.map((inv) =>
        [
          inv.number,
          inv.series,
          inv.issueDate,
          inv.clientName,
          inv.clientTaxId,
          inv.taxBase.toFixed(2),
          inv.vatAmount.toFixed(2),
          inv.retentionAmount.toFixed(2),
          inv.total.toFixed(2),
          inv.status,
        ].join(';')
      ),
    ].join('\n');
  zip.file(`01_Facturas_Emitidas_${fiscalYear}_${quarter}.csv`, issuedCsv);

  const issuedFolder = zip.folder('01_Facturas_Emitidas_PDF');
  if (issuedFolder) {
    for (const inv of issuedInvoices) {
      const pdfDoc = buildInvoicePdfDoc(inv, company);
      issuedFolder.file(`${inv.number.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`, pdfDoc.output('blob'));
    }
  }

  // 3. Expenses / received invoices CSV
  const expCsv =
    '\uFEFF' +
    [
      'Fecha;Proveedor;CIF;NumFactura;Concepto;Categoria;Base Imponible;IVA;Total;Estado;Adjunto',
      ...expenses.map((e) =>
        [
          e.date,
          e.supplierName,
          e.supplierTaxId || '',
          e.invoiceNumber || '',
          e.concept,
          e.category,
          e.taxBase.toFixed(2),
          e.vatAmount.toFixed(2),
          e.total.toFixed(2),
          e.status,
          e.documentId ? 'SI' : 'NO',
        ].join(';')
      ),
    ].join('\n');
  zip.file(`02_Facturas_Recibidas_y_Gastos_${fiscalYear}_${quarter}.csv`, expCsv);

  // 4. Incidences TXT
  const incText = [
    `EXPEDIENTE DE CIERRE TRIMESTRAL - ${fiscalYear} ${quarter}`,
    `Empresa: ${company?.legalName || company?.tradeName || 'TEMIS ATRILE E.S.P.J.'} (${company?.taxId || ''})`,
    `Fecha de generación: ${new Date().toISOString()}`,
    '',
    'INCIDENCIAS Y ELEMENTOS PENDIENTES DE REVISIÓN:',
    ...(incidences.length > 0 ? incidences.map((i, idx) => `${idx + 1}. ${i}`) : ['Ninguna incidencia automática detectada.']),
    '',
    'NOTA LEGAL: Los cálculos contenidos en este expediente tienen carácter preparatorio y están sujetos a revisión y validación por la gestoría responsable.',
  ].join('\n');
  zip.file('03_Incidencias_y_Control.txt', incText);

  // 5. Real attached documents from Firestore
  const docsFolder = zip.folder('04_Documentacion_Adjunta');
  if (docsFolder) {
    for (const docRec of documents) {
      if (docRec.chunkCount > 0) {
        try {
          const bytes = await fetchDocumentBytes(docRec.id);
          const safeFolder = docRec.folder.replace(/[^a-zA-Z0-9_-]/g, '_');
          docsFolder.file(`${safeFolder}/${docRec.name}`, bytes);
        } catch {
          // Skip unreadable chunk rather than failing entire ZIP
        }
      }
    }
  }

  const content = await zip.generateAsync({ type: 'blob' });
  triggerDownload(content, `Gestoria_Cierre_${fiscalYear}_${quarter}.zip`);
}
