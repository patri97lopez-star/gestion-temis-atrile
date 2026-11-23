import React, { useMemo, useState } from 'react';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Plus,
  Trash2,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { StatusLabel } from '../components/ui/StatusLabel';
import { useAuth } from '../context/AuthContext';
import { useErpData } from '../context/ErpDataContext';
import { addDaysIso, formatCurrency, formatDate, todayIso } from '../lib/formatters';
import type { Task } from '../types/erp';

interface CalendarEventItem {
  id: string;
  date: string;
  title: string;
  kind: 'Factura' | 'Fiscal' | 'Proyecto' | 'Tarea';
  detail?: string;
  status?: string;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const CalendarModule: React.FC = () => {
  const { permissions, profile } = useAuth();
  const {
    tasks,
    invoices,
    fiscalObligations,
    projects,
    clients,
    usersPublic,
    companySettings,
    saveTask,
    deleteTask,
    notify,
  } = useErpData();

  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [kindFilter, setKindFilter] = useState('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    dueDate: todayIso(),
    priority: 'Media' as Task['priority'],
    responsibleUid: profile?.uid || '',
    clientId: '',
    category: 'Tarea' as Task['category'],
    status: 'Pendiente' as Task['status'],
  });

  const events = useMemo<CalendarEventItem[]>(() => {
    const list: CalendarEventItem[] = [];

    // 1. Invoice due dates & collection reminders
    invoices
      .filter((i) => i.status !== 'Borrador' && i.status !== 'Cobrada' && i.status !== 'Rectificada')
      .forEach((i) => {
        list.push({
          id: `inv_${i.id}`,
          date: i.dueDate,
          title: `Vencimiento ${i.number} · ${i.clientName}`,
          kind: 'Factura',
          detail: formatCurrency(i.total - i.paidAmount),
          status: i.status,
        });
      });

    // 2. Fiscal deadlines
    fiscalObligations
      .filter((f) => f.applicable && f.status !== 'Presentado' && f.status !== 'Justificante archivado')
      .forEach((f) => {
        list.push({
          id: `fis_${f.id}`,
          date: f.dueDate,
          title: `${f.modelCode} (${f.period})`,
          kind: 'Fiscal',
          detail: f.modelName,
          status: f.status,
        });
      });

    // 3. Project delivery dates
    projects
      .filter((p) => p.estimatedEndDate && p.status !== 'Finalizado' && p.status !== 'Facturado')
      .forEach((p) => {
        list.push({
          id: `prj_${p.id}`,
          date: p.estimatedEndDate!,
          title: `Entrega: ${p.name}`,
          kind: 'Proyecto',
          detail: p.clientName,
          status: p.status,
        });
      });

    // 4. Tasks, meetings, follow-ups
    tasks.forEach((t) => {
      list.push({
        id: `tsk_${t.id}`,
        date: t.dueDate,
        title: `${t.category}: ${t.title}`,
        kind: 'Tarea',
        detail: t.clientName || t.responsibleName,
        status: t.status,
      });
    });

    return list.filter((ev) => (kindFilter === 'todos' ? true : ev.kind === kindFilter));
  }, [invoices, fiscalObligations, projects, tasks, kindFilter]);

