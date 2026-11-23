import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightCircle,
  Briefcase,
  Edit3,
  FileDown,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { StatusLabel } from '../components/ui/StatusLabel';
import { useAuth } from '../context/AuthContext';
import { useErpData } from '../context/ErpDataContext';
import { addDaysIso, calculateLinesTotals, formatCurrency, formatDate, todayIso } from '../lib/formatters';
import { generateQuotePdf } from '../lib/pdfGenerator';
import type { LineItem, Quote, QuoteStatus } from '../types/erp';

const QUOTE_STATUSES: QuoteStatus[] = ['borrador', 'enviado', 'aceptado', 'rechazado', 'caducado'];

export const QuotesModule: React.FC<{ initialAction?: string; onClearAction?: () => void }> = ({
  initialAction,
  onClearAction,
}) => {
  const { permissions } = useAuth();
  const {
    quotes,
    clients,
    companySettings,
    saveQuote,
    deleteQuote,
    convertQuoteToProject,
    convertQuoteToInvoice,
    notify,
  } = useErpData();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    number: '',
    series: `P-${new Date().getFullYear()}`,
    clientId: '',
    issueDate: todayIso(),
    validUntil: addDaysIso(todayIso(), 30),
    status: 'borrador' as QuoteStatus,
    retentionRate: 0,
    notes: '',
    lines: [{ description: '', quantity: 1, unitPrice: 0, discountPercent: 0, vatRate: 21 }] as LineItem[],
  });

  useEffect(() => {
    if (initialAction === 'new' && permissions.canWriteQuotes) {
      openCreate();
      onClearAction?.();
    }
  }, [initialAction, permissions.canWriteQuotes, onClearAction]);

  const nextQuoteNumber = () => {
    const yr = new Date().getFullYear();
    const prefix = `P-${yr}`;
    const count = quotes.filter((q) => q.series === prefix).length + 1;
    return `${prefix}-${String(count).padStart(4, '0')}`;
  };

  const openCreate = () => {
    const yr = new Date().getFullYear();
    setEditing(null);
    setForm({
      number: nextQuoteNumber(),
      series: `P-${yr}`,
      clientId: clients[0]?.id || '',
      issueDate: todayIso(),
      validUntil: addDaysIso(todayIso(), 30),
      status: 'borrador',
      retentionRate: 0,
      notes: '',
      lines: [{ description: '', quantity: 1, unitPrice: 0, discountPercent: 0, vatRate: 21 }],
    });
    setModalOpen(true);
  };

  const openEdit = (q: Quote) => {
    setEditing(q);
    setForm({
      number: q.number,
      series: q.series,
      clientId: q.clientId,
      issueDate: q.issueDate,
      validUntil: q.validUntil,
      status: q.status,
      retentionRate: q.retentionRate || 0,
      notes: q.notes || '',
      lines: q.lines.length > 0 ? q.lines : [{ description: '', quantity: 1, unitPrice: 0, discountPercent: 0, vatRate: 21 }],
    });
    setModalOpen(true);
  };

  const totals = useMemo(
    () => calculateLinesTotals(form.lines, form.retentionRate),
    [form.lines, form.retentionRate]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientId || form.lines.some((l) => !l.description.trim())) {
      notify('error', 'Selecciona un cliente y completa la descripción de cada concepto.');
      return;
    }
    const client = clients.find((c) => c.id === form.clientId);
    setSaving(true);
    try {
      await saveQuote(
        {
          number: form.number.trim(),
          series: form.series.trim(),
          clientId: form.clientId,
          clientName: client?.name || 'Cliente',
          clientTaxId: client?.taxId || '',
          issueDate: form.issueDate,
          validUntil: form.validUntil,
          status: form.status,
          lines: form.lines,
          taxBase: totals.taxBase,
          vatAmount: totals.vatAmount,
          retentionRate: form.retentionRate,
          retentionAmount: totals.retentionAmount,
          total: totals.total,
          notes: form.notes,
          ...(editing?.convertedProjectId ? { convertedProjectId: editing.convertedProjectId } : {}),
          ...(editing?.convertedInvoiceId ? { convertedInvoiceId: editing.convertedInvoiceId } : {}),
        },
        editing?.id
      );
      setModalOpen(false);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Error al guardar el presupuesto.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes
      .filter((item) => (statusFilter === 'todos' ? true : item.status === statusFilter))
      .filter((item) => {
        if (!q) return true;
        return (
          item.number.toLowerCase().includes(q) ||
          item.clientName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  }, [quotes, search, statusFilter]);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-[#ECEEEB] rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-[#252B28]/45 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por número o cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-[#F8F8F5] border border-[#ECEEEB] rounded-md"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-[#F8F8F5] border border-[#ECEEEB] rounded-md"
          >
            <option value="todos">Todos los estados</option>
            {QUOTE_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        {permissions.canWriteQuotes && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#203C35] text-white rounded-md hover:bg-[#315348]"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo presupuesto
          </button>
        )}
      </div>

      <div className="bg-white border border-[#ECEEEB] rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-[#203C35]">No hay presupuestos emitidos</p>
            <p className="text-xs text-[#252B28]/60">
              Crea presupuestos con cálculo automático de IVA, descuentos y retenciones, listos para convertir en trabajo y factura.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F8F8F5] border-b border-[#ECEEEB]">
                <tr className="text-left text-[#252B28]/70">
                  <th className="px-4 py-3 font-medium">Número</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Emisión</th>
                  <th className="px-4 py-3 font-medium">Validez</th>
                  <th className="px-4 py-3 font-medium text-right">Base</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEEEB]">
                {filtered.map((q) => (
                  <tr key={q.id} className="hover:bg-[#F8F8F5]/70">
                    <td className="px-4 py-3 font-mono-tabular font-medium text-[#203C35]">{q.number}</td>
                    <td className="px-4 py-3">{q.clientName}</td>
                    <td className="px-4 py-3 font-mono-tabular">{formatDate(q.issueDate)}</td>
                    <td className="px-4 py-3 font-mono-tabular">{formatDate(q.validUntil)}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular">{formatCurrency(q.taxBase)}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-medium text-[#203C35]">
                      {formatCurrency(q.total)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel value={q.status} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                      <button
                        type="button"
                        onClick={() => generateQuotePdf(q, companySettings)}
                        title="Descargar PDF"
                        className="p-1.5 text-[#252B28]/70 hover:text-[#203C35] rounded hover:bg-[#ECEEEB]"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                      </button>
                      {q.status === 'aceptado' && !q.convertedProjectId && permissions.canWriteProjects && (
                        <button
                          type="button"
                          onClick={() => convertQuoteToProject(q)}
                          title="Convertir en trabajo"
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-[#F8F8F5] border border-[#ECEEEB] rounded hover:bg-[#ECEEEB]"
                        >
                          <Briefcase className="w-3 h-3" />
                          A trabajo
                        </button>
                      )}
                      {q.status === 'aceptado' && !q.convertedInvoiceId && permissions.canWriteInvoices && (
                        <button
                          type="button"
                          onClick={() => convertQuoteToInvoice(q)}
                          title="Convertir en borrador de factura"
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-[#203C35] text-white rounded hover:bg-[#315348]"
                        >
                          <ArrowRightCircle className="w-3 h-3" />
                          A factura
                        </button>
                      )}
                      {permissions.canWriteQuotes && (q.status === 'borrador' || q.status === 'enviado') && (
                        <button
                          type="button"
                          onClick={() => openEdit(q)}
                          title="Editar"
                          className="p-1.5 text-[#252B28]/70 hover:text-[#203C35] rounded hover:bg-[#ECEEEB]"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {permissions.canWriteInvoices && q.status === 'borrador' && (
                        <button
                          type="button"
                          onClick={() => deleteQuote(q.id)}
                          title="Eliminar borrador"
                          className="p-1.5 text-[#252B28]/70 hover:text-[#B42318] rounded hover:bg-[#ECEEEB]"
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

      {/* Quote Editor Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar presupuesto ${editing.number}` : 'Nuevo presupuesto'}
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="space-y-1">
              <span className="font-medium">Número</span>
              <input
                type="text"
                required
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md font-mono-tabular"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium">Cliente *</span>
              <select
                required
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
              <span className="font-medium">Estado</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as QuoteStatus })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                {QUOTE_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
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
              <span className="font-medium">Fecha validez</span>
              <input
                type="date"
                value={form.validUntil}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
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
          </div>

          {/* Lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#203C35]">Conceptos del presupuesto</span>
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
                + Añadir línea
              </button>
            </div>
            <div className="space-y-2">
              {form.lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-[#F8F8F5] p-2 rounded border border-[#ECEEEB]">
                  <input
                    type="text"
                    placeholder="Descripción del servicio o partida"
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
                    min="0"
                    placeholder="Uds"
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
                    placeholder="Precio"
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
                    placeholder="Dto%"
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
                    className="col-span-1 text-center text-[#B42318] hover:underline"
                    title="Quitar línea"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#F8F8F5] border border-[#ECEEEB] rounded-md p-4 flex flex-col sm:flex-row justify-between gap-4">
            <label className="flex-1 space-y-1">
              <span className="font-medium">Condiciones y observaciones</span>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-[#ECEEEB] rounded-md"
              />
            </label>
            <div className="min-w-[210px] space-y-1 font-mono-tabular text-right">
              <div className="flex justify-between">
                <span className="text-[#252B28]/65">Base imponible:</span>
                <span>{formatCurrency(totals.taxBase)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#252B28]/65">IVA:</span>
                <span>{formatCurrency(totals.vatAmount)}</span>
              </div>
              {totals.retentionAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-[#252B28]/65">Retención:</span>
                  <span>-{formatCurrency(totals.retentionAmount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1.5 border-t border-[#ECEEEB] text-sm font-semibold text-[#203C35]">
                <span>Total:</span>
                <span>{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#ECEEEB]">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-[#ECEEEB] rounded-md">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-[#203C35] text-white rounded-md hover:bg-[#315348]"
            >
              {saving ? 'Guardando...' : 'Guardar presupuesto'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
