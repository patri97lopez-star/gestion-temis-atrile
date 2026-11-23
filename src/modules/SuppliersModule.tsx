import React, { useMemo, useState } from 'react';
import { ArrowLeft, Download, Edit3, Plus, Search, Trash2 } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { StatusLabel } from '../components/ui/StatusLabel';
import { useAuth } from '../context/AuthContext';
import { useErpData } from '../context/ErpDataContext';
import { downloadDocumentRecord } from '../lib/fileStorage';
import { formatCurrency, formatDate } from '../lib/formatters';
import { EXPENSE_CATEGORIES, type Supplier } from '../types/erp';

export const SuppliersModule: React.FC = () => {
  const { permissions } = useAuth();
  const { suppliers, expenses, documents, saveSupplier, deleteSupplier, notify } = useErpData();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const [form, setForm] = useState({
    name: '',
    taxId: '',
    address: '',
    contactPerson: '',
    phone: '',
    email: '',
    category: EXPENSE_CATEGORIES[2] as string,
    paymentTerms: 'Transferencia 30 días',
    notes: '',
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      taxId: '',
      address: '',
      contactPerson: '',
      phone: '',
      email: '',
      category: EXPENSE_CATEGORIES[2],
      paymentTerms: 'Transferencia 30 días',
      notes: '',
    });
    setModalOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name,
      taxId: s.taxId,
      address: s.address || '',
      contactPerson: s.contactPerson || '',
      phone: s.phone || '',
      email: s.email || '',
      category: s.category,
      paymentTerms: s.paymentTerms || '',
      notes: s.notes || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.taxId.trim()) return;
    try {
      await saveSupplier(
        {
          ...form,
          taxId: form.taxId.trim().toUpperCase(),
        },
        editing?.id
      );
      setModalOpen(false);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Error al guardar proveedor.');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.taxId.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    );
  }, [suppliers, search]);

  if (selected) {
    const supExpenses = expenses.filter(
      (e) => e.supplierId === selected.id || e.supplierName === selected.name
    );
    const supDocs = documents.filter((d) => d.supplierId === selected.id);
    const totalSpent = supExpenses.reduce((s, e) => s + e.total, 0);

    return (
      <div className="space-y-5">
        <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#315348] mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver a proveedores
            </button>
            <h2 className="text-xl font-semibold text-[#203C35]">{selected.name}</h2>
            <p className="text-xs text-[#252B28]/65 font-mono-tabular">
              CIF/NIF: {selected.taxId} · {selected.category} · Condiciones: {selected.paymentTerms || '—'}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-[#252B28]/65">Volumen total facturado</div>
            <div className="text-xl font-semibold text-[#203C35] font-mono-tabular">
              {formatCurrency(totalSpent)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#203C35]">
              Historial de facturas recibidas y pagos ({supExpenses.length})
            </h3>
            {supExpenses.length === 0 ? (
              <p className="text-xs text-[#252B28]/60">Sin facturas recibidas asociadas.</p>
            ) : (
              <div className="divide-y divide-[#ECEEEB] text-xs">
                {supExpenses.map((e) => (
                  <div key={e.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-[#203C35]">
                        {e.invoiceNumber || 'S/N'} · {e.concept}
                      </div>
                      <div className="text-[#252B28]/60 font-mono-tabular">
                        {formatDate(e.date)} {e.paymentDate ? `· Pagado ${formatDate(e.paymentDate)}` : ''}
                      </div>
                    </div>
                    <div className="text-right space-y-0.5">
                      <div className="font-mono-tabular font-semibold">{formatCurrency(e.total)}</div>
                      <StatusLabel value={e.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#203C35]">Documentos del proveedor ({supDocs.length})</h3>
            {supDocs.length === 0 ? (
              <p className="text-xs text-[#252B28]/60">Sin documentos vinculados.</p>
            ) : (
              <div className="divide-y divide-[#ECEEEB] text-xs">
                {supDocs.map((d) => (
                  <div key={d.id} className="py-2.5 flex items-center justify-between">
                    <span>{d.name}</span>
                    <button
                      type="button"
                      onClick={() => downloadDocumentRecord(d)}
                      className="inline-flex items-center gap-1 px-2 py-1 border border-[#ECEEEB] rounded"
                    >
                      <Download className="w-3 h-3" />
                      Descargar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-[#ECEEEB] rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-[#252B28]/45 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar proveedor por razón social, CIF o categoría..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#F8F8F5] border border-[#ECEEEB] rounded-md"
          />
        </div>
        {permissions.canWriteExpenses && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#203C35] text-white rounded-md hover:bg-[#315348]"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo proveedor
          </button>
        )}
      </div>

      <div className="bg-white border border-[#ECEEEB] rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-[#203C35]">Sin proveedores registrados</p>
            <p className="text-xs text-[#252B28]/60">
              Registra tus proveedores habituales para agilizar el control de facturas recibidas y condiciones de pago.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F8F8F5] border-b border-[#ECEEEB]">
                <tr className="text-left text-[#252B28]/70">
                  <th className="px-4 py-3 font-medium">Razón social</th>
                  <th className="px-4 py-3 font-medium">CIF/NIF</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 font-medium">Contacto</th>
                  <th className="px-4 py-3 font-medium">Condiciones</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEEEB]">
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelected(s)}
                    className="hover:bg-[#F8F8F5]/70 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium text-[#203C35]">{s.name}</td>
                    <td className="px-4 py-3 font-mono-tabular">{s.taxId}</td>
                    <td className="px-4 py-3">{s.category}</td>
                    <td className="px-4 py-3">
                      <div>{s.contactPerson || '—'}</div>
                      <div className="text-[#252B28]/60 font-mono-tabular">{s.phone || s.email || ''}</div>
                    </td>
                    <td className="px-4 py-3">{s.paymentTerms || '—'}</td>
                    <td className="px-4 py-3 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                      {permissions.canWriteExpenses && (
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          className="p-1.5 text-[#252B28]/70 hover:text-[#203C35] rounded hover:bg-[#ECEEEB]"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {permissions.canDeleteNonFinancial && (
                        <button
                          type="button"
                          onClick={() => deleteSupplier(s.id, s.name)}
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar proveedor' : 'Nuevo proveedor'}
      >
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium">Razón social *</span>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">CIF / NIF *</span>
              <input
                type="text"
                required
                value={form.taxId}
                onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md font-mono-tabular uppercase"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Categoría</span>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
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
              <span className="font-medium">Dirección</span>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Persona de contacto</span>
              <input
                type="text"
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Teléfono</span>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md font-mono-tabular"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Correo</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Condiciones de pago</span>
              <input
                type="text"
                value={form.paymentTerms}
                onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium">Observaciones</span>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[#ECEEEB]">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-[#ECEEEB] rounded-md">
              Cancelar
            </button>
            <button type="submit" className="px-4 py-2 bg-[#203C35] text-white rounded-md">
              Guardar proveedor
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
