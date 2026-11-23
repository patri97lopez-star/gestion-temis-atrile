import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowUpDown,
  Download,
  Edit3,
  FileSpreadsheet,
  MessageSquarePlus,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { StatusLabel } from '../components/ui/StatusLabel';
import { useAuth } from '../context/AuthContext';
import { useErpData } from '../context/ErpDataContext';
import { exportCsv, exportExcel } from '../lib/exportUtils';
import { downloadDocumentRecord } from '../lib/fileStorage';
import { formatCurrency, formatDate, timestampToMs, todayIso } from '../lib/formatters';
import type { Client, ClientStatus, ClientType, Communication, Task } from '../types/erp';

type ClientTab =
  | 'resumen'
  | 'trabajos_realizados'
  | 'trabajos_pendientes'
  | 'presupuestos'
  | 'facturas_emitidas'
  | 'facturas_pendientes'
  | 'gastos'
  | 'documentos'
  | 'comunicaciones'
  | 'historial'
  | 'seguimiento';

const CLIENT_TABS: { key: ClientTab; label: string }[] = [
  { key: 'resumen', label: '1. Resumen' },
  { key: 'trabajos_realizados', label: '2. Trabajos realizados' },
  { key: 'trabajos_pendientes', label: '3. Trabajos pendientes' },
  { key: 'presupuestos', label: '4. Presupuestos' },
  { key: 'facturas_emitidas', label: '5. Facturas emitidas' },
  { key: 'facturas_pendientes', label: '6. Facturas pendientes' },
  { key: 'gastos', label: '7. Gastos asociados' },
  { key: 'documentos', label: '8. Documentos' },
  { key: 'comunicaciones', label: '9. Comunicaciones' },
  { key: 'historial', label: '10. Historial actividad' },
  { key: 'seguimiento', label: '11. Seguimiento y recordatorios' },
];

