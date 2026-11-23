import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  Download,
  Edit3,
  FileDown,
  FileWarning,
  History,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { StatusLabel } from '../components/ui/StatusLabel';
import { useAuth } from '../context/AuthContext';
import { useErpData } from '../context/ErpDataContext';
import { downloadDocumentRecord } from '../lib/fileStorage';
import { addDaysIso, calculateLinesTotals, formatCurrency, formatDate, todayIso } from '../lib/formatters';
import { generateInvoicePdf } from '../lib/pdfGenerator';
import type { Invoice, InvoicePayment, InvoiceStatus, LineItem } from '../types/erp';

const INVOICE_STATUSES: InvoiceStatus[] = [
  'Borrador',
  'Emitida',
  'Pendiente de cobro',
  'Parcialmente cobrada',
  'Cobrada',
  'Vencida',
  'Rectificada',
];

export const InvoicesModule: React.FC<{ initialAction?: string; onClearAction?: () => void }> = ({
  initialAction,
  onClearAction,
}) => {
  const { permissions } = useAuth();
  const {
    invoices,
    invoicePayments,
    expenses,
    documents,
    clients,
    projects,
    companySettings,
    saveInvoice,
    deleteDraftInvoice,
    registerInvoicePayment,
    createRectifyingInvoice,
    notify,
  } = useErpData();

  const [tab, setTab] = useState<'emitidas' | 'recibidas'>('emitidas');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [saving, setSaving] = useState(false);

  const [paymentModalInv, setPaymentModalInv] = useState<Invoice | null>(null);
  const [payForm, setPayForm] = useState({
    amount: 0,
    paymentDate: todayIso(),
    method: 'Transferencia' as InvoicePayment['method'],
    reference: '',
    notes: '',
  });

  const [rectifyModalInv, setRectifyModalInv] = useState<Invoice | null>(null);
  const [rectifyReason, setRectifyReason] = useState('');

  const [historyModalInv, setHistoryModalInv] = useState<Invoice | null>(null);

  const defaultSeries = companySettings?.invoiceSeries?.[0] || `F-${new Date().getFullYear()}`;
  const [form, setForm] = useState({
    series: defaultSeries,
    issueDate: todayIso(),
    dueDate: addDaysIso(todayIso(), 30),
    clientId: '',
    projectId: '',
    retentionRate: 0,
    notes: '',
    lines: [{ description: '', quantity: 1, unitPrice: 0, discountPercent: 0, vatRate: 21 }] as LineItem[],
  });

  useEffect(() => {
    if (initialAction === 'new' && permissions.canWriteInvoices) {
      openCreate();
      onClearAction?.();
    }
  }, [initialAction, permissions.canWriteInvoices, onClearAction]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      series: companySettings?.invoiceSeries?.[0] || `F-${new Date().getFullYear()}`,
      issueDate: todayIso(),
      dueDate: addDaysIso(todayIso(), 30),
      clientId: clients[0]?.id || '',
      projectId: '',
      retentionRate: 0,
      notes: '',
      lines: [{ description: '', quantity: 1, unitPrice: 0, discountPercent: 0, vatRate: 21 }],
    });
    setEditorOpen(true);
  };

  const openEditDraft = (inv: Invoice) => {
    if (inv.locked) {
      notify('error', 'Las facturas definitivas están bloqueadas por trazabilidad fiscal.');
      return;
    }
    setEditing(inv);
    setForm({
      series: inv.series,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      clientId: inv.clientId,
      projectId: inv.projectId || '',
      retentionRate: inv.retentionRate || 0,
      notes: inv.notes || '',
      lines: inv.lines,
    });
    setEditorOpen(true);
  };

  const totals = useMemo(
    () => calculateLinesTotals(form.lines, form.retentionRate),
    [form.lines, form.retentionRate]
  );

  const handleSave = async (issueNow: boolean) => {
    if (!form.clientId || form.lines.some((l) => !l.description.trim())) {
      notify('error', 'Selecciona un cliente y completa los conceptos.');
      return;
    }
    const client = clients.find((c) => c.id === form.clientId);
    if (!client) return;

    setSaving(true);
    try {
      await saveInvoice(
        {
          number: editing?.number || `BORR-${Date.now().toString().slice(-5)}`,
          series: form.series,
          sequenceNumber: editing?.sequenceNumber || 0,
          issueDate: form.issueDate,
          dueDate: form.dueDate,
          clientId: client.id,
          clientName: client.name,
          clientTaxId: client.taxId,
          clientAddress: [client.fiscalAddress, client.postalCode, client.city, client.province]
            .filter(Boolean)
            .join(', '),
          lines: form.lines,
          taxBase: totals.taxBase,
          vatAmount: totals.vatAmount,
          retentionRate: form.retentionRate,
          retentionAmount: totals.retentionAmount,
          total: totals.total,
          paidAmount: 0,
          status: 'Borrador',
          locked: false,
          ...(form.projectId ? { projectId: form.projectId } : {}),
          notes: form.notes,
        },
        editing?.id,
        issueNow
      );
      setEditorOpen(false);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Error al guardar la factura.');
    } finally {
      setSaving(false);
    }
  };

  const today = todayIso();
  const displayIssued = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices
      .map((inv) => {
        const effectiveStatus: InvoiceStatus =
          inv.locked &&
          inv.status !== 'Cobrada' &&
          inv.status !== 'Rectificada' &&
          inv.dueDate < today &&
          inv.paidAmount < inv.total
            ? 'Vencida'
            : inv.status;
        return { ...inv, displayStatus: effectiveStatus };
      })
      .filter((inv) => (statusFilter === 'todos' ? true : inv.displayStatus === statusFilter))
      .filter((inv) => {
        if (!q) return true;
        return (
          inv.number.toLowerCase().includes(q) ||
          inv.clientName.toLowerCase().includes(q) ||
          inv.clientTaxId.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.sequenceNumber - a.sequenceNumber);
  }, [invoices, search, statusFilter, today]);

  const receivedInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses
      .filter((e) => {
        if (!q) return true;
        return (
          e.supplierName.toLowerCase().includes(q) ||
          (e.invoiceNumber || '').toLowerCase().includes(q) ||
          e.concept.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, search]);

  return (
    <div className="space-y-5">
      {/* VERI*FACTU / Ley Antifraude Technical Status Banner */}
      <div className="bg-white border border-[#ECEEEB] rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-[#203C35] shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <p className="font-semibold text-[#203C35]">
              Control de integridad y trazabilidad de facturación (preparado para Ley Antifraude)
            </p>
            <p className="text-[#252B28]/70">
              Las facturas emitidas respetan series secuenciales, bloqueo de inmutabilidad, encadenamiento de huella SHA-256 y rectificación trazable. La remisión electrónica oficial VERI*FACTU ante la AEAT requiere certificado digital y pasarela homologada externa (no conectada en este entorno).
            </p>
          </div>
        </div>
      </div>

      {/* Tabs + Controls */}
      <div className="bg-white border border-[#ECEEEB] rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#F8F8F5] border border-[#ECEEEB] rounded-md">
            <button
              type="button"
              onClick={() => setTab('emitidas')}
              className={`px-3 py-1.5 text-xs font-medium rounded ${
                tab === 'emitidas' ? 'bg-[#203C35] text-white' : 'text-[#252B28]/70'
              }`}
            >
              Facturas Emitidas ({invoices.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('recibidas')}
              className={`px-3 py-1.5 text-xs font-medium rounded ${
                tab === 'recibidas' ? 'bg-[#203C35] text-white' : 'text-[#252B28]/70'
              }`}
            >
              Facturas Recibidas ({expenses.length})
            </button>
          </div>

          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 text-[#252B28]/45 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar factura, cliente o CIF..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-[#F8F8F5] border border-[#ECEEEB] rounded-md"
            />
          </div>

          {tab === 'emitidas' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-[#F8F8F5] border border-[#ECEEEB] rounded-md"
            >
              <option value="todos">Todos los estados</option>
              {INVOICE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>

        {tab === 'emitidas' && permissions.canWriteInvoices && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#203C35] text-white rounded-md hover:bg-[#315348]"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva factura emitida
          </button>
        )}
      </div>

      {/* Tables */}
      {tab === 'emitidas' ? (
        <div className="bg-white border border-[#ECEEEB] rounded-lg overflow-hidden">
          {displayIssued.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-medium text-[#203C35]">No hay facturas emitidas</p>
              <p className="text-xs text-[#252B28]/60">
                Crea una factura en borrador o emítela directamente con numeración secuencial y huella de trazabilidad.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F8F8F5] border-b border-[#ECEEEB]">
                  <tr className="text-left text-[#252B28]/70">
                    <th className="px-4 py-3 font-medium">Número / Serie</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Emisión</th>
                    <th className="px-4 py-3 font-medium">Vencimiento</th>
                    <th className="px-4 py-3 font-medium text-right">Base</th>
                    <th className="px-4 py-3 font-medium text-right">IVA</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                    <th className="px-4 py-3 font-medium text-right">Cobrado</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECEEEB]">
                  {displayIssued.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#F8F8F5]/70">
                      <td className="px-4 py-3">
                        <div className="font-mono-tabular font-semibold text-[#203C35] flex items-center gap-1">
                          {inv.locked && <Lock className="w-3 h-3 text-[#C6A879]" />}
                          {inv.number}
                        </div>
                        <div className="text-[11px] text-[#252B28]/55">{inv.series}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{inv.clientName}</div>
                        <div className="text-[11px] font-mono-tabular text-[#252B28]/55">{inv.clientTaxId}</div>
                      </td>
                      <td className="px-4 py-3 font-mono-tabular">{formatDate(inv.issueDate)}</td>
                      <td className="px-4 py-3 font-mono-tabular">{formatDate(inv.dueDate)}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular">{formatCurrency(inv.taxBase)}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular">{formatCurrency(inv.vatAmount)}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-[#203C35]">
                        {formatCurrency(inv.total)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular">{formatCurrency(inv.paidAmount)}</td>
                      <td className="px-4 py-3">
                        <StatusLabel value={inv.displayStatus} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                        <button
                          type="button"
                          onClick={() => generateInvoicePdf(inv, companySettings)}
                          title="Descargar PDF"
                          className="p-1.5 text-[#252B28]/70 hover:text-[#203C35] rounded hover:bg-[#ECEEEB]"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setHistoryModalInv(inv)}
                          title="Ver trazabilidad y cobros"
                          className="p-1.5 text-[#252B28]/70 hover:text-[#203C35] rounded hover:bg-[#ECEEEB]"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                        {!inv.locked && permissions.canWriteInvoices && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditDraft(inv)}
                              title="Editar borrador"
                              className="p-1.5 text-[#252B28]/70 hover:text-[#203C35] rounded hover:bg-[#ECEEEB]"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteDraftInvoice(inv)}
                              title="Eliminar borrador"
                              className="p-1.5 text-[#252B28]/70 hover:text-[#B42318] rounded hover:bg-[#ECEEEB]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {inv.locked &&
                          inv.status !== 'Cobrada' &&
                          inv.status !== 'Rectificada' &&
                          inv.total > 0 &&
                          permissions.canWriteInvoices && (
                            <button
                              type="button"
                              onClick={() => {
                                setPaymentModalInv(inv);
                                setPayForm({
                                  amount: Number(Math.max(0, inv.total - inv.paidAmount).toFixed(2)),
                                  paymentDate: todayIso(),
                                  method: 'Transferencia',
                                  reference: '',
                                  notes: '',
                                });
                              }}
                              title="Registrar cobro"
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-[#203C35] text-white rounded hover:bg-[#315348]"
                            >
                              <CheckSquare className="w-3 h-3" />
                              Cobro
                            </button>
                          )}
                        {inv.locked &&
                          inv.status !== 'Rectificada' &&
                          !inv.rectifiesInvoiceId &&
                          permissions.canWriteInvoices && (
                            <button
                              type="button"
                              onClick={() => {
                                setRectifyModalInv(inv);
                                setRectifyReason('');
                              }}
                              title="Emitir factura rectificativa"
                              className="p-1.5 text-[#9A6315] hover:bg-[#ECEEEB] rounded"
                            >
                              <FileWarning className="w-3.5 h-3.5" />
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
      ) : (
        <div className="bg-white border border-[#ECEEEB] rounded-lg overflow-hidden">
          {receivedInvoices.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-medium text-[#203C35]">No hay facturas recibidas registradas</p>
              <p className="text-xs text-[#252B28]/60">
                Puedes registrar facturas de proveedores desde el módulo Gastos y Contabilidad o mediante lectura OCR en Asistente IA.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F8F8F5] border-b border-[#ECEEEB]">
                  <tr className="text-left text-[#252B28]/70">
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Proveedor / CIF</th>
                    <th className="px-4 py-3 font-medium">Nº Factura</th>
                    <th className="px-4 py-3 font-medium">Concepto</th>
                    <th className="px-4 py-3 font-medium">Categoría</th>
                    <th className="px-4 py-3 font-medium text-right">Base</th>
                    <th className="px-4 py-3 font-medium text-right">IVA sop.</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium text-right">Original</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECEEEB]">
                  {receivedInvoices.map((e) => {
                    const linkedDoc = e.documentId
                      ? documents.find((d) => d.id === e.documentId)
                      : undefined;
                    return (
                      <tr key={e.id} className="hover:bg-[#F8F8F5]/70">
                        <td className="px-4 py-3 font-mono-tabular">{formatDate(e.date)}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#203C35]">{e.supplierName}</div>
                          <div className="text-[11px] font-mono-tabular text-[#252B28]/55">{e.supplierTaxId || '—'}</div>
                        </td>
                        <td className="px-4 py-3 font-mono-tabular">{e.invoiceNumber || '—'}</td>
                        <td className="px-4 py-3 max-w-[220px] truncate">{e.concept}</td>
                        <td className="px-4 py-3">{e.category}</td>
                        <td className="px-4 py-3 text-right font-mono-tabular">{formatCurrency(e.taxBase)}</td>
                        <td className="px-4 py-3 text-right font-mono-tabular">{formatCurrency(e.vatAmount)}</td>
                        <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-[#203C35]">
                          {formatCurrency(e.total)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusLabel value={e.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {linkedDoc ? (
                            <button
                              type="button"
                              onClick={() => downloadDocumentRecord(linkedDoc)}
                              className="inline-flex items-center gap-1 px-2 py-1 border border-[#ECEEEB] rounded hover:bg-[#F8F8F5]"
                            >
                              <Download className="w-3 h-3" />
                              PDF
                            </button>
                          ) : (
                            <span className="text-[#252B28]/45">Sin archivo</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Invoice Editor Modal */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? `Editar borrador ${editing.number}` : 'Nueva factura emitida'}
        subtitle="Puedes guardar como borrador editable o emitir definitivamente con numeración correlativa y bloqueo."
        maxWidthClass="max-w-3xl"
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="space-y-1">
              <span className="font-medium">Serie</span>
              <select
                value={form.series}
                onChange={(e) => setForm({ ...form, series: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md font-mono-tabular"
              >
                {(companySettings?.invoiceSeries || [`F-${new Date().getFullYear()}`, `R-${new Date().getFullYear()}`]).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium">Cliente *</span>
              <select
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                <option value="">Selecciona cliente...</option>
                {clients
                  .filter((c) => !c.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.taxId})
                    </option>
                  ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium">Retención IRPF (%)</span>
              <select
                value={form.retentionRate}
                onChange={(e) => setForm({ ...form, retentionRate: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md font-mono-tabular"
              >
                {(companySettings?.retentionRates || [0, 7, 15]).map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium">Fecha emisión</span>
              <input
                type="date"
                value={form.issueDate}
                onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Fecha vencimiento</span>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium">Trabajo / Proyecto asociado (opcional)</span>
              <select
                value={form.projectId}
                onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                <option value="">Ninguno</option>
                {projects
                  .filter((p) => !form.clientId || p.clientId === form.clientId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-[#203C35]">Conceptos de factura</span>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    lines: [
                      ...form.lines,
                      { description: '', quantity: 1, unitPrice: 0, discountPercent: 0, vatRate: 21 },
                    ],
                  })
                }
                className="text-xs font-medium text-[#315348] hover:underline"
              >
                + Añadir concepto
              </button>
            </div>
            {form.lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-[#F8F8F5] p-2 rounded border border-[#ECEEEB]">
                <input
                  type="text"
                  placeholder="Descripción del concepto"
                  value={line.description}
                  onChange={(e) => {
                    const next = [...form.lines];
                    next[idx] = { ...next[idx], description: e.target.value };
                    setForm({ ...form, lines: next });
                  }}
                  className="col-span-12 sm:col-span-5 px-2.5 py-1.5 bg-white border border-[#ECEEEB] rounded"
                />
                <input
                  type="number"
                  step="0.01"
                  value={line.quantity}
                  onChange={(e) => {
                    const next = [...form.lines];
                    next[idx] = { ...next[idx], quantity: Number(e.target.value) };
                    setForm({ ...form, lines: next });
                  }}
                  className="col-span-3 sm:col-span-2 px-2 py-1.5 bg-white border border-[#ECEEEB] rounded font-mono-tabular text-right"
                />
                <input
                  type="number"
                  step="0.01"
                  value={line.unitPrice}
                  onChange={(e) => {
                    const next = [...form.lines];
                    next[idx] = { ...next[idx], unitPrice: Number(e.target.value) };
                    setForm({ ...form, lines: next });
                  }}
                  className="col-span-4 sm:col-span-2 px-2 py-1.5 bg-white border border-[#ECEEEB] rounded font-mono-tabular text-right"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={line.discountPercent}
                  onChange={(e) => {
                    const next = [...form.lines];
                    next[idx] = { ...next[idx], discountPercent: Number(e.target.value) };
                    setForm({ ...form, lines: next });
                  }}
                  className="col-span-2 sm:col-span-1 px-1.5 py-1.5 bg-white border border-[#ECEEEB] rounded font-mono-tabular text-right"
                />
                <select
                  value={line.vatRate}
                  onChange={(e) => {
                    const next = [...form.lines];
                    next[idx] = { ...next[idx], vatRate: Number(e.target.value) };
                    setForm({ ...form, lines: next });
                  }}
                  className="col-span-2 sm:col-span-1 px-1 py-1.5 bg-white border border-[#ECEEEB] rounded font-mono-tabular"
                >
                  {(companySettings?.vatRates || [21, 10, 4, 0]).map((v) => (
                    <option key={v} value={v}>
                      {v}%
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (form.lines.length <= 1) return;
                    setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) });
                  }}
                  className="col-span-1 text-[#B42318]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="bg-[#F8F8F5] border border-[#ECEEEB] rounded-md p-4 flex flex-col sm:flex-row justify-between gap-4">
            <textarea
              rows={2}
              placeholder="Notas o observaciones en factura..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="flex-1 px-3 py-2 bg-white border border-[#ECEEEB] rounded-md"
            />
            <div className="min-w-[210px] space-y-1 font-mono-tabular text-right">
              <div className="flex justify-between">
                <span>Base imponible:</span>
                <span>{formatCurrency(totals.taxBase)}</span>
              </div>
              <div className="flex justify-between">
                <span>IVA repercutido:</span>
                <span>{formatCurrency(totals.vatAmount)}</span>
              </div>
              {totals.retentionAmount > 0 && (
                <div className="flex justify-between">
                  <span>Retención:</span>
                  <span>-{formatCurrency(totals.retentionAmount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1.5 border-t border-[#ECEEEB] text-sm font-semibold text-[#203C35]">
                <span>Total factura:</span>
                <span>{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-[#ECEEEB]">
            <button type="button" onClick={() => setEditorOpen(false)} className="px-4 py-2 border border-[#ECEEEB] rounded-md">
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(false)}
              className="px-4 py-2 bg-[#F8F8F5] border border-[#ECEEEB] rounded-md hover:bg-[#ECEEEB]"
            >
              Guardar borrador
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(true)}
              className="px-4 py-2 bg-[#203C35] text-white rounded-md hover:bg-[#315348]"
            >
              {saving ? 'Procesando...' : 'Emitir factura definitiva'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Register Payment Modal */}
      <Modal
        open={Boolean(paymentModalInv)}
        onClose={() => setPaymentModalInv(null)}
        title={`Registrar cobro · ${paymentModalInv?.number || ''}`}
        maxWidthClass="max-w-md"
      >
        {paymentModalInv && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (payForm.amount <= 0) return;
              await registerInvoicePayment({
                invoice: paymentModalInv,
                amount: Number(payForm.amount),
                paymentDate: payForm.paymentDate,
                method: payForm.method,
                reference: payForm.reference,
                notes: payForm.notes,
              });
              setPaymentModalInv(null);
            }}
            className="space-y-3 text-xs"
          >
            <div className="p-3 bg-[#F8F8F5] border border-[#ECEEEB] rounded flex justify-between font-mono-tabular">
              <span>Pendiente de cobro:</span>
              <strong>{formatCurrency(Math.max(0, paymentModalInv.total - paymentModalInv.paidAmount))}</strong>
            </div>
            <label className="block space-y-1">
              <span className="font-medium">Importe cobrado (€)</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={Number((paymentModalInv.total - paymentModalInv.paidAmount).toFixed(2))}
                required
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md font-mono-tabular"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-medium">Fecha de cobro</span>
              <input
                type="date"
                required
                value={payForm.paymentDate}
                onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-medium">Método de cobro</span>
              <select
                value={payForm.method}
                onChange={(e) => setPayForm({ ...payForm, method: e.target.value as InvoicePayment['method'] })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                <option value="Transferencia">Transferencia</option>
                <option value="Domiciliación">Domiciliación</option>
                <option value="Tarjeta">Tarjeta</option>
                <option value="Efectivo">Efectivo</option>
                <option value="Otro">Otro</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="font-medium">Referencia bancaria</span>
              <input
                type="text"
                value={payForm.reference}
                onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#ECEEEB]">
              <button type="button" onClick={() => setPaymentModalInv(null)} className="px-3 py-2 border border-[#ECEEEB] rounded-md">
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 bg-[#203C35] text-white rounded-md">
                Guardar cobro
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Rectifying Invoice Modal */}
      <Modal
        open={Boolean(rectifyModalInv)}
        onClose={() => setRectifyModalInv(null)}
        title={`Emitir factura rectificativa · ${rectifyModalInv?.number || ''}`}
        maxWidthClass="max-w-md"
      >
        {rectifyModalInv && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!rectifyReason.trim()) return;
              await createRectifyingInvoice(rectifyModalInv, rectifyReason.trim());
              setRectifyModalInv(null);
            }}
            className="space-y-4 text-xs"
          >
            <p className="text-[#252B28]/80">
              Las facturas definitivas no pueden modificarse ni eliminarse. Se generará una factura rectificativa negativa en la serie de rectificación manteniendo la cadena de trazabilidad.
            </p>
            <label className="block space-y-1">
              <span className="font-medium">Motivo de la rectificación *</span>
              <textarea
                rows={3}
                required
                placeholder="Ej. Error en base imponible / devolución de servicio..."
                value={rectifyReason}
                onChange={(e) => setRectifyReason(e.target.value)}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#ECEEEB]">
              <button type="button" onClick={() => setRectifyModalInv(null)} className="px-3 py-2 border border-[#ECEEEB] rounded-md">
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 bg-[#9A6315] text-white rounded-md">
                Emitir rectificativa
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Traceability & Payment History Modal */}
      <Modal
        open={Boolean(historyModalInv)}
        onClose={() => setHistoryModalInv(null)}
        title={`Historial y trazabilidad · ${historyModalInv?.number || ''}`}
      >
        {historyModalInv && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-[#F8F8F5] border border-[#ECEEEB] rounded space-y-1 font-mono-tabular">
              <div>Bloqueo fiscal: {historyModalInv.locked ? 'Inmutable (Emitida)' : 'Borrador editable'}</div>
              {historyModalInv.verifactuHash && (
                <>
                  <div className="break-all">Huella SHA-256: {historyModalInv.verifactuHash}</div>
                  <div className="break-all text-[#252B28]/60">Huella anterior: {historyModalInv.verifactuPrevHash}</div>
                </>
              )}
              {historyModalInv.rectificationReason && (
                <div className="text-[#9A6315]">Motivo rectificación: {historyModalInv.rectificationReason}</div>
              )}
            </div>

            <div>
              <h4 className="font-semibold text-[#203C35] mb-2">Cobros registrados</h4>
              {invoicePayments.filter((p) => p.invoiceId === historyModalInv.id).length === 0 ? (
                <p className="text-[#252B28]/60">Aún no se han registrado cobros para esta factura.</p>
              ) : (
                <div className="divide-y divide-[#ECEEEB]">
                  {invoicePayments
                    .filter((p) => p.invoiceId === historyModalInv.id)
                    .map((p) => (
                      <div key={p.id} className="py-2 flex justify-between">
                        <span>
                          {formatDate(p.paymentDate)} · {p.method} {p.reference ? `(${p.reference})` : ''}
                        </span>
                        <span className="font-mono-tabular font-semibold text-[#203C35]">
                          {formatCurrency(p.amount)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
