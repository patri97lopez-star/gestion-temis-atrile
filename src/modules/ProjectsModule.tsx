import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  Download,
  Edit3,
  Kanban,
  List,
  MessageSquare,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { StatusLabel } from '../components/ui/StatusLabel';
import { useAuth } from '../context/AuthContext';
import { useErpData } from '../context/ErpDataContext';
import { downloadDocumentRecord } from '../lib/fileStorage';
import { formatCurrency, formatDate, todayIso } from '../lib/formatters';
import type { Project, ProjectStatus } from '../types/erp';

const PROJECT_STATUSES: ProjectStatus[] = [
  'Pendiente',
  'En proceso',
  'Esperando al cliente',
  'En revisión',
  'Finalizado',
  'Facturado',
];

export const ProjectsModule: React.FC<{ initialAction?: string; onClearAction?: () => void }> = ({
  initialAction,
  onClearAction,
}) => {
  const { permissions, profile } = useAuth();
  const {
    projects,
    clients,
    usersPublic,
    projectComments,
    tasks,
    documents,
    quotes,
    invoices,
    saveProject,
    deleteProject,
    addProjectComment,
    saveTask,
    notify,
  } = useErpData();

  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [detailProject, setDetailProject] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);

  const [commentText, setCommentText] = useState('');
  const [commentHours, setCommentHours] = useState('0');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDate, setNewTaskDate] = useState(todayIso());

  const [form, setForm] = useState({
    name: '',
    clientId: '',
    description: '',
    service: '',
    startDate: todayIso(),
    estimatedEndDate: '',
    actualEndDate: '',
    responsibleUid: '',
    hoursSpent: 0,
    internalCost: 0,
    budgetedPrice: 0,
    invoicedAmount: 0,
    status: 'Pendiente' as ProjectStatus,
    notes: '',
  });

  useEffect(() => {
    if (initialAction === 'new' && permissions.canWriteProjects) {
      openCreate();
      onClearAction?.();
    }
  }, [initialAction, permissions.canWriteProjects, onClearAction]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      clientId: clients[0]?.id || '',
      description: '',
      service: '',
      startDate: todayIso(),
      estimatedEndDate: '',
      actualEndDate: '',
      responsibleUid: profile?.uid || '',
      hoursSpent: 0,
      internalCost: 0,
      budgetedPrice: 0,
      invoicedAmount: 0,
      status: 'Pendiente',
      notes: '',
    });
    setModalOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditing(p);
    setForm({
      name: p.name,
      clientId: p.clientId,
      description: p.description || '',
      service: p.service || '',
      startDate: p.startDate || todayIso(),
      estimatedEndDate: p.estimatedEndDate || '',
      actualEndDate: p.actualEndDate || '',
      responsibleUid: p.responsibleUid || '',
      hoursSpent: p.hoursSpent,
      internalCost: p.internalCost,
      budgetedPrice: p.budgetedPrice,
      invoicedAmount: p.invoicedAmount,
      status: p.status,
      notes: p.notes || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.clientId) {
      notify('error', 'Debes indicar el nombre del proyecto y un cliente asociado.');
      return;
    }
    const client = clients.find((c) => c.id === form.clientId);
    const resp = usersPublic.find((u) => u.uid === form.responsibleUid);
    setSaving(true);
    try {
      await saveProject(
        {
          name: form.name.trim(),
          clientId: form.clientId,
          clientName: client?.name || 'Cliente',
          description: form.description,
          service: form.service,
          startDate: form.startDate,
          estimatedEndDate: form.estimatedEndDate,
          actualEndDate: form.actualEndDate,
          responsibleUid: form.responsibleUid,
          responsibleName: resp?.displayName || profile?.displayName || '',
          hoursSpent: Number(form.hoursSpent) || 0,
          internalCost: Number(form.internalCost) || 0,
          budgetedPrice: Number(form.budgetedPrice) || 0,
          invoicedAmount: Number(form.invoicedAmount) || 0,
          status: form.status,
          quoteId: editing?.quoteId || '',
          invoiceId: editing?.invoiceId || '',
          notes: form.notes,
        },
        editing?.id
      );
      setModalOpen(false);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Error al guardar el trabajo.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects
      .filter((p) => (statusFilter === 'todos' ? true : p.status === statusFilter))
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.clientName.toLowerCase().includes(q) ||
          (p.service || '').toLowerCase().includes(q)
        );
      });
  }, [projects, search, statusFilter]);

  const moveProjectStatus = async (p: Project, newStatus: ProjectStatus) => {
    await saveProject(
      {
        name: p.name,
        clientId: p.clientId,
        clientName: p.clientName,
        description: p.description,
        service: p.service,
        startDate: p.startDate,
        estimatedEndDate: p.estimatedEndDate,
        actualEndDate: newStatus === 'Finalizado' && !p.actualEndDate ? todayIso() : p.actualEndDate,
        responsibleUid: p.responsibleUid,
        responsibleName: p.responsibleName,
        hoursSpent: p.hoursSpent,
        internalCost: p.internalCost,
        budgetedPrice: p.budgetedPrice,
        invoicedAmount: p.invoicedAmount,
        status: newStatus,
        quoteId: p.quoteId,
        invoiceId: p.invoiceId,
        notes: p.notes,
      },
      p.id
    );
  };

  const activeDetail = detailProject
    ? projects.find((p) => p.id === detailProject.id) || detailProject
    : null;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="bg-white border border-[#ECEEEB] rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-[#252B28]/45 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar proyecto, cliente o servicio..."
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
            {PROJECT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-[#F8F8F5] border border-[#ECEEEB] rounded-md">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded ${
                viewMode === 'table' ? 'bg-white text-[#203C35] shadow-xs' : 'text-[#252B28]/65'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Tabla
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded ${
                viewMode === 'kanban' ? 'bg-white text-[#203C35] shadow-xs' : 'text-[#252B28]/65'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              Kanban
            </button>
          </div>
          {permissions.canWriteProjects && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#203C35] text-white rounded-md hover:bg-[#315348]"
            >
              <Plus className="w-3.5 h-3.5" />
              Nuevo trabajo
            </button>
          )}
        </div>
      </div>

      {/* Table or Kanban */}
      {viewMode === 'table' ? (
        <div className="bg-white border border-[#ECEEEB] rounded-lg overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-medium text-[#203C35]">No hay trabajos registrados</p>
              <p className="text-xs text-[#252B28]/60">
                Crea un trabajo manualmente o convierte un presupuesto aceptado.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F8F8F5] border-b border-[#ECEEEB]">
                  <tr className="text-left text-[#252B28]/70">
                    <th className="px-4 py-3 font-medium">Proyecto / Servicio</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Responsable</th>
                    <th className="px-4 py-3 font-medium">Entrega prev.</th>
                    <th className="px-4 py-3 font-medium text-right">Horas</th>
                    <th className="px-4 py-3 font-medium text-right">Presup.</th>
                    <th className="px-4 py-3 font-medium text-right">Facturado</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECEEEB]">
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setDetailProject(p)}
                      className="hover:bg-[#F8F8F5]/75 cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#203C35]">{p.name}</div>
                        <div className="text-[#252B28]/60">{p.service || 'General'}</div>
                      </td>
                      <td className="px-4 py-3">{p.clientName}</td>
                      <td className="px-4 py-3">{p.responsibleName || '—'}</td>
                      <td className="px-4 py-3 font-mono-tabular">{formatDate(p.estimatedEndDate)}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular">{p.hoursSpent} h</td>
                      <td className="px-4 py-3 text-right font-mono-tabular">{formatCurrency(p.budgetedPrice)}</td>
                      <td className="px-4 py-3 text-right font-mono-tabular">{formatCurrency(p.invoicedAmount)}</td>
                      <td className="px-4 py-3">
                        <StatusLabel value={p.status} />
                      </td>
                      <td className="px-4 py-3 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                        {permissions.canWriteProjects && (
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="p-1.5 text-[#252B28]/65 hover:text-[#203C35] rounded hover:bg-[#ECEEEB]"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {permissions.canDeleteNonFinancial && (
                          <button
                            type="button"
                            onClick={() => deleteProject(p.id, p.name)}
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          {PROJECT_STATUSES.map((colStatus) => {
            const colProjects = filtered.filter((p) => p.status === colStatus);
            return (
              <div
                key={colStatus}
                className="bg-[#ECEEEB]/60 border border-[#ECEEEB] rounded-lg p-3 flex flex-col gap-2.5 min-h-[320px]"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-[#203C35] pb-2 border-b border-[#ECEEEB]">
                  <span>{colStatus}</span>
                  <span className="font-mono-tabular text-[#252B28]/65">{colProjects.length}</span>
                </div>
                <div className="space-y-2.5">
                  {colProjects.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setDetailProject(p)}
                      className="bg-white border border-[#ECEEEB] rounded-md p-3 space-y-2 cursor-pointer hover:border-[#315348]"
                    >
                      <div className="text-xs font-semibold text-[#203C35] leading-snug">{p.name}</div>
                      <div className="text-[11px] text-[#252B28]/70">{p.clientName}</div>
                      <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[#252B28]/65">
                        <span>{p.hoursSpent} h</span>
                        <span>{formatCurrency(p.budgetedPrice)}</span>
                      </div>
                      {permissions.canWriteProjects && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <select
                            value={p.status}
                            onChange={(e) => moveProjectStatus(p, e.target.value as ProjectStatus)}
                            className="w-full mt-1 px-2 py-1 text-[11px] bg-[#F8F8F5] border border-[#ECEEEB] rounded"
                          >
                            {PROJECT_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                Mover a: {st}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar trabajo / proyecto' : 'Nuevo trabajo / proyecto'}
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1 md:col-span-2">
              <span className="font-medium">Nombre del proyecto *</span>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Cliente asociado *</span>
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
              <span className="font-medium">Servicio contratado</span>
              <input
                type="text"
                value={form.service}
                onChange={(e) => setForm({ ...form, service: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Responsable</span>
              <select
                value={form.responsibleUid}
                onChange={(e) => setForm({ ...form, responsibleUid: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                <option value="">Sin asignar</option>
                {usersPublic.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.displayName} ({u.role})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium">Estado</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                {PROJECT_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium">Fecha inicio</span>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Fecha prevista finalización</span>
              <input
                type="date"
                value={form.estimatedEndDate}
                onChange={(e) => setForm({ ...form, estimatedEndDate: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Fecha real finalización</span>
              <input
                type="date"
                value={form.actualEndDate}
                onChange={(e) => setForm({ ...form, actualEndDate: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Horas dedicadas</span>
              <input
                type="number"
                step="0.5"
                min="0"
                value={form.hoursSpent}
                onChange={(e) => setForm({ ...form, hoursSpent: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md font-mono-tabular"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Coste interno (€)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.internalCost}
                onChange={(e) => setForm({ ...form, internalCost: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md font-mono-tabular"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Precio presupuestado (€)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.budgetedPrice}
                onChange={(e) => setForm({ ...form, budgetedPrice: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md font-mono-tabular"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Importe facturado (€)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.invoicedAmount}
                onChange={(e) => setForm({ ...form, invoicedAmount: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md font-mono-tabular"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="font-medium">Descripción</span>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="font-medium">Observaciones</span>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#ECEEEB]">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-[#ECEEEB] rounded-md">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-[#203C35] text-white rounded-md hover:bg-[#315348]"
            >
              {saving ? 'Guardando...' : 'Guardar trabajo'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Project Detail Modal with Tasks, Comments, Docs, Links */}
      <Modal
        open={Boolean(activeDetail)}
        onClose={() => setDetailProject(null)}
        title={activeDetail?.name || ''}
        subtitle={
          activeDetail
            ? `${activeDetail.clientName} · Responsable: ${activeDetail.responsibleName || 'Sin asignar'}`
            : ''
        }
        maxWidthClass="max-w-3xl"
      >
        {activeDetail && (
          <div className="space-y-6 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-[#F8F8F5] border border-[#ECEEEB] rounded">
                <div className="text-[#252B28]/60">Estado</div>
                <div className="mt-1"><StatusLabel value={activeDetail.status} /></div>
              </div>
              <div className="p-3 bg-[#F8F8F5] border border-[#ECEEEB] rounded">
                <div className="text-[#252B28]/60">Horas</div>
                <div className="font-mono-tabular font-semibold text-[#203C35] mt-1">{activeDetail.hoursSpent} h</div>
              </div>
              <div className="p-3 bg-[#F8F8F5] border border-[#ECEEEB] rounded">
                <div className="text-[#252B28]/60">Coste / Presup.</div>
                <div className="font-mono-tabular font-semibold text-[#203C35] mt-1">
                  {formatCurrency(activeDetail.internalCost)} / {formatCurrency(activeDetail.budgetedPrice)}
                </div>
              </div>
              <div className="p-3 bg-[#F8F8F5] border border-[#ECEEEB] rounded">
                <div className="text-[#252B28]/60">Facturado</div>
                <div className="font-mono-tabular font-semibold text-[#203C35] mt-1">
                  {formatCurrency(activeDetail.invoicedAmount)}
                </div>
              </div>
            </div>

            {/* Linked Quote & Invoice */}
            {(activeDetail.quoteId || activeDetail.invoiceId) && (
              <div className="p-3 bg-[#F8F8F5] border border-[#ECEEEB] rounded flex flex-wrap gap-4">
                {activeDetail.quoteId && (
                  <span>
                    Presupuesto origen:{' '}
                    <strong className="font-mono-tabular">
                      {quotes.find((q) => q.id === activeDetail.quoteId)?.number || activeDetail.quoteId}
                    </strong>
                  </span>
                )}
                {activeDetail.invoiceId && (
                  <span>
                    Factura asociada:{' '}
                    <strong className="font-mono-tabular">
                      {invoices.find((i) => i.id === activeDetail.invoiceId)?.number || activeDetail.invoiceId}
                    </strong>
                  </span>
                )}
              </div>
            )}

            {/* Project Tasks */}
            <div className="space-y-2">
              <h4 className="font-semibold text-[#203C35]">Tareas del proyecto</h4>
              {permissions.canWriteProjects && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newTaskTitle.trim()) return;
                    await saveTask({
                      title: newTaskTitle.trim(),
                      dueDate: newTaskDate,
                      priority: 'Media',
                      projectId: activeDetail.id,
                      clientId: activeDetail.clientId,
                      clientName: activeDetail.clientName,
                      category: 'Tarea',
                      status: 'Pendiente',
                    });
                    setNewTaskTitle('');
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    placeholder="Nueva tarea del proyecto..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="flex-1 px-3 py-1.5 border border-[#ECEEEB] rounded-md"
                  />
                  <input
                    type="date"
                    value={newTaskDate}
                    onChange={(e) => setNewTaskDate(e.target.value)}
                    className="px-2 py-1.5 border border-[#ECEEEB] rounded-md"
                  />
                  <button type="submit" className="px-3 py-1.5 bg-[#203C35] text-white rounded-md">
                    Añadir
                  </button>
                </form>
              )}
              <div className="divide-y divide-[#ECEEEB]">
                {tasks
                  .filter((t) => t.projectId === activeDetail.id)
                  .map((t) => (
                    <div key={t.id} className="py-2 flex items-center justify-between">
                      <span>
                        {t.title} · <span className="font-mono-tabular text-[#252B28]/60">{formatDate(t.dueDate)}</span>
                      </span>
                      <StatusLabel value={t.status} />
                    </div>
                  ))}
              </div>
            </div>

            {/* Project Comments & Hours Log */}
            <div className="space-y-2">
              <h4 className="font-semibold text-[#203C35] flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                Seguimiento y partes de horas
              </h4>
              {permissions.canWriteProjects && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!commentText.trim()) return;
                    await addProjectComment(activeDetail.id, commentText, Number(commentHours) || 0);
                    setCommentText('');
                    setCommentHours('0');
                  }}
                  className="flex flex-wrap gap-2"
                >
                  <input
                    type="text"
                    placeholder="Añadir comentario o avance..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="flex-1 min-w-[200px] px-3 py-1.5 border border-[#ECEEEB] rounded-md"
                  />
                  <div className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#252B28]/55" />
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={commentHours}
                      onChange={(e) => setCommentHours(e.target.value)}
                      className="w-16 px-2 py-1.5 border border-[#ECEEEB] rounded-md font-mono-tabular"
                    />
                    <span>h</span>
                  </div>
                  <button type="submit" className="px-3 py-1.5 bg-[#315348] text-white rounded-md">
                    Registrar
                  </button>
                </form>
              )}
              <div className="divide-y divide-[#ECEEEB]">
                {projectComments
                  .filter((c) => c.projectId === activeDetail.id)
                  .map((c) => (
                    <div key={c.id} className="py-2">
                      <div className="flex justify-between text-[#252B28]/65">
                        <span className="font-medium text-[#203C35]">{c.authorName}</span>
                        <span className="font-mono-tabular">{c.hoursLogged > 0 ? `+${c.hoursLogged} h` : ''}</span>
                      </div>
                      <p className="text-[#252B28] mt-0.5">{c.text}</p>
                    </div>
                  ))}
              </div>
            </div>

            {/* Linked Documents */}
            <div className="space-y-2">
              <h4 className="font-semibold text-[#203C35]">Documentos adjuntos</h4>
              {documents.filter((d) => d.projectId === activeDetail.id).length === 0 ? (
                <p className="text-[#252B28]/60">No hay documentos vinculados a este proyecto.</p>
              ) : (
                <div className="divide-y divide-[#ECEEEB]">
                  {documents
                    .filter((d) => d.projectId === activeDetail.id)
                    .map((d) => (
                      <div key={d.id} className="py-2 flex items-center justify-between">
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
        )}
      </Modal>
    </div>
  );
};