export const ClientsModule: React.FC<{ initialAction?: string; onClearAction?: () => void }> = ({
  initialAction,
  onClearAction,
}) => {
  const { permissions } = useAuth();
  const {
    clients,
    projects,
    quotes,
    invoices,
    expenses,
    documents,
    communications,
    tasks,
    activityLogs,
    saveClient,
    archiveOrDeleteClient,
    addCommunication,
    saveTask,
    notify,
  } = useErpData();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [typeFilter, setTypeFilter] = useState<string>('todos');
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'signupDate'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ClientTab>('resumen');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    taxId: '',
    fiscalAddress: '',
    postalCode: '',
    city: '',
    province: '',
    phone: '',
    email: '',
    contactPerson: '',
    signupDate: todayIso(),
    clientType: 'Empresa' as ClientType,
    status: 'activo' as ClientStatus,
    notes: '',
  });

  // Communication quick form
  const [commForm, setCommForm] = useState({
    channel: 'Email' as Communication['channel'],
    subject: '',
    summary: '',
    date: todayIso(),
  });

  // Reminder/Follow-up quick form
  const [remForm, setRemForm] = useState({
    title: '',
    dueDate: todayIso(),
    priority: 'Media' as Task['priority'],
    description: '',
  });

  useEffect(() => {
    if (initialAction === 'new' && permissions.canWriteClients) {
      openCreateModal();
      onClearAction?.();
    }
  }, [initialAction, permissions.canWriteClients, onClearAction]);

  const openCreateModal = () => {
    setEditingClient(null);
    setForm({
      name: '',
      taxId: '',
      fiscalAddress: '',
      postalCode: '',
      city: '',
      province: '',
      phone: '',
      email: '',
      contactPerson: '',
      signupDate: todayIso(),
      clientType: 'Empresa',
      status: 'activo',
      notes: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (c: Client) => {
    setEditingClient(c);
    setForm({
      name: c.name,
      taxId: c.taxId,
      fiscalAddress: c.fiscalAddress || '',
      postalCode: c.postalCode || '',
      city: c.city || '',
      province: c.province || '',
      phone: c.phone || '',
      email: c.email || '',
      contactPerson: c.contactPerson || '',
      signupDate: c.signupDate || todayIso(),
      clientType: c.clientType,
      status: c.status,
      notes: c.notes || '',
    });
    setModalOpen(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.taxId.trim()) {
      notify('error', 'El nombre/razón social y el CIF/NIF son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      const savedId = await saveClient(
        {
          ...form,
          archived: editingClient?.archived ?? false,
        },
        editingClient?.id
      );
      setModalOpen(false);
      if (!editingClient) setSelectedClientId(savedId);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'No se pudo guardar el cliente.');
    } finally {
      setSaving(false);
    }
  };

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients
      .filter((c) => (showArchived ? true : !c.archived))
      .filter((c) => (statusFilter === 'todos' ? true : c.status === statusFilter))
      .filter((c) => (typeFilter === 'todos' ? true : c.clientType === typeFilter))
      .filter((c) => {
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.taxId.toLowerCase().includes(q) ||
          (c.phone || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const valA = (sortBy === 'name' ? a.name : a.signupDate || '').toLowerCase();
        const valB = (sortBy === 'name' ? b.name : b.signupDate || '').toLowerCase();
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
  }, [clients, search, statusFilter, typeFilter, showArchived, sortBy, sortDir]);

  const handleExport = async (kind: 'csv' | 'excel') => {
    const headers = [
      'Razón Social',
      'CIF/NIF',
      'Tipo',
      'Estado',
      'Teléfono',
      'Email',
      'Localidad',
      'Provincia',
      'Fecha Alta',
    ];
    const rows = filteredClients.map((c) => [
      c.name,
      c.taxId,
      c.clientType,
      c.status,
      c.phone || '',
      c.email || '',
      c.city || '',
      c.province || '',
      c.signupDate || '',
    ]);
    if (kind === 'csv') {
      exportCsv(`Clientes_GESTION360_${todayIso()}.csv`, headers, rows);
    } else {
      await exportExcel(`Clientes_GESTION360_${todayIso()}.xlsx`, 'Clientes', headers, rows);
    }
    notify('success', `Listado exportado en formato ${kind.toUpperCase()}.`);
  };

  const selectedClient = clients.find((c) => c.id === selectedClientId) || null;

  // Render Individual Client 11-Tab Dossier
  if (selectedClient) {
    const cProjects = projects.filter((p) => p.clientId === selectedClient.id);
    const cDoneProjects = cProjects.filter((p) => p.status === 'Finalizado' || p.status === 'Facturado');
    const cPendingProjects = cProjects.filter((p) => p.status !== 'Finalizado' && p.status !== 'Facturado');
    const cQuotes = quotes.filter((q) => q.clientId === selectedClient.id);
    const cInvoices = invoices.filter((i) => i.clientId === selectedClient.id);
    const cPendingInvoices = cInvoices.filter(
      (i) => i.status !== 'Cobrada' && i.status !== 'Borrador' && i.status !== 'Rectificada'
    );
    const cExpenses = expenses.filter((e) => e.clientId === selectedClient.id);
    const cDocs = documents.filter((d) => d.clientId === selectedClient.id);
    const cComms = communications
      .filter((m) => m.clientId === selectedClient.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const cTasks = tasks.filter((t) => t.clientId === selectedClient.id);
    const cLogs = activityLogs
      .filter((l) => l.entityId === selectedClient.id || l.entityLabel === selectedClient.name)
      .sort((a, b) => timestampToMs(b.createdAt) - timestampToMs(a.createdAt));

    const totalInvoiced = cInvoices
      .filter((i) => i.status !== 'Borrador')
      .reduce((s, i) => s + i.taxBase, 0);
    const totalPending = cPendingInvoices.reduce(
      (s, i) => s + Math.max(0, i.total - i.paidAmount),
      0
    );

    return (
      <div className="space-y-5">
        <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setSelectedClientId(null)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#315348] hover:text-[#203C35]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver al listado de clientes
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold text-[#203C35]">{selectedClient.name}</h2>
              <StatusLabel value={selectedClient.status} />
            </div>
            <p className="text-xs text-[#252B28]/65 font-mono-tabular">
              CIF/NIF: {selectedClient.taxId} · {selectedClient.clientType} · Alta:{' '}
              {formatDate(selectedClient.signupDate)}
            </p>
          </div>
          {permissions.canWriteClients && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openEditModal(selectedClient)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#203C35] text-white rounded-md hover:bg-[#315348]"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Editar ficha
              </button>
              <button
                type="button"
                onClick={() => archiveOrDeleteClient(selectedClient, 'archive')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-[#ECEEEB] bg-[#F8F8F5] rounded-md hover:bg-[#ECEEEB]"
              >
                <Archive className="w-3.5 h-3.5" />
                {selectedClient.archived ? 'Restaurar' : 'Archivar'}
              </button>
            </div>
          )}
        </div>

        {/* 11 Independent Tabs */}
        <div className="bg-white border border-[#ECEEEB] rounded-lg overflow-hidden">
          <div className="border-b border-[#ECEEEB] px-3 py-2 flex items-center gap-1 overflow-x-auto bg-[#F8F8F5]">
            {CLIENT_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  activeTab === tab.key
                    ? 'bg-[#203C35] text-white'
                    : 'text-[#252B28]/75 hover:bg-[#ECEEEB]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {activeTab === 'resumen' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-[#F8F8F5] border border-[#ECEEEB] rounded-md">
                    <div className="text-xs text-[#252B28]/65">Total facturado (Base)</div>
                    <div className="text-lg font-semibold text-[#203C35] font-mono-tabular mt-1">
                      {formatCurrency(totalInvoiced)}
                    </div>
                  </div>
                  <div className="p-4 bg-[#F8F8F5] border border-[#ECEEEB] rounded-md">
                    <div className="text-xs text-[#252B28]/65">Pendiente de cobro</div>
                    <div className="text-lg font-semibold text-[#9A6315] font-mono-tabular mt-1">
                      {formatCurrency(totalPending)}
                    </div>
                  </div>
                  <div className="p-4 bg-[#F8F8F5] border border-[#ECEEEB] rounded-md">
                    <div className="text-xs text-[#252B28]/65">Trabajos</div>
                    <div className="text-lg font-semibold text-[#203C35] font-mono-tabular mt-1">
                      {cProjects.length} ({cPendingProjects.length} pendientes)
                    </div>
                  </div>
                  <div className="p-4 bg-[#F8F8F5] border border-[#ECEEEB] rounded-md">
                    <div className="text-xs text-[#252B28]/65">Documentos archivados</div>
                    <div className="text-lg font-semibold text-[#203C35] font-mono-tabular mt-1">
                      {cDocs.length}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-[#203C35]">Datos fiscales</h4>
                    <p><span className="text-[#252B28]/60">Dirección:</span> {selectedClient.fiscalAddress || '—'}</p>
                    <p><span className="text-[#252B28]/60">CP / Localidad:</span> {[selectedClient.postalCode, selectedClient.city, selectedClient.province].filter(Boolean).join(', ') || '—'}</p>
                    <p><span className="text-[#252B28]/60">CIF/NIF:</span> <span className="font-mono-tabular">{selectedClient.taxId}</span></p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-[#203C35]">Contacto</h4>
                    <p><span className="text-[#252B28]/60">Persona de contacto:</span> {selectedClient.contactPerson || '—'}</p>
                    <p><span className="text-[#252B28]/60">Teléfono:</span> <span className="font-mono-tabular">{selectedClient.phone || '—'}</span></p>
                    <p><span className="text-[#252B28]/60">Correo:</span> {selectedClient.email || '—'}</p>
                  </div>
                </div>

                {selectedClient.notes && (
                  <div className="p-4 bg-[#F8F8F5] border border-[#ECEEEB] rounded-md text-xs text-[#252B28]">
                    <div className="font-semibold text-[#203C35] mb-1">Observaciones</div>
                    <p className="whitespace-pre-wrap">{selectedClient.notes}</p>
                  </div>
                )}
              </div>
            )}

            {(activeTab === 'trabajos_realizados' || activeTab === 'trabajos_pendientes') && (
              <div className="overflow-x-auto">
                {(() => {
                  const list = activeTab === 'trabajos_realizados' ? cDoneProjects : cPendingProjects;
                  if (list.length === 0) {
                    return <p className="text-xs text-[#252B28]/60 py-4">No hay trabajos en esta categoría.</p>;
                  }
                  return (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#ECEEEB] text-left text-[#252B28]/65">
                          <th className="py-2 pr-3 font-medium">Proyecto</th>
                          <th className="py-2 pr-3 font-medium">Responsable</th>
                          <th className="py-2 pr-3 font-medium">Entrega prev.</th>
                          <th className="py-2 pr-3 font-medium text-right">Presupuestado</th>
                          <th className="py-2 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ECEEEB]">
                        {list.map((p) => (
                          <tr key={p.id}>
                            <td className="py-2.5 pr-3 font-medium text-[#203C35]">{p.name}</td>
                            <td className="py-2.5 pr-3">{p.responsibleName || '—'}</td>
                            <td className="py-2.5 pr-3 font-mono-tabular">{formatDate(p.estimatedEndDate)}</td>
                            <td className="py-2.5 pr-3 text-right font-mono-tabular">{formatCurrency(p.budgetedPrice)}</td>
                            <td className="py-2.5"><StatusLabel value={p.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            )}

            {activeTab === 'presupuestos' && (
              <div>
                {cQuotes.length === 0 ? (
                  <p className="text-xs text-[#252B28]/60 py-4">Sin presupuestos asociados.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#ECEEEB] text-left text-[#252B28]/65">
                        <th className="py-2 pr-3 font-medium">Número</th>
                        <th className="py-2 pr-3 font-medium">Fecha</th>
                        <th className="py-2 pr-3 font-medium">Validez</th>
                        <th className="py-2 pr-3 font-medium text-right">Total</th>
                        <th className="py-2 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#ECEEEB]">
                      {cQuotes.map((q) => (
                        <tr key={q.id}>
                          <td className="py-2.5 pr-3 font-mono-tabular font-medium text-[#203C35]">{q.number}</td>
                          <td className="py-2.5 pr-3 font-mono-tabular">{formatDate(q.issueDate)}</td>
                          <td className="py-2.5 pr-3 font-mono-tabular">{formatDate(q.validUntil)}</td>
                          <td className="py-2.5 pr-3 text-right font-mono-tabular">{formatCurrency(q.total)}</td>
                          <td className="py-2.5"><StatusLabel value={q.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {(activeTab === 'facturas_emitidas' || activeTab === 'facturas_pendientes') && (
              <div>
                {(() => {
                  const list = activeTab === 'facturas_emitidas' ? cInvoices : cPendingInvoices;
                  if (list.length === 0) {
                    return <p className="text-xs text-[#252B28]/60 py-4">No existen facturas en esta vista.</p>;
                  }
                  return (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#ECEEEB] text-left text-[#252B28]/65">
                          <th className="py-2 pr-3 font-medium">Número</th>
                          <th className="py-2 pr-3 font-medium">Emisión</th>
                          <th className="py-2 pr-3 font-medium">Vencimiento</th>
                          <th className="py-2 pr-3 font-medium text-right">Total</th>
                          <th className="py-2 pr-3 font-medium text-right">Cobrado</th>
                          <th className="py-2 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ECEEEB]">
                        {list.map((inv) => (
                          <tr key={inv.id}>
                            <td className="py-2.5 pr-3 font-mono-tabular font-medium text-[#203C35]">{inv.number}</td>
                            <td className="py-2.5 pr-3 font-mono-tabular">{formatDate(inv.issueDate)}</td>
                            <td className="py-2.5 pr-3 font-mono-tabular">{formatDate(inv.dueDate)}</td>
                            <td className="py-2.5 pr-3 text-right font-mono-tabular">{formatCurrency(inv.total)}</td>
                            <td className="py-2.5 pr-3 text-right font-mono-tabular">{formatCurrency(inv.paidAmount)}</td>
                            <td className="py-2.5"><StatusLabel value={inv.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            )}

            {activeTab === 'gastos' && (
              <div>
                {cExpenses.length === 0 ? (
                  <p className="text-xs text-[#252B28]/60 py-4">No hay gastos imputados directamente a este cliente.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#ECEEEB] text-left text-[#252B28]/65">
                        <th className="py-2 pr-3 font-medium">Fecha</th>
                        <th className="py-2 pr-3 font-medium">Proveedor</th>
                        <th className="py-2 pr-3 font-medium">Concepto</th>
                        <th className="py-2 pr-3 font-medium text-right">Total</th>
                        <th className="py-2 font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#ECEEEB]">
                      {cExpenses.map((e) => (
                        <tr key={e.id}>
                          <td className="py-2.5 pr-3 font-mono-tabular">{formatDate(e.date)}</td>
                          <td className="py-2.5 pr-3">{e.supplierName}</td>
                          <td className="py-2.5 pr-3">{e.concept}</td>
                          <td className="py-2.5 pr-3 text-right font-mono-tabular">{formatCurrency(e.total)}</td>
                          <td className="py-2.5"><StatusLabel value={e.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === 'documentos' && (
              <div>
                {cDocs.length === 0 ? (
                  <p className="text-xs text-[#252B28]/60 py-4">
                    No hay documentos vinculados. Puedes subir archivos desde Gestión Documental asociando este cliente.
                  </p>
                ) : (
                  <div className="divide-y divide-[#ECEEEB]">
                    {cDocs.map((d) => (
                      <div key={d.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="font-medium text-[#203C35]">{d.name}</p>
                          <p className="text-[#252B28]/60">
                            {d.folder} · {d.docType} · {formatDate(d.uploadDate)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => downloadDocumentRecord(d)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[#ECEEEB] rounded-md hover:bg-[#F8F8F5]"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Descargar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'comunicaciones' && (
              <div className="space-y-5">
                {permissions.canWriteClients && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!commForm.subject.trim()) return;
                      await addCommunication({
                        clientId: selectedClient.id,
                        channel: commForm.channel,
                        subject: commForm.subject,
                        summary: commForm.summary,
                        date: commForm.date,
                      });
                      setCommForm({ channel: 'Email', subject: '', summary: '', date: todayIso() });
                    }}
                    className="p-4 bg-[#F8F8F5] border border-[#ECEEEB] rounded-md grid grid-cols-1 md:grid-cols-4 gap-3"
                  >
                    <select
                      value={commForm.channel}
                      onChange={(e) => setCommForm({ ...commForm, channel: e.target.value as Communication['channel'] })}
                      className="px-3 py-2 text-xs bg-white border border-[#ECEEEB] rounded-md"
                    >
                      <option value="Email">Email</option>
                      <option value="Teléfono">Teléfono</option>
                      <option value="Reunión">Reunión</option>
                      <option value="Videollamada">Videollamada</option>
                      <option value="Presencial">Presencial</option>
                    </select>
                    <input
                      type="date"
                      value={commForm.date}
                      onChange={(e) => setCommForm({ ...commForm, date: e.target.value })}
                      className="px-3 py-2 text-xs bg-white border border-[#ECEEEB] rounded-md"
                    />
                    <input
                      type="text"
                      placeholder="Asunto de la comunicación"
                      value={commForm.subject}
                      onChange={(e) => setCommForm({ ...commForm, subject: e.target.value })}
                      required
                      className="md:col-span-2 px-3 py-2 text-xs bg-white border border-[#ECEEEB] rounded-md"
                    />
                    <textarea
                      placeholder="Resumen o acuerdos..."
                      value={commForm.summary}
                      onChange={(e) => setCommForm({ ...commForm, summary: e.target.value })}
                      rows={2}
                      className="md:col-span-3 px-3 py-2 text-xs bg-white border border-[#ECEEEB] rounded-md"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#203C35] text-white rounded-md hover:bg-[#315348]"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                      Registrar
                    </button>
                  </form>
                )}

                {cComms.length === 0 ? (
                  <p className="text-xs text-[#252B28]/60">Sin comunicaciones registradas con este cliente.</p>
                ) : (
                  <div className="divide-y divide-[#ECEEEB]">
                    {cComms.map((m) => (
                      <div key={m.id} className="py-3 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#203C35]">{m.subject}</span>
                          <span className="font-mono-tabular text-[#252B28]/60">
                            {formatDate(m.date)} · {m.channel}
                          </span>
                        </div>
                        {m.summary && <p className="text-[#252B28]/80">{m.summary}</p>}
                        <p className="text-[#252B28]/50">Registrado por {m.authorName}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'historial' && (
              <div>
                {cLogs.length === 0 ? (
                  <p className="text-xs text-[#252B28]/60 py-4">Sin eventos de actividad vinculados.</p>
                ) : (
                  <div className="divide-y divide-[#ECEEEB]">
                    {cLogs.map((l) => (
                      <div key={l.id} className="py-2.5 text-xs flex items-center justify-between gap-4">
                        <div>
                          <span className="font-medium text-[#203C35]">{l.action}</span>
                          {l.details ? <span className="text-[#252B28]/70"> · {l.details}</span> : null}
                        </div>
                        <span className="text-[#252B28]/55 shrink-0">{l.actorName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'seguimiento' && (
              <div className="space-y-5">
                {permissions.canWriteProjects && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!remForm.title.trim()) return;
                      await saveTask({
                        title: remForm.title,
                        description: remForm.description,
                        dueDate: remForm.dueDate,
                        priority: remForm.priority,
                        clientId: selectedClient.id,
                        clientName: selectedClient.name,
                        category: 'Seguimiento',
                        status: 'Pendiente',
                      });
                      setRemForm({ title: '', dueDate: todayIso(), priority: 'Media', description: '' });
                    }}
                    className="p-4 bg-[#F8F8F5] border border-[#ECEEEB] rounded-md grid grid-cols-1 md:grid-cols-4 gap-3"
                  >
                    <input
                      type="text"
                      placeholder="Nuevo recordatorio o seguimiento"
                      value={remForm.title}
                      onChange={(e) => setRemForm({ ...remForm, title: e.target.value })}
                      required
                      className="md:col-span-2 px-3 py-2 text-xs bg-white border border-[#ECEEEB] rounded-md"
                    />
                    <input
                      type="date"
                      value={remForm.dueDate}
                      onChange={(e) => setRemForm({ ...remForm, dueDate: e.target.value })}
                      className="px-3 py-2 text-xs bg-white border border-[#ECEEEB] rounded-md"
                    />
                    <select
                      value={remForm.priority}
                      onChange={(e) => setRemForm({ ...remForm, priority: e.target.value as Task['priority'] })}
                      className="px-3 py-2 text-xs bg-white border border-[#ECEEEB] rounded-md"
                    >
                      <option value="Baja">Prioridad Baja</option>
                      <option value="Media">Prioridad Media</option>
                      <option value="Alta">Prioridad Alta</option>
                      <option value="Urgente">Prioridad Urgente</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Detalle adicional (opcional)"
                      value={remForm.description}
                      onChange={(e) => setRemForm({ ...remForm, description: e.target.value })}
                      className="md:col-span-3 px-3 py-2 text-xs bg-white border border-[#ECEEEB] rounded-md"
                    />
                    <button
                      type="submit"
                      className="px-3 py-2 text-xs font-medium bg-[#203C35] text-white rounded-md hover:bg-[#315348]"
                    >
                      Programar recordatorio
                    </button>
                  </form>
                )}

                {cTasks.length === 0 ? (
                  <p className="text-xs text-[#252B28]/60">No hay seguimientos programados.</p>
                ) : (
                  <div className="divide-y divide-[#ECEEEB]">
                    {cTasks.map((t) => (
                      <div key={t.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="font-medium text-[#203C35]">{t.title}</p>
                          <p className="text-[#252B28]/60">
                            {formatDate(t.dueDate)} · <StatusLabel value={t.priority} /> · <StatusLabel value={t.status} />
                          </p>
                        </div>
                        {t.status !== 'Completada' && permissions.canWriteProjects && (
                          <button
                            type="button"
                            onClick={() =>
                              saveTask(
                                {
                                  title: t.title,
                                  description: t.description,
                                  dueDate: t.dueDate,
                                  priority: t.priority,
                                  clientId: t.clientId,
                                  clientName: t.clientName,
                                  category: t.category,
                                  status: 'Completada',
                                },
                                t.id
                              )
                            }
                            className="px-2.5 py-1.5 text-xs border border-[#ECEEEB] rounded-md hover:bg-[#F8F8F5]"
                          >
                            Marcar completada
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main Clients Directory View
  return (
    <div className="space-y-5">
      <div className="bg-white border border-[#ECEEEB] rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-[#252B28]/45 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nombre, CIF, teléfono o email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-[#F8F8F5] border border-[#ECEEEB] rounded-md focus:outline-none focus:border-[#203C35]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-[#F8F8F5] border border-[#ECEEEB] rounded-md"
          >
            <option value="todos">Todos los estados</option>
            <option value="activo">Activos</option>
            <option value="potencial">Potenciales</option>
            <option value="inactivo">Inactivos</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-[#F8F8F5] border border-[#ECEEEB] rounded-md"
          >
            <option value="todos">Todos los tipos</option>
            <option value="Empresa">Empresa</option>
            <option value="Autónomo">Autónomo</option>
            <option value="Organismo Público">Organismo Público</option>
            <option value="Particular">Particular</option>
          </select>
          <label className="inline-flex items-center gap-1.5 text-xs text-[#252B28]/75 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-[#203C35]"
            />
            Ver archivados
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#F8F8F5] border border-[#ECEEEB] rounded-md hover:bg-[#ECEEEB]"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => handleExport('excel')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#F8F8F5] border border-[#ECEEEB] rounded-md hover:bg-[#ECEEEB]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </button>
          {permissions.canWriteClients && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#203C35] text-white rounded-md hover:bg-[#315348]"
            >
              <Plus className="w-3.5 h-3.5" />
              Nuevo cliente
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#ECEEEB] rounded-lg overflow-hidden">
        {filteredClients.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-medium text-[#203C35]">No hay clientes que coincidan con tu búsqueda</p>
            <p className="text-xs text-[#252B28]/60">
              Crea el primer cliente para gestionar su expediente completo, proyectos, presupuestos y facturas.
            </p>
            {permissions.canWriteClients && (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#203C35] text-white rounded-md"
              >
                <Plus className="w-3.5 h-3.5" />
                Crear primer cliente
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F8F8F5] border-b border-[#ECEEEB]">
                <tr className="text-left text-[#252B28]/70">
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => {
                        setSortBy('name');
                        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                      }}
                      className="inline-flex items-center gap-1 hover:text-[#203C35]"
                    >
                      Razón social / Nombre
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">CIF/NIF</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Contacto</th>
                  <th className="px-4 py-3 font-medium">Localidad</th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => {
                        setSortBy('signupDate');
                        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                      }}
                      className="inline-flex items-center gap-1 hover:text-[#203C35]"
                    >
                      Alta
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEEEB]">
                {filteredClients.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-[#F8F8F5]/70 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedClientId(c.id);
                      setActiveTab('resumen');
                    }}
                  >
                    <td className="px-4 py-3 font-medium text-[#203C35]">
                      {c.name}
                      {c.archived && <span className="text-[#252B28]/50 ml-1.5">(Archivado)</span>}
                    </td>
                    <td className="px-4 py-3 font-mono-tabular">{c.taxId}</td>
                    <td className="px-4 py-3">{c.clientType}</td>
                    <td className="px-4 py-3">
                      <div>{c.contactPerson || '—'}</div>
                      <div className="text-[#252B28]/60 font-mono-tabular">{c.phone || c.email || ''}</div>
                    </td>
                    <td className="px-4 py-3">{[c.city, c.province].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-4 py-3 font-mono-tabular">{formatDate(c.signupDate)}</td>
                    <td className="px-4 py-3">
                      <StatusLabel value={c.status} />
                    </td>
                    <td
                      className="px-4 py-3 text-right space-x-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {permissions.canWriteClients && (
                        <button
                          type="button"
                          onClick={() => openEditModal(c)}
                          title="Editar cliente"
                          className="p-1.5 text-[#252B28]/65 hover:text-[#203C35] rounded hover:bg-[#ECEEEB]"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {permissions.canDeleteNonFinancial && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteTarget(c)}
                          title="Eliminar o archivar"
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

      {/* Create/Edit Client Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingClient ? 'Editar ficha de cliente' : 'Nuevo cliente'}
        subtitle="No se permiten registros duplicados con el mismo CIF/NIF."
      >
        <form onSubmit={handleSaveClient} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <label className="space-y-1 md:col-span-2">
              <span className="font-medium text-[#252B28]">Nombre o razón social *</span>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-[#252B28]">CIF / NIF *</span>
              <input
                type="text"
                required
                value={form.taxId}
                onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md font-mono-tabular uppercase"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-[#252B28]">Tipo de cliente</span>
              <select
                value={form.clientType}
                onChange={(e) => setForm({ ...form, clientType: e.target.value as ClientType })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                <option value="Empresa">Empresa</option>
                <option value="Autónomo">Autónomo</option>
                <option value="Organismo Público">Organismo Público</option>
                <option value="Particular">Particular</option>
              </select>
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="font-medium text-[#252B28]">Dirección fiscal</span>
              <input
                type="text"
                value={form.fiscalAddress}
                onChange={(e) => setForm({ ...form, fiscalAddress: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-[#252B28]">Código postal</span>
              <input
                type="text"
                value={form.postalCode}
                onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md font-mono-tabular"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-[#252B28]">Localidad</span>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-[#252B28]">Provincia</span>
              <input
                type="text"
                value={form.province}
                onChange={(e) => setForm({ ...form, province: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-[#252B28]">Estado</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ClientStatus })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                <option value="activo">Activo</option>
                <option value="potencial">Potencial</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium text-[#252B28]">Persona de contacto</span>
              <input
                type="text"
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-[#252B28]">Teléfono</span>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md font-mono-tabular"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-[#252B28]">Correo electrónico</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-[#252B28]">Fecha de alta</span>
              <input
                type="date"
                value={form.signupDate}
                onChange={(e) => setForm({ ...form, signupDate: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="font-medium text-[#252B28]">Observaciones</span>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#ECEEEB]">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs font-medium border border-[#ECEEEB] rounded-md hover:bg-[#F8F8F5]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium bg-[#203C35] text-white rounded-md hover:bg-[#315348] disabled:opacity-50"
            >
              {saving ? 'Guardando...' : editingClient ? 'Guardar cambios' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Safe Archive / Delete Confirmation Modal */}
      <Modal
        open={Boolean(confirmDeleteTarget)}
        onClose={() => setConfirmDeleteTarget(null)}
        title="Confirmar archivo o eliminación de cliente"
        maxWidthClass="max-w-md"
      >
        {confirmDeleteTarget && (
          <div className="space-y-4 text-xs">
            <p className="text-[#252B28]/80 leading-relaxed">
              Has seleccionado a <strong>{confirmDeleteTarget.name}</strong> ({confirmDeleteTarget.taxId}). Por seguridad fiscal, si el cliente tiene facturas asociadas solo podrá archivarse.
            </p>
            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-[#ECEEEB]">
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget(null)}
                className="px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await archiveOrDeleteClient(confirmDeleteTarget, 'archive');
                  setConfirmDeleteTarget(null);
                }}
                className="px-3 py-2 bg-[#315348] text-white rounded-md"
              >
                Archivar cliente
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await archiveOrDeleteClient(confirmDeleteTarget, 'delete');
                  } finally {
                    setConfirmDeleteTarget(null);
                  }
                }}
                className="px-3 py-2 bg-[#B42318] text-white rounded-md"
              >
                Eliminar definitivamente
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
