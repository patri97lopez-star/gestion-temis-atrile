import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Download,
  Edit3,
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { AreaEvolutionChart, DonutBreakdownChart, HorizontalBarList } from '../components/ui/Charts';
import { Modal } from '../components/ui/Modal';
import { StatusLabel } from '../components/ui/StatusLabel';
import { useAuth } from '../context/AuthContext';
import { useErpData } from '../context/ErpDataContext';
import { exportExcel } from '../lib/exportUtils';
import { uploadDocumentToFirestore } from '../lib/fileStorage';
import { formatCurrency, formatDate, round2, todayIso } from '../lib/formatters';
import { generateReportPdf } from '../lib/pdfGenerator';
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory } from '../types/erp';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const ExpensesAccountingModule: React.FC<{ initialAction?: string; onClearAction?: () => void }> = ({
  initialAction,
  onClearAction,
}) => {
  const { permissions, firebaseUser, profile } = useAuth();
  const {
    expenses,
    invoices,
    suppliers,
    clients,
    projects,
    companySettings,
    saveExpense,
    deleteExpense,
    notify,
  } = useErpData();

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    supplierId: '',
    supplierName: '',
    supplierTaxId: '',
    invoiceNumber: '',
    date: todayIso(),
    concept: '',
    taxBase: 0,
    vatRate: 21,
    category: 'Software y suscripciones' as ExpenseCategory,
    paymentDate: todayIso(),
    status: 'Pagado' as 'Pendiente' | 'Pagado',
    clientId: '',
    projectId: '',
    notes: '',
  });

  useEffect(() => {
    if (initialAction === 'new' && permissions.canWriteExpenses) {
      openCreate();
      onClearAction?.();
    }
  }, [initialAction, permissions.canWriteExpenses, onClearAction]);

  const openCreate = () => {
    setEditing(null);
    setAttachedFile(null);
    setForm({
      supplierId: '',
      supplierName: '',
      supplierTaxId: '',
      invoiceNumber: '',
      date: todayIso(),
      concept: '',
      taxBase: 0,
      vatRate: 21,
      category: 'Software y suscripciones',
      paymentDate: todayIso(),
      status: 'Pagado',
      clientId: '',
      projectId: '',
      notes: '',
    });
    setModalOpen(true);
  };

  const openEdit = (e: Expense) => {
    setEditing(e);
    setAttachedFile(null);
    setForm({
      supplierId: e.supplierId || '',
      supplierName: e.supplierName,
      supplierTaxId: e.supplierTaxId || '',
      invoiceNumber: e.invoiceNumber || '',
      date: e.date,
      concept: e.concept,
      taxBase: e.taxBase,
      vatRate: e.vatRate,
      category: e.category,
      paymentDate: e.paymentDate || '',
      status: e.status,
      clientId: e.clientId || '',
      projectId: e.projectId || '',
      notes: e.notes || '',
    });
    setModalOpen(true);
  };

  const computedVat = round2((Number(form.taxBase) || 0) * ((Number(form.vatRate) || 0) / 100));
  const computedTotal = round2((Number(form.taxBase) || 0) + computedVat);

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.supplierName.trim() || !form.concept.trim()) {
      notify('error', 'Indica el proveedor y el concepto del gasto.');
      return;
    }
    setSaving(true);
    try {
      let documentId = editing?.documentId || '';
      if (attachedFile && firebaseUser && profile) {
        const uploaded = await uploadDocumentToFirestore({
          file: attachedFile,
          folder: 'Proveedores',
          docType: 'Factura recibida / Justificante',
          description: `${form.supplierName} · ${form.concept}`,
          supplierId: form.supplierId || undefined,
          clientId: form.clientId || undefined,
          projectId: form.projectId || undefined,
          uploadedByUid: firebaseUser.uid,
          uploadedByName: profile.displayName,
        });
        documentId = uploaded.id;
      }

      await saveExpense(
        {
          supplierId: form.supplierId || undefined,
          supplierName: form.supplierName.trim(),
          supplierTaxId: form.supplierTaxId.trim().toUpperCase(),
          invoiceNumber: form.invoiceNumber.trim(),
          date: form.date,
          concept: form.concept.trim(),
          taxBase: round2(Number(form.taxBase) || 0),
          vatRate: Number(form.vatRate) || 0,
          vatAmount: computedVat,
          total: computedTotal,
          category: form.category,
          paymentDate: form.status === 'Pagado' ? form.paymentDate || form.date : '',
          status: form.status,
          ...(form.clientId ? { clientId: form.clientId } : {}),
          ...(form.projectId ? { projectId: form.projectId } : {}),
          ...(documentId ? { documentId } : {}),
          notes: form.notes,
        },
        editing?.id
      );
      setModalOpen(false);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'No se pudo guardar el gasto.');
    } finally {
      setSaving(false);
    }
  };

  const currentMonthPrefix = `${selectedYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const summary = useMemo(() => {
    const validInvoices = invoices.filter((i) => i.status !== 'Borrador');
    const yearInvoices = validInvoices.filter((i) => i.issueDate.startsWith(`${selectedYear}-`));
    const yearExpenses = expenses.filter((e) => e.date.startsWith(`${selectedYear}-`));

    const monthlyIncome = validInvoices
      .filter((i) => i.issueDate.startsWith(currentMonthPrefix))
      .reduce((s, i) => s + i.taxBase, 0);
    const monthlyExpenses = expenses
      .filter((e) => e.date.startsWith(currentMonthPrefix))
      .reduce((s, e) => s + e.taxBase, 0);

    const ivaRepercutido = yearInvoices.reduce((s, i) => s + i.vatAmount, 0);
    const ivaSoportado = yearExpenses.reduce((s, e) => s + e.vatAmount, 0);
    const pendingInvoices = validInvoices
      .filter((i) => i.status !== 'Cobrada' && i.status !== 'Rectificada')
      .reduce((s, i) => s + Math.max(0, i.total - i.paidAmount), 0);

    const annualProfit =
      yearInvoices.reduce((s, i) => s + i.taxBase, 0) -
      yearExpenses.reduce((s, e) => s + e.taxBase, 0);

    return {
      monthlyIncome,
      monthlyExpenses,
      monthlyProfit: monthlyIncome - monthlyExpenses,
      ivaRepercutido,
      ivaSoportado,
      pendingInvoices,
      annualProfit,
    };
  }, [invoices, expenses, selectedYear, currentMonthPrefix]);

  const annualEvolution = useMemo(() => {
    return MONTHS.map((label, idx) => {
      const prefix = `${selectedYear}-${String(idx + 1).padStart(2, '0')}`;
      const inc = invoices
        .filter((i) => i.status !== 'Borrador' && i.issueDate.startsWith(prefix))
        .reduce((s, i) => s + i.taxBase, 0);
      const exp = expenses
        .filter((e) => e.date.startsWith(prefix))
        .reduce((s, e) => s + e.taxBase, 0);
      return { label, value: round2(inc - exp) };
    });
  }, [invoices, expenses, selectedYear]);

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    expenses
      .filter((e) => e.date.startsWith(`${selectedYear}-`))
      .forEach((e) => {
        map[e.category] = (map[e.category] || 0) + e.taxBase;
      });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));
  }, [expenses, selectedYear]);

  const clientProfitability = useMemo(() => {
    return clients
      .filter((c) => !c.archived)
      .map((c) => {
        const inc = invoices
          .filter((i) => i.clientId === c.id && i.status !== 'Borrador')
          .reduce((s, i) => s + i.taxBase, 0);
        const exp = expenses
          .filter((e) => e.clientId === c.id)
          .reduce((s, e) => s + e.taxBase, 0);
        return { label: c.name, value: round2(inc - exp), subLabel: `Ing: ${formatCurrency(inc)}` };
      })
      .filter((x) => x.value !== 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [clients, invoices, expenses]);

  const projectProfitability = useMemo(() => {
    return projects
      .map((p) => {
        const exp = expenses
          .filter((e) => e.projectId === p.id)
          .reduce((s, e) => s + e.taxBase, 0);
        const rev = p.invoicedAmount > 0 ? p.invoicedAmount : p.budgetedPrice;
        return { label: p.name, value: round2(rev - p.internalCost - exp) };
      })
      .filter((x) => x.value !== 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [projects, expenses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses
      .filter((e) => (catFilter === 'todos' ? true : e.category === catFilter))
      .filter((e) => (statusFilter === 'todos' ? true : e.status === statusFilter))
      .filter((e) => {
        if (!q) return true;
        return (
          e.supplierName.toLowerCase().includes(q) ||
          e.concept.toLowerCase().includes(q) ||
          (e.invoiceNumber || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, catFilter, statusFilter, search]);

  return (
    <div className="space-y-6">
      {/* Legal & Accounting Disclaimer */}
      <div className="bg-white border border-[#ECEEEB] rounded-lg p-4 flex items-start gap-3 text-xs">
        <AlertCircle className="w-4 h-4 text-[#C6A879] shrink-0 mt-0.5" />
        <p className="text-[#252B28]/80">
          <strong>Control económico operativo:</strong> Los importes de ingresos, gastos, IVA repercutido/soportado y beneficio estimado se calculan a partir de los registros internos introducidos. No sustituyen la contabilidad oficial ni las liquidaciones fiscales determinadas por tu gestoría.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-[#ECEEEB] rounded-lg p-4">
          <span className="text-[11px] text-[#252B28]/65">Ingresos mes</span>
          <div className="text-lg font-semibold text-[#203C35] font-mono-tabular mt-1">
            {formatCurrency(summary.monthlyIncome)}
          </div>
        </div>
        <div className="bg-white border border-[#ECEEEB] rounded-lg p-4">
          <span className="text-[11px] text-[#252B28]/65">Gastos mes</span>
          <div className="text-lg font-semibold text-[#203C35] font-mono-tabular mt-1">
            {formatCurrency(summary.monthlyExpenses)}
          </div>
        </div>
        <div className="bg-white border border-[#ECEEEB] rounded-lg p-4">
          <span className="text-[11px] text-[#252B28]/65">Beneficio est. mes</span>
          <div className="text-lg font-semibold text-[#315348] font-mono-tabular mt-1">
            {formatCurrency(summary.monthlyProfit)}
          </div>
        </div>
        <div className="bg-white border border-[#ECEEEB] rounded-lg p-4">
          <span className="text-[11px] text-[#252B28]/65">IVA repercutido ({selectedYear})</span>
          <div className="text-lg font-semibold text-[#203C35] font-mono-tabular mt-1">
            {formatCurrency(summary.ivaRepercutido)}
          </div>
        </div>
        <div className="bg-white border border-[#ECEEEB] rounded-lg p-4">
          <span className="text-[11px] text-[#252B28]/65">IVA soportado ({selectedYear})</span>
          <div className="text-lg font-semibold text-[#203C35] font-mono-tabular mt-1">
            {formatCurrency(summary.ivaSoportado)}
          </div>
        </div>
        <div className="bg-white border border-[#ECEEEB] rounded-lg p-4">
          <span className="text-[11px] text-[#252B28]/65">Facturas pendientes</span>
          <div className="text-lg font-semibold text-[#9A6315] font-mono-tabular mt-1">
            {formatCurrency(summary.pendingInvoices)}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#203C35]">
              Evolución anual resultado estimado ({selectedYear})
            </h3>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-2 py-1 text-xs border border-[#ECEEEB] rounded font-mono-tabular"
            >
              {[selectedYear - 1, selectedYear, selectedYear + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <AreaEvolutionChart points={annualEvolution} />
        </div>

        <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-[#203C35]">Distribución de gastos ({selectedYear})</h3>
          <DonutBreakdownChart items={categoryBreakdown} />
        </div>

        <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-[#203C35]">Rentabilidad estimada por cliente</h3>
          <HorizontalBarList items={clientProfitability} />
        </div>

        <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-[#203C35]">Rentabilidad estimada por proyecto</h3>
          <HorizontalBarList items={projectProfitability} />
        </div>
      </div>

      {/* Toolbar & Expenses Table */}
      <div className="bg-white border border-[#ECEEEB] rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="w-4 h-4 text-[#252B28]/45 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar proveedor, factura o concepto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-[#F8F8F5] border border-[#ECEEEB] rounded-md"
            />
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-[#F8F8F5] border border-[#ECEEEB] rounded-md"
          >
            <option value="todos">Todas las categorías</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-[#F8F8F5] border border-[#ECEEEB] rounded-md"
          >
            <option value="todos">Todos los estados</option>
            <option value="Pagado">Pagado</option>
            <option value="Pendiente">Pendiente</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              exportExcel(
                `Gastos_${selectedYear}.xlsx`,
                'Gastos',
                ['Fecha', 'Proveedor', 'CIF', 'Factura', 'Concepto', 'Categoría', 'Base', 'IVA', 'Total', 'Estado'],
                filtered.map((e) => [
                  e.date,
                  e.supplierName,
                  e.supplierTaxId || '',
                  e.invoiceNumber || '',
                  e.concept,
                  e.category,
                  e.taxBase,
                  e.vatAmount,
                  e.total,
                  e.status,
                ])
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#F8F8F5] border border-[#ECEEEB] rounded-md hover:bg-[#ECEEEB]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </button>
          <button
            type="button"
            onClick={() =>
              generateReportPdf({
                title: `Libro_Gastos_${selectedYear}`,
                subtitle: `Listado operativo de gastos y facturas recibidas`,
                headers: ['Fecha', 'Proveedor', 'Concepto', 'Categoría', 'Base', 'IVA', 'Total'],
                rows: filtered.map((e) => [
                  formatDate(e.date),
                  e.supplierName,
                  e.concept,
                  e.category,
                  formatCurrency(e.taxBase),
                  formatCurrency(e.vatAmount),
                  formatCurrency(e.total),
                ]),
                summaryLines: [
                  `Total Base Imponible: ${formatCurrency(filtered.reduce((s, e) => s + e.taxBase, 0))}`,
                  `Total IVA Soportado: ${formatCurrency(filtered.reduce((s, e) => s + e.vatAmount, 0))}`,
                ],
                company: companySettings,
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#F8F8F5] border border-[#ECEEEB] rounded-md hover:bg-[#ECEEEB]"
          >
            <Download className="w-3.5 h-3.5" />
            PDF
          </button>
          {permissions.canWriteExpenses && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#203C35] text-white rounded-md hover:bg-[#315348]"
            >
              <Plus className="w-3.5 h-3.5" />
              Registrar gasto
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-[#ECEEEB] rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-[#203C35]">No hay gastos registrados</p>
            <p className="text-xs text-[#252B28]/60">
              Registra facturas recibidas, nóminas, suministros o suscripciones para el cálculo de IVA soportado y cierre trimestral.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F8F8F5] border-b border-[#ECEEEB]">
                <tr className="text-left text-[#252B28]/70">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Proveedor</th>
                  <th className="px-4 py-3 font-medium">Concepto</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 font-medium text-right">Base</th>
                  <th className="px-4 py-3 font-medium text-right">IVA</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEEEB]">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-[#F8F8F5]/70">
                    <td className="px-4 py-3 font-mono-tabular">{formatDate(e.date)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#203C35]">{e.supplierName}</div>
                      <div className="text-[11px] font-mono-tabular text-[#252B28]/55">{e.invoiceNumber || ''}</div>
                    </td>
                    <td className="px-4 py-3">{e.concept}</td>
                    <td className="px-4 py-3">{e.category}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular">{formatCurrency(e.taxBase)}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular">{formatCurrency(e.vatAmount)}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-[#203C35]">
                      {formatCurrency(e.total)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel value={e.status} />
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      {permissions.canWriteExpenses && (
                        <button
                          type="button"
                          onClick={() => openEdit(e)}
                          className="p-1.5 text-[#252B28]/65 hover:text-[#203C35] rounded hover:bg-[#ECEEEB]"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {permissions.canDeleteNonFinancial && (
                        <button
                          type="button"
                          onClick={() => deleteExpense(e.id)}
                          className="p-1.5 text-[#252B28]/65 hover:text-[#B42318] rounded hover:bg-[#ECEEEB]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expense Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar gasto / factura recibida' : 'Registrar gasto o factura recibida'}
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="font-medium">Proveedor existente (opcional)</span>
              <select
                value={form.supplierId}
                onChange={(e) => {
                  const sup = suppliers.find((s) => s.id === e.target.value);
                  setForm({
                    ...form,
                    supplierId: e.target.value,
                    supplierName: sup ? sup.name : form.supplierName,
                    supplierTaxId: sup ? sup.taxId : form.supplierTaxId,
                  });
                }}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                <option value="">Introducir manualmente...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.taxId})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium">Nombre / Razón social proveedor *</span>
              <input
                type="text"
                required
                value={form.supplierName}
                onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">CIF/NIF proveedor</span>
              <input
                type="text"
                value={form.supplierTaxId}
                onChange={(e) => setForm({ ...form, supplierTaxId: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md font-mono-tabular uppercase"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Nº factura recibida</span>
              <input
                type="text"
                value={form.invoiceNumber}
                onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md font-mono-tabular"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Fecha *</span>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Categoría del gasto *</span>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium">Concepto *</span>
              <input
                type="text"
                required
                value={form.concept}
                onChange={(e) => setForm({ ...form, concept: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Base imponible (€) *</span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.taxBase}
                onChange={(e) => setForm({ ...form, taxBase: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md font-mono-tabular"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">IVA soportado (%)</span>
              <select
                value={form.vatRate}
                onChange={(e) => setForm({ ...form, vatRate: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md font-mono-tabular"
              >
                {(companySettings?.vatRates || [21, 10, 4, 0]).map((v) => (
                  <option key={v} value={v}>
                    {v}%
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2 p-3 bg-[#F8F8F5] border border-[#ECEEEB] rounded flex justify-between font-mono-tabular">
              <span>IVA calculado: {formatCurrency(computedVat)}</span>
              <strong className="text-[#203C35]">Total factura: {formatCurrency(computedTotal)}</strong>
            </div>
            <label className="space-y-1">
              <span className="font-medium">Estado de pago</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as 'Pendiente' | 'Pagado' })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                <option value="Pagado">Pagado</option>
                <option value="Pendiente">Pendiente</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium">Fecha de pago</span>
              <input
                type="date"
                value={form.paymentDate}
                onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Imputar a cliente (opcional)</span>
              <select
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                <option value="">Gasto general de empresa</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium">Imputar a proyecto (opcional)</span>
              <select
                value={form.projectId}
                onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                <option value="">Ninguno</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                Adjuntar factura original (PDF o imagen, máx 3,5 MB)
              </span>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => setAttachedFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md bg-[#F8F8F5]"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#ECEEEB]">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-[#ECEEEB] rounded-md">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-[#203C35] text-white rounded-md">
              {saving ? 'Guardando...' : 'Guardar gasto'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