  const upcomingAlerts = useMemo(() => {
    const today = todayIso();
    const horizon = addDaysIso(today, companySettings?.notifyDaysBeforeDue || 7);
    return events
      .filter((e) => e.date >= today && e.date <= horizon && e.status !== 'Completada')
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [events, companySettings?.notifyDaysBeforeDue]);

  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
  const monthLabel = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(monthCursor);

  const openCreate = (presetDate = todayIso()) => {
    setEditing(null);
    setForm({
      title: '',
      description: '',
      dueDate: presetDate,
      priority: 'Media',
      responsibleUid: profile?.uid || '',
      clientId: '',
      category: 'Tarea',
      status: 'Pendiente',
    });
    setModalOpen(true);
  };

  const openEdit = (t: Task) => {
    setEditing(t);
    setForm({
      title: t.title,
      description: t.description || '',
      dueDate: t.dueDate,
      priority: t.priority,
      responsibleUid: t.responsibleUid || '',
      clientId: t.clientId || '',
      category: t.category,
      status: t.status,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const resp = usersPublic.find((u) => u.uid === form.responsibleUid);
    const cli = clients.find((c) => c.id === form.clientId);
    try {
      await saveTask(
        {
          title: form.title.trim(),
          description: form.description,
          dueDate: form.dueDate,
          priority: form.priority,
          responsibleUid: form.responsibleUid || undefined,
          responsibleName: resp?.displayName || profile?.displayName,
          clientId: form.clientId || undefined,
          clientName: cli?.name,
          category: form.category,
          status: form.status,
        },
        editing?.id
      );
      setModalOpen(false);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Error al guardar la tarea.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Configurable Reminder Banner */}
      {upcomingAlerts.length > 0 && (
        <div className="bg-white border border-[#ECEEEB] rounded-lg p-4 flex items-start gap-3 text-xs">
          <Bell className="w-4 h-4 text-[#C6A879] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-[#203C35]">
              Recordatorios próximos (próximos {companySettings?.notifyDaysBeforeDue || 7} días): {upcomingAlerts.length} evento(s)
            </p>
            <p className="text-[#252B28]/75">
              {upcomingAlerts
                .slice(0, 4)
                .map((a) => `${formatDate(a.date)}: ${a.title}`)
                .join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Calendar Controls */}
      <div className="bg-white border border-[#ECEEEB] rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMonthCursor(new Date(year, month - 1, 1))}
            className="p-2 border border-[#ECEEEB] rounded-md hover:bg-[#F8F8F5]"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-semibold text-[#203C35] capitalize min-w-[160px] text-center">
            {monthLabel}
          </h2>
          <button
            type="button"
            onClick={() => setMonthCursor(new Date(year, month + 1, 1))}
            className="p-2 border border-[#ECEEEB] rounded-md hover:bg-[#F8F8F5]"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-[#F8F8F5] border border-[#ECEEEB] rounded-md"
          >
            <option value="todos">Todos los eventos</option>
            <option value="Factura">Vencimientos facturas</option>
            <option value="Fiscal">Vencimientos fiscales</option>
            <option value="Proyecto">Entregas proyectos</option>
            <option value="Tarea">Tareas y reuniones</option>
          </select>
          {permissions.canWriteProjects && (
            <button
              type="button"
              onClick={() => openCreate()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#203C35] text-white rounded-md hover:bg-[#315348]"
            >
              <Plus className="w-3.5 h-3.5" />
              Nueva tarea / evento
            </button>
          )}
        </div>
      </div>

      {/* Month Grid */}
      <div className="bg-white border border-[#ECEEEB] rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 bg-[#F8F8F5] border-b border-[#ECEEEB]">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="px-2 py-2 text-center text-[11px] font-semibold text-[#252B28]/70">
              {wd}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 divide-x divide-y divide-[#ECEEEB]">
          {Array.from({ length: firstDayOffset }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[96px] bg-[#F8F8F5]/40 p-2" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const day = idx + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEvents = events.filter((e) => e.date === dateStr);
            const isToday = dateStr === todayIso();

            return (
              <div
                key={dateStr}
                onClick={() => permissions.canWriteProjects && openCreate(dateStr)}
                className={`min-h-[96px] p-1.5 text-[11px] space-y-1 cursor-pointer hover:bg-[#F8F8F5] ${
                  isToday ? 'bg-[#ECEEEB]/45' : ''
                }`}
              >
                <div
                  className={`font-mono-tabular text-right ${
                    isToday ? 'font-bold text-[#203C35]' : 'text-[#252B28]/65'
                  }`}
                >
                  {day}
                </div>
                {dayEvents.slice(0, 3).map((ev) => (
                  <div
                    key={ev.id}
                    className={`px-1.5 py-0.5 rounded truncate text-[10px] font-medium ${
                      ev.kind === 'Fiscal'
                        ? 'bg-[#203C35] text-white'
                        : ev.kind === 'Factura'
                        ? 'bg-[#C6A879]/25 text-[#203C35]'
                        : 'bg-[#ECEEEB] text-[#252B28]'
                    }`}
                    title={`${ev.title}${ev.detail ? ` (${ev.detail})` : ''}`}
                  >
                    {ev.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-[#252B28]/55 px-1">+{dayEvents.length - 3} más</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tasks List */}
      <div className="bg-white border border-[#ECEEEB] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#ECEEEB] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#203C35]">Agenda de tareas y seguimientos ({tasks.length})</h3>
        </div>
        {tasks.length === 0 ? (
          <p className="p-8 text-center text-xs text-[#252B28]/60">No hay tareas programadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F8F8F5] border-b border-[#ECEEEB]">
                <tr className="text-left text-[#252B28]/70">
                  <th className="px-4 py-2.5 font-medium">Fecha</th>
                  <th className="px-4 py-2.5 font-medium">Título</th>
                  <th className="px-4 py-2.5 font-medium">Tipo</th>
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 font-medium">Responsable</th>
                  <th className="px-4 py-2.5 font-medium">Prioridad</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                  <th className="px-4 py-2.5 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEEEB]">
                {[...tasks]
                  .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                  .map((t) => (
                    <tr key={t.id} className="hover:bg-[#F8F8F5]/70">
                      <td className="px-4 py-2.5 font-mono-tabular">{formatDate(t.dueDate)}</td>
                      <td className="px-4 py-2.5 font-medium text-[#203C35]">{t.title}</td>
                      <td className="px-4 py-2.5">{t.category}</td>
                      <td className="px-4 py-2.5">{t.clientName || '—'}</td>
                      <td className="px-4 py-2.5">{t.responsibleName || '—'}</td>
                      <td className="px-4 py-2.5"><StatusLabel value={t.priority} /></td>
                      <td className="px-4 py-2.5"><StatusLabel value={t.status} /></td>
                      <td className="px-4 py-2.5 text-right space-x-1">
                        {permissions.canWriteProjects && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(t)}
                              className="p-1.5 text-[#252B28]/70 hover:text-[#203C35] rounded hover:bg-[#ECEEEB]"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteTask(t.id)}
                              className="p-1.5 text-[#252B28]/70 hover:text-[#B42318] rounded hover:bg-[#ECEEEB]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Task Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar tarea' : 'Nueva tarea o evento'}
      >
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium">Título *</span>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Fecha *</span>
              <input
                type="date"
                required
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Categoría</span>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as Task['category'] })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                <option value="Tarea">Tarea</option>
                <option value="Reunión">Reunión</option>
                <option value="Entrega">Entrega</option>
                <option value="Seguimiento">Seguimiento</option>
                <option value="Cobro">Cobro</option>
                <option value="Fiscal">Fiscal</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium">Prioridad</span>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as Task['priority'] })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                <option value="Baja">Baja</option>
                <option value="Media">Media</option>
                <option value="Alta">Alta</option>
                <option value="Urgente">Urgente</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium">Estado</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as Task['status'] })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                <option value="Pendiente">Pendiente</option>
                <option value="En curso">En curso</option>
                <option value="Completada">Completada</option>
              </select>
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
                    {u.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium">Cliente asociado (opcional)</span>
              <select
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                <option value="">Ninguno</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium">Descripción</span>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[#ECEEEB]">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-[#ECEEEB] rounded-md">
              Cancelar
            </button>
            <button type="submit" className="px-4 py-2 bg-[#203C35] text-white rounded-md">
              Guardar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
