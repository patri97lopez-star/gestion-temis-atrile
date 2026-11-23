import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useErpData } from '../context/ErpDataContext';
import { exportExcel } from '../lib/exportUtils';
import { formatCurrency, formatDate, round2 } from '../lib/formatters';
import { generateReportPdf } from '../lib/pdfGenerator';
import { EXPENSE_CATEGORIES } from '../types/erp';

type ReportKind =
  | 'facturacion_mensual'
  | 'facturacion_anual'
  | 'ingresos_gastos'
  | 'beneficio_estimado'
  | 'iva'
  | 'pendientes'
  | 'clientes_rentables'
  | 'proyectos_rentables'
  | 'gastos_categoria';

const REPORT_OPTIONS: { key: ReportKind; label: string }[] = [
  { key: 'facturacion_mensual', label: 'Facturación mensual' },
  { key: 'facturacion_anual', label: 'Facturación anual' },
  { key: 'ingresos_gastos', label: 'Ingresos y gastos' },
  { key: 'beneficio_estimado', label: 'Beneficio estimado' },
  { key: 'iva', label: 'IVA repercutido y soportado' },
  { key: 'pendientes', label: 'Facturas pendientes' },
  { key: 'clientes_rentables', label: 'Clientes más rentables' },
  { key: 'proyectos_rentables', label: 'Proyectos más rentables' },
  { key: 'gastos_categoria', label: 'Gastos por categoría' },
];

