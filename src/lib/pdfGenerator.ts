import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate } from './formatters';
import type { CompanySettings, Expense, Invoice, Quote } from '../types/erp';

const FOREST_RGB: [number, number, number] = [32, 60, 53];
const GOLD_RGB: [number, number, number] = [198, 168, 121];
const INK_RGB: [number, number, number] = [37, 43, 40];
const MUTED_RGB: [number, number, number] = [100, 110, 105];

function addCompanyHeader(
  doc: jsPDF,
  company: CompanySettings | null,
  docTitle: string,
  docNumber: string,
  metaLines: string[]
): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Top accent bar
  doc.setFillColor(...FOREST_RGB);
  doc.rect(0, 0, pageWidth, 8, 'F');
  doc.setFillColor(...GOLD_RGB);
  doc.rect(0, 8, pageWidth, 1.5, 'F');

  let leftY = 20;
  if (company?.logoDataUrl && company.logoDataUrl.startsWith('data:image/')) {
    try {
      const format = company.logoDataUrl.includes('png') ? 'PNG' : 'JPEG';
      doc.addImage(company.logoDataUrl, format, 14, 15, 24, 24);
      leftY = 44;
    } catch {
      // Fallback to text header if logo image cannot be embedded
    }
  }

  doc.setTextColor(...FOREST_RGB);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(company?.tradeName || 'Gestión Temis Atrile', 14, leftY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED_RGB);
  const companyDetails = [
    company?.legalName || '',
    company?.taxId ? `CIF/NIF: ${company.taxId}` : '',
    [company?.fiscalAddress, company?.postalCode, company?.city, company?.province]
      .filter(Boolean)
      .join(', '),
    [company?.phone ? `Tel: ${company.phone}` : '', company?.email || '']
      .filter(Boolean)
      .join(' · '),
  ].filter(Boolean);

  let detailY = leftY + 5;
  companyDetails.forEach((line) => {
    doc.text(line, 14, detailY);
    detailY += 4.2;
  });

  // Right document block
  doc.setTextColor(...FOREST_RGB);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(docTitle, pageWidth - 14, 22, { align: 'right' });

  doc.setFontSize(11);
  doc.setTextColor(...INK_RGB);
  doc.text(docNumber, pageWidth - 14, 29, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED_RGB);
  let rightY = 35;
  metaLines.forEach((m) => {
    doc.text(m, pageWidth - 14, rightY, { align: 'right' });
    rightY += 4.5;
  });

  return Math.max(detailY, rightY) + 6;
}