export const ReportsModule: React.FC = () => {
  const { invoices, expenses, clients, suppliers, projects, companySettings, notify } = useErpData();

  const currentYear = new Date().getFullYear();
  const [reportKind, setReportKind] = useState<ReportKind>('facturacion_mensual');
  const [dateFrom, setDateFrom] = useState(`${currentYear}-01-01`);
  const [dateTo, setDateTo] = useState(`${currentYear}-12-31`);
  const [clientId, setClientId] = useState('todos');
  const [supplierFilter, setSupplierFilter] = useState('todos');
  const [categoryFilter, setCategoryFilter] = useState('todos');
  const [projectId, setProjectId] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');

  const filteredInvoices = useMemo(() => {
    return invoices
      .filter((i) => i.status !== 'Borrador')
      .filter((i) => (!dateFrom || i.issueDate >= dateFrom) && (!dateTo || i.issueDate <= dateTo))
      .filter((i) => (clientId === 'todos' ? true : i.clientId === clientId))
      .filter((i) => (projectId === 'todos' ? true : i.projectId === projectId))
      .filter((i) => (statusFilter === 'todos' ? true : i.status === statusFilter));
  }, [invoices, dateFrom, dateTo, clientId, projectId, statusFilter]);

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((e) => (!dateFrom || e.date >= dateFrom) && (!dateTo || e.date <= dateTo))
      .filter((e) => (clientId === 'todos' ? true : e.clientId === clientId))
      .filter((e) => (supplierFilter === 'todos' ? true : e.supplierName === supplierFilter))
      .filter((e) => (categoryFilter === 'todos' ? true : e.category === categoryFilter))
      .filter((e) => (projectId === 'todos' ? true : e.projectId === projectId));
  }, [expenses, dateFrom, dateTo, clientId, supplierFilter, categoryFilter, projectId]);

  const reportData = useMemo<{
    title: string;
    headers: string[];
    rows: (string | number)[][];
    summary: string[];
  }>(() => {
    switch (reportKind) {
      case 'facturacion_mensual': {
        const months: Record<string, { count: number; base: number; vat: number; total: number }> = {};
        filteredInvoices.forEach((i) => {
          const ym = i.issueDate.slice(0, 7);
          months[ym] = months[ym] || { count: 0, base: 0, vat: 0, total: 0 };
          months[ym].count += 1;
          months[ym].base += i.taxBase;
          months[ym].vat += i.vatAmount;
          months[ym].total += i.total;
        });
        const rows = Object.entries(months)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([ym, d]) => [ym, d.count, round2(d.base), round2(d.vat), round2(d.total)]);
        return {
          title: 'Informe de Facturación Mensual',
          headers: ['Mes', 'Nº Facturas', 'Base Imponible (€)', 'IVA (€)', 'Total (€)'],
          rows,
          summary: [
            `Total Base: ${formatCurrency(filteredInvoices.reduce((s, i) => s + i.taxBase, 0))}`,
            `Total Facturado: ${formatCurrency(filteredInvoices.reduce((s, i) => s + i.total, 0))}`,
          ],
        };
      }
      case 'facturacion_anual': {
        const years: Record<string, { count: number; base: number; vat: number; total: number }> = {};
        filteredInvoices.forEach((i) => {
          const yr = i.issueDate.slice(0, 4);
          years[yr] = years[yr] || { count: 0, base: 0, vat: 0, total: 0 };
          years[yr].count += 1;
          years[yr].base += i.taxBase;
          years[yr].vat += i.vatAmount;
          years[yr].total += i.total;
        });
        const rows = Object.entries(years)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([yr, d]) => [yr, d.count, round2(d.base), round2(d.vat), round2(d.total)]);
        return {
          title: 'Informe de Facturación Anual',
          headers: ['Ejercicio', 'Nº Facturas', 'Base Imponible (€)', 'IVA (€)', 'Total (€)'],
          rows,
          summary: [
            `Acumulado Base: ${formatCurrency(filteredInvoices.reduce((s, i) => s + i.taxBase, 0))}`,
          ],
        };
      }
      case 'ingresos_gastos':
      case 'beneficio_estimado': {
        const months = new Set<string>();
        filteredInvoices.forEach((i) => months.add(i.issueDate.slice(0, 7)));
        filteredExpenses.forEach((e) => months.add(e.date.slice(0, 7)));
        const rows = Array.from(months)
          .sort()
          .map((ym) => {
            const inc = filteredInvoices
              .filter((i) => i.issueDate.startsWith(ym))
              .reduce((s, i) => s + i.taxBase, 0);
            const exp = filteredExpenses
              .filter((e) => e.date.startsWith(ym))
              .reduce((s, e) => s + e.taxBase, 0);
            return [ym, round2(inc), round2(exp), round2(inc - exp)];
          });
        const totalInc = filteredInvoices.reduce((s, i) => s + i.taxBase, 0);
        const totalExp = filteredExpenses.reduce((s, e) => s + e.taxBase, 0);
        return {
          title:
            reportKind === 'ingresos_gastos'
              ? 'Informe de Ingresos y Gastos'
              : 'Informe de Beneficio Estimado',
          headers: ['Mes', 'Ingresos Base (€)', 'Gastos Base (€)', 'Resultado Estimado (€)'],
          rows,
          summary: [
            `Ingresos Base: ${formatCurrency(totalInc)} · Gastos Base: ${formatCurrency(totalExp)}`,
            `Beneficio Estimado: ${formatCurrency(totalInc - totalExp)}`,
          ],
        };
      }
      case 'iva': {
        const ivaRep = filteredInvoices.reduce((s, i) => s + i.vatAmount, 0);
        const ivaSop = filteredExpenses.reduce((s, e) => s + e.vatAmount, 0);
        return {
          title: 'Informe de IVA Repercutido y Soportado',
          headers: ['Concepto', 'Base Imponible (€)', 'Cuota IVA (€)'],
          rows: [
            [
              'IVA Repercutido (Facturas Emitidas)',
              round2(filteredInvoices.reduce((s, i) => s + i.taxBase, 0)),
              round2(ivaRep),
            ],
            [
              'IVA Soportado (Facturas Recibidas y Gastos)',
              round2(filteredExpenses.reduce((s, e) => s + e.taxBase, 0)),
              round2(ivaSop),
            ],
            ['Diferencia Orientativa (Repercutido - Soportado)', '—', round2(ivaRep - ivaSop)],
          ],
          summary: [
            `Diferencia orientativa IVA: ${formatCurrency(ivaRep - ivaSop)} (sujeto a revisión de gestoría)`,
          ],
        };
      }
      case 'pendientes': {
        const pending = filteredInvoices.filter(
          (i) => i.status !== 'Cobrada' && i.status !== 'Rectificada' && i.total - i.paidAmount > 0.01
        );
        return {
          title: 'Informe de Facturas Pendientes de Cobro',
          headers: ['Número', 'Cliente', 'Emisión', 'Vencimiento', 'Total (€)', 'Pendiente (€)', 'Estado'],
          rows: pending.map((i) => [
            i.number,
            i.clientName,
            formatDate(i.issueDate),
            formatDate(i.dueDate),
            round2(i.total),
            round2(i.total - i.paidAmount),
            i.status,
          ]),
          summary: [
            `Total Pendiente de Cobro: ${formatCurrency(
              pending.reduce((s, i) => s + (i.total - i.paidAmount), 0)
            )}`,
          ],
        };
      }
      case 'clientes_rentables': {
        const rows = clients
          .map((c) => {
            const inc = filteredInvoices
              .filter((i) => i.clientId === c.id)
              .reduce((s, i) => s + i.taxBase, 0);
            const exp = filteredExpenses
              .filter((e) => e.clientId === c.id)
              .reduce((s, e) => s + e.taxBase, 0);
            return { name: c.name, inc, exp, margin: inc - exp };
          })
          .filter((r) => r.inc > 0 || r.exp > 0)
          .sort((a, b) => b.margin - a.margin)
          .map((r) => [r.name, round2(r.inc), round2(r.exp), round2(r.margin)]);
        return {
          title: 'Clientes Más Rentables',
          headers: ['Cliente', 'Facturación Base (€)', 'Gastos Imputados (€)', 'Margen Estimado (€)'],
          rows,
          summary: [`Clientes analizados: ${rows.length}`],
        };
      }
      case 'proyectos_rentables': {
        const rows = projects
          .filter((p) => (projectId === 'todos' ? true : p.id === projectId))
          .filter((p) => (clientId === 'todos' ? true : p.clientId === clientId))
          .map((p) => {
            const exp = filteredExpenses
              .filter((e) => e.projectId === p.id)
              .reduce((s, e) => s + e.taxBase, 0);
            const rev = p.invoicedAmount > 0 ? p.invoicedAmount : p.budgetedPrice;
            const margin = rev - p.internalCost - exp;
            return { name: p.name, cli: p.clientName, rev, cost: p.internalCost + exp, margin };
          })
          .sort((a, b) => b.margin - a.margin)
          .map((r) => [r.name, r.cli, round2(r.rev), round2(r.cost), round2(r.margin)]);
        return {
          title: 'Proyectos Más Rentables',
          headers: ['Proyecto', 'Cliente', 'Ingreso (€)', 'Coste + Gastos (€)', 'Margen Estimado (€)'],
          rows,
          summary: [`Proyectos evaluados: ${rows.length}`],
        };
      }
      case 'gastos_categoria': {
        const map: Record<string, { count: number; base: number; vat: number; total: number }> = {};
        filteredExpenses.forEach((e) => {
          map[e.category] = map[e.category] || { count: 0, base: 0, vat: 0, total: 0 };
          map[e.category].count += 1;
          map[e.category].base += e.taxBase;
          map[e.category].vat += e.vatAmount;
          map[e.category].total += e.total;
        });
        const rows = Object.entries(map)
          .sort((a, b) => b[1].base - a[1].base)
          .map(([cat, d]) => [cat, d.count, round2(d.base), round2(d.vat), round2(d.total)]);
        return {
          title: 'Gastos por Categoría',
          headers: ['Categoría', 'Registros', 'Base Imponible (€)', 'IVA Soportado (€)', 'Total (€)'],
          rows,
          summary: [
            `Total Gastos Base: ${formatCurrency(filteredExpenses.reduce((s, e) => s + e.taxBase, 0))}`,
          ],
        };
      }
    }
  }, [reportKind, filteredInvoices, filteredExpenses, clients, projects, clientId, projectId]);

  return (
    <div className="space-y-5">
      {/* Filters Bar */}
      <div className="bg-white border border-[#ECEEEB] rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {REPORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setReportKind(opt.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                  reportKind === opt.key
                    ? 'bg-[#203C35] text-white'
                    : 'bg-[#F8F8F5] text-[#252B28]/75 border border-[#ECEEEB] hover:bg-[#ECEEEB]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={async () => {
                await exportExcel(
                  `${reportData.title.replace(/\s+/g, '_')}.xlsx`,
                  'Informe',
                  reportData.headers,
                  reportData.rows
                );
                notify('success', 'Informe exportado en Excel.');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#F8F8F5] border border-[#ECEEEB] rounded-md hover:bg-[#ECEEEB]"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Excel
            </button>
            <button
              type="button"
              onClick={() => {
                generateReportPdf({
                  title: reportData.title,
                  subtitle: `Periodo: ${formatDate(dateFrom)} - ${formatDate(dateTo)}`,
                  headers: reportData.headers,
                  rows: reportData.rows,
                  summaryLines: reportData.summary,
                  company: companySettings,
                });
                notify('success', 'Informe PDF generado.');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#203C35] text-white rounded-md hover:bg-[#315348]"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar PDF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs pt-2 border-t border-[#ECEEEB]">
          <label className="space-y-1">
            <span className="text-[#252B28]/65">Desde</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#F8F8F5] border border-[#ECEEEB] rounded"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[#252B28]/65">Hasta</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#F8F8F5] border border-[#ECEEEB] rounded"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[#252B28]/65">Cliente</span>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#F8F8F5] border border-[#ECEEEB] rounded"
            >
              <option value="todos">Todos</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[#252B28]/65">Proveedor</span>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#F8F8F5] border border-[#ECEEEB] rounded"
            >
              <option value="todos">Todos</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[#252B28]/65">Categoría gasto</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#F8F8F5] border border-[#ECEEEB] rounded"
            >
              <option value="todos">Todas</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[#252B28]/65">Proyecto</span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#F8F8F5] border border-[#ECEEEB] rounded"
            >
              <option value="todos">Todos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Report Table */}
      <div className="bg-white border border-[#ECEEEB] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#ECEEEB] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#203C35]">{reportData.title}</h3>
          <div className="text-xs font-mono-tabular text-[#315348]">
            {reportData.summary.join(' · ')}
          </div>
        </div>
        {reportData.rows.length === 0 ? (
          <p className="p-10 text-center text-xs text-[#252B28]/60">
            No hay registros que cumplan los filtros seleccionados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F8F8F5] border-b border-[#ECEEEB]">
                <tr className="text-left text-[#252B28]/70">
                  {reportData.headers.map((h) => (
                    <th key={h} className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEEEB]">
                {reportData.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-[#F8F8F5]/70">
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className={`px-4 py-3 ${
                          typeof cell === 'number' ? 'font-mono-tabular' : ''
                        }`}
                      >
                        {typeof cell === 'number' && reportData.headers[cIdx]?.includes('€')
                          ? formatCurrency(cell)
                          : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