export function generateQuotePdf(quote: Quote, company: CompanySettings | null): void {
  const doc = new jsPDF();
  const yStart = addCompanyHeader(doc, company, 'PRESUPUESTO', quote.number, [
    `Fecha emisión: ${formatDate(quote.issueDate)}`,
    `Válido hasta: ${formatDate(quote.validUntil)}`,
    `Estado: ${quote.status.toUpperCase()}`,
  ]);

  doc.setDrawColor(236, 238, 235);
  doc.setFillColor(248, 248, 245);
  doc.roundedRect(14, yStart, 182, 20, 2, 2, 'FD');

  doc.setTextColor(...MUTED_RGB);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE', 18, yStart + 6);
  doc.setTextColor(...INK_RGB);
  doc.setFontSize(10);
  doc.text(quote.clientName, 18, yStart + 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (quote.clientTaxId) {
    doc.text(`CIF/NIF: ${quote.clientTaxId}`, 18, yStart + 17);
  }

  autoTable(doc, {
    startY: yStart + 26,
    head: [['Concepto / Descripción', 'Uds.', 'Precio Unit.', 'Dto.', 'IVA', 'Subtotal']],
    body: quote.lines.map((line) => {
      const sub = line.quantity * line.unitPrice * (1 - (line.discountPercent || 0) / 100);
      return [
        line.description,
        String(line.quantity),
        formatCurrency(line.unitPrice),
        `${line.discountPercent || 0}%`,
        `${line.vatRate}%`,
        formatCurrency(sub),
      ];
    }),
    headStyles: { fillColor: FOREST_RGB, textColor: [255, 255, 255], fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5, textColor: INK_RGB },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(9.5);
  doc.setTextColor(...INK_RGB);
  doc.text('Base imponible:', pageWidth - 65, finalY);
  doc.text(formatCurrency(quote.taxBase), pageWidth - 14, finalY, { align: 'right' });

  doc.text('IVA:', pageWidth - 65, finalY + 6);
  doc.text(formatCurrency(quote.vatAmount), pageWidth - 14, finalY + 6, { align: 'right' });

  let offset = 12;
  if (quote.retentionAmount > 0) {
    doc.text(`Retención IRPF (${quote.retentionRate || 0}%):`, pageWidth - 65, finalY + offset);
    doc.text(`-${formatCurrency(quote.retentionAmount)}`, pageWidth - 14, finalY + offset, {
      align: 'right',
    });
    offset += 6;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...FOREST_RGB);
  doc.text('TOTAL PRESUPUESTO:', pageWidth - 65, finalY + offset + 2);
  doc.text(formatCurrency(quote.total), pageWidth - 14, finalY + offset + 2, { align: 'right' });

  if (quote.notes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED_RGB);
    doc.text('Observaciones:', 14, finalY + offset + 14);
    doc.text(doc.splitTextToSize(quote.notes, 180), 14, finalY + offset + 19);
  }

  doc.save(`Presupuesto_${quote.number}.pdf`);
}

export function buildInvoicePdfDoc(invoice: Invoice, company: CompanySettings | null): jsPDF {
  const doc = new jsPDF();
  const title = invoice.rectifiesInvoiceId ? 'FACTURA RECTIFICATIVA' : 'FACTURA';
  const yStart = addCompanyHeader(doc, company, title, invoice.number, [
    `Serie: ${invoice.series}`,
    `Fecha emisión: ${formatDate(invoice.issueDate)}`,
    `Fecha vencimiento: ${formatDate(invoice.dueDate)}`,
    `Estado: ${invoice.status}`,
  ]);

  doc.setDrawColor(236, 238, 235);
  doc.setFillColor(248, 248, 245);
  doc.roundedRect(14, yStart, 182, 24, 2, 2, 'FD');

  doc.setTextColor(...MUTED_RGB);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL CLIENTE', 18, yStart + 6);
  doc.setTextColor(...INK_RGB);
  doc.setFontSize(10);
  doc.text(invoice.clientName, 18, yStart + 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`CIF/NIF: ${invoice.clientTaxId || 'No especificado'}`, 18, yStart + 17);
  if (invoice.clientAddress) {
    doc.text(invoice.clientAddress, 18, yStart + 21.5);
  }

  autoTable(doc, {
    startY: yStart + 30,
    head: [['Concepto', 'Cant.', 'Precio Unit.', 'Dto.', 'IVA', 'Importe']],
    body: invoice.lines.map((line) => {
      const sub = line.quantity * line.unitPrice * (1 - (line.discountPercent || 0) / 100);
      return [
        line.description,
        String(line.quantity),
        formatCurrency(line.unitPrice),
        `${line.discountPercent || 0}%`,
        `${line.vatRate}%`,
        formatCurrency(sub),
      ];
    }),
    headStyles: { fillColor: FOREST_RGB, textColor: [255, 255, 255], fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5, textColor: INK_RGB },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(9.5);
  doc.setTextColor(...INK_RGB);
  doc.text('Base imponible:', pageWidth - 65, finalY);
  doc.text(formatCurrency(invoice.taxBase), pageWidth - 14, finalY, { align: 'right' });

  doc.text('IVA repercutido:', pageWidth - 65, finalY + 6);
  doc.text(formatCurrency(invoice.vatAmount), pageWidth - 14, finalY + 6, { align: 'right' });

  let offset = 12;
  if (invoice.retentionAmount > 0) {
    doc.text(`Retención IRPF (${invoice.retentionRate || 0}%):`, pageWidth - 65, finalY + offset);
    doc.text(`-${formatCurrency(invoice.retentionAmount)}`, pageWidth - 14, finalY + offset, {
      align: 'right',
    });
    offset += 6;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...FOREST_RGB);
  doc.text('TOTAL FACTURA:', pageWidth - 65, finalY + offset + 2);
  doc.text(formatCurrency(invoice.total), pageWidth - 14, finalY + offset + 2, { align: 'right' });

  let extraY = finalY + offset + 12;
  if (company?.iban) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK_RGB);
    doc.text(
      `Forma de pago: Transferencia bancaria · ${company.bankName || 'Entidad'} · IBAN: ${company.iban}`,
      14,
      extraY
    );
    extraY += 6;
  }

  if (invoice.notes) {
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED_RGB);
    doc.text(doc.splitTextToSize(`Notas: ${invoice.notes}`, 182), 14, extraY);
    extraY += 10;
  }

  // Traceability / VERI*FACTU local hash footer
  if (invoice.verifactuHash) {
    doc.setFontSize(7);
    doc.setTextColor(...MUTED_RGB);
    doc.text(
      `Trazabilidad interna SHA-256: ${invoice.verifactuHash.slice(0, 32)}... | Registro inmutable local (pendiente de remisión electrónica AEAT según certificado).`,
      14,
      284
    );
  }

  return doc;
}

export function generateInvoicePdf(invoice: Invoice, company: CompanySettings | null): void {
  const doc = buildInvoicePdfDoc(invoice, company);
  doc.save(`Factura_${invoice.number}.pdf`);
}

export function buildQuarterlyClosingPdfBlob(params: {
  fiscalYear: number;
  quarter: '1T' | '2T' | '3T' | '4T';
  company: CompanySettings | null;
  issuedInvoices: Invoice[];
  expenses: Expense[];
  incidences: string[];
}): Blob {
  const { fiscalYear, quarter, company, issuedInvoices, expenses, incidences } = params;
  const doc = new jsPDF();
  const yStart = addCompanyHeader(
    doc,
    company,
    'DOSSIER CIERRE TRIMESTRAL',
    `${fiscalYear} · ${quarter}`,
    [
      `Generado: ${formatDate(new Date().toISOString().slice(0, 10))}`,
      `Destinatario: ${company?.gestorFirm || company?.gestorName || 'Gestoría Externa'}`,
      'Estado: Preparado para revisión profesional',
    ]
  );

  const issuedBase = issuedInvoices.reduce((s, i) => s + i.taxBase, 0);
  const issuedVat = issuedInvoices.reduce((s, i) => s + i.vatAmount, 0);
  const issuedTotal = issuedInvoices.reduce((s, i) => s + i.total, 0);

  const recBase = expenses.reduce((s, e) => s + e.taxBase, 0);
  const recVat = expenses.reduce((s, e) => s + e.vatAmount, 0);
  const recTotal = expenses.reduce((s, e) => s + e.total, 0);

  autoTable(doc, {
    startY: yStart + 2,
    head: [['Resumen Económico del Periodo (Orientativo)', 'Registros', 'Base Imponible', 'IVA', 'Total']],
    body: [
      ['Facturas Emitidas (Ingresos / IVA Repercutido)', String(issuedInvoices.length), formatCurrency(issuedBase), formatCurrency(issuedVat), formatCurrency(issuedTotal)],
      ['Facturas Recibidas y Gastos (IVA Soportado)', String(expenses.length), formatCurrency(recBase), formatCurrency(recVat), formatCurrency(recTotal)],
      ['Diferencia estimada IVA (Repercutido - Soportado)', '—', '—', formatCurrency(issuedVat - recVat), '—'],
    ],
    headStyles: { fillColor: FOREST_RGB, textColor: [255, 255, 255], fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5, textColor: INK_RGB },
  });

  let nextY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // Expenses by category
  const byCategory: Record<string, number> = {};
  expenses.forEach((e) => {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.taxBase;
  });

  if (Object.keys(byCategory).length > 0) {
    autoTable(doc, {
      startY: nextY,
      head: [['Categoría de Gasto', 'Base Imponible Acumulada']],
      body: Object.entries(byCategory).map(([cat, val]) => [cat, formatCurrency(val)]),
      headStyles: { fillColor: [49, 83, 72], textColor: [255, 255, 255], fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5 },
    });
    nextY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...FOREST_RGB);
  doc.text('Incidencias y Verificaciones Previas para el Gestor:', 14, nextY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...INK_RGB);

  const lines = incidences.length > 0 ? incidences : ['Sin incidencias automáticas detectadas en los registros del periodo.'];
  let incY = nextY + 6;
  lines.forEach((inc) => {
    const wrapped = doc.splitTextToSize(`• ${inc}`, 180);
    doc.text(wrapped, 14, incY);
    incY += wrapped.length * 4.5 + 1.5;
  });

  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED_RGB);
  doc.text(
    'AVISO: Los importes reflejados proceden de los registros internos de la plataforma y están sujetos a revisión contable y fiscal oficial por la gestoría.',
    14,
    284
  );

  return doc.output('blob');
}

export function generateReportPdf(params: {
  title: string;
  subtitle: string;
  headers: string[];
  rows: (string | number)[][];
  summaryLines: string[];
  company: CompanySettings | null;
}): void {
  const doc = new jsPDF();
  const yStart = addCompanyHeader(doc, params.company, 'INFORME DE GESTIÓN', params.title, [
    params.subtitle,
    `Generado: ${formatDate(new Date().toISOString().slice(0, 10))}`,
  ]);

  autoTable(doc, {
    startY: yStart + 2,
    head: [params.headers],
    body: params.rows.map((r) => r.map(String)),
    headStyles: { fillColor: FOREST_RGB, textColor: [255, 255, 255], fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: INK_RGB },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  doc.setTextColor(...FOREST_RGB);
  params.summaryLines.forEach((line, idx) => {
    doc.text(line, 14, finalY + idx * 5.5);
  });

  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED_RGB);
  doc.text(
    'Los importes mostrados reflejan registros operativos internos y no sustituyen los estados contables o fiscales oficialmente presentados.',
    14,
    284
  );

  doc.save(`${params.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`);
}
