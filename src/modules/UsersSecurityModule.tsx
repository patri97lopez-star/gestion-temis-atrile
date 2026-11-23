import React, { useMemo, useState } from 'react';
import {
  Check,
  Database,
  Download,
  FlaskConical,
  KeyRound,
  Lock,
  Minus,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { StatusLabel } from '../components/ui/StatusLabel';
import { useAuth } from '../context/AuthContext';
import { useErpData } from '../context/ErpDataContext';
import { timestampToMs, todayIso } from '../lib/formatters';
import { ROLE_PERMISSIONS, type UserPublic, type UserRole } from '../types/erp';

const ALL_ROLES: UserRole[] = ['Administrador', 'Administración', 'Comercial', 'Técnico', 'Consulta'];

const PERMISSION_ROWS: Array<{ key: keyof (typeof ROLE_PERMISSIONS)['Administrador']; label: string }> = [
  { key: 'canWriteClients', label: 'Crear y editar clientes / CRM' },
  { key: 'canWriteProjects', label: 'Gestionar trabajos y proyectos' },
  { key: 'canWriteQuotes', label: 'Emitir presupuestos' },
  { key: 'canWriteInvoices', label: 'Emitir facturas y registrar cobros' },
  { key: 'canWriteExpenses', label: 'Registrar gastos y facturas recibidas' },
  { key: 'canWriteFiscal', label: 'Gestionar Hacienda y cierre trimestral' },
  { key: 'canWriteDocuments', label: 'Subir documentación al archivo' },
  { key: 'canDeleteNonFinancial', label: 'Eliminar fichas o borradores no contables' },
  { key: 'canManageUsers', label: 'Administrar usuarios y roles' },
  { key: 'canEditSettings', label: 'Editar configuración fiscal de empresa' },
  { key: 'canUseAi', label: 'Consultar asistente IA y OCR' },
];

export const UsersSecurityModule: React.FC = () => {
  const { profile, permissions } = useAuth();
  const {
    usersPublic,
    userInvites,
    activityLogs,
    companySettings,
    clients,
    suppliers,
    projects,
    tasks,
    quotes,
    invoices,
    invoicePayments,
    expenses,
    fiscalObligations,
    gestoriaPackages,
    documents,
    inviteUser,
    updateStaffRoleAndStatus,
    loadDemoSandbox,
    clearDemoSandbox,
    notify,
  } = useErpData();

  const [inviteForm, setInviteForm] = useState({
    email: '',
    displayName: '',
    department: 'Administración',
    role: 'Administración' as UserRole,
  });
  const [inviting, setInviting] = useState(false);
  const [sandboxBusy, setSandboxBusy] = useState(false);
  const [logSearch, setLogSearch] = useState('');

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissions.canManageUsers) return;
    if (!inviteForm.email.trim() || !inviteForm.displayName.trim()) {
      notify('error', 'Indica nombre y correo electrónico de Google.');
      return;
    }
    setInviting(true);
    try {
      await inviteUser(inviteForm);
      setInviteForm({ email: '', displayName: '', department: 'Administración', role: 'Administración' });
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (staff: UserPublic, newRole: UserRole) => {
    if (!permissions.canManageUsers) return;
    if (staff.uid === profile?.uid && newRole !== 'Administrador') {
      notify('error', 'No puedes degradar tu propio rol de Administrador activo.');
      return;
    }
    await updateStaffRoleAndStatus(staff, newRole, staff.active);
  };

  const handleToggleActive = async (staff: UserPublic) => {
    if (!permissions.canManageUsers) return;
    if (staff.uid === profile?.uid) {
      notify('error', 'No puedes desactivar tu propia sesión de Administrador.');
      return;
    }
    await updateStaffRoleAndStatus(staff, staff.role, !staff.active);
  };

  const handleDownloadJsonBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      platform: 'GESTIÓN360',
      companySettings,
      clients,
      suppliers,
      projects,
      tasks,
      quotes,
      invoices,
      invoicePayments,
      expenses,
      fiscalObligations,
      gestoriaPackages,
      documentsMetadata: documents,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GESTION360_Backup_${todayIso()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('success', 'Copia de seguridad JSON generada.');
  };

  const filteredLogs = useMemo(() => {
    const term = logSearch.trim().toLowerCase();
    const sorted = [...activityLogs].sort(
      (a, b) => timestampToMs(b.createdAt) - timestampToMs(a.createdAt)
    );
    if (!term) return sorted.slice(0, 80);
    return sorted
      .filter(
        (l) =>
          l.actorName.toLowerCase().includes(term) ||
          l.action.toLowerCase().includes(term) ||
          l.module.toLowerCase().includes(term) ||
          (l.entityLabel || '').toLowerCase().includes(term)
      )
      .slice(0, 80);
  }, [activityLogs, logSearch]);

  const hasDemoRecords = useMemo(() => {
    return (
      clients.some((c) => c.id.startsWith('demo_')) ||
      projects.some((p) => p.id.startsWith('demo_')) ||
      expenses.some((e) => e.id.startsWith('demo_'))
    );
  }, [clients, projects, expenses]);

  return (
    <div className="space-y-6">
      {/* Current User + Security Architecture */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2 text-[#203C35]">
            <ShieldCheck className="w-4 h-4 text-[#C6A879]" />
            <h2 className="text-sm font-semibold">Tu sesión y perfil activo</h2>
          </div>
          <div className="space-y-1.5 text-xs">
            <p className="font-semibold text-[#252B28] text-sm">{profile?.displayName}</p>
            <p className="text-[#252B28]/70 font-mono-tabular">{profile?.email}</p>
            <p className="text-[#252B28]/70">
              Rol asignado: <span className="font-semibold text-[#203C35]">{profile?.role}</span>
            </p>
            <p className="text-[#252B28]/70">
              Departamento: <span className="text-[#252B28]">{profile?.department || 'General'}</span>
            </p>
          </div>
        </div>

        <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-2.5">
          <div className="flex items-center gap-2 text-[#203C35]">
            <KeyRound className="w-4 h-4 text-[#C6A879]" />
            <h2 className="text-sm font-semibold">Autenticación y recuperación</h2>
          </div>
          <p className="text-xs text-[#252B28]/75 leading-relaxed">
            El acceso se realiza mediante Google Sign-In con correo verificado. La recuperación de contraseña y verificación en dos pasos se gestionan directamente desde tu cuenta de Google.
          </p>
        </div>

        <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2 text-[#203C35]">
            <Database className="w-4 h-4 text-[#C6A879]" />
            <h2 className="text-sm font-semibold">Copia de seguridad y pruebas</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadJsonBackup}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#203C35] text-[#F8F8F5] rounded-md hover:bg-[#315348]"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar backup JSON
            </button>
            {permissions.canManageUsers && (
              <>
                <button
                  type="button"
                  disabled={sandboxBusy}
                  onClick={async () => {
                    setSandboxBusy(true);
                    try {
                      await loadDemoSandbox();
                    } finally {
                      setSandboxBusy(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#F8F8F5] text-[#203C35] border border-[#ECEEEB] rounded-md hover:bg-[#ECEEEB] disabled:opacity-50"
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  Cargar datos [DEMO]
                </button>
                {hasDemoRecords && (
                  <button
                    type="button"
                    disabled={sandboxBusy}
                    onClick={async () => {
                      setSandboxBusy(true);
                      try {
                        await clearDemoSandbox();
                      } finally {
                        setSandboxBusy(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#B42318] border border-[#ECEEEB] rounded-md hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Limpiar [DEMO]
                  </button>
                )}
              </>
            )}
          </div>
          <p className="text-[11px] text-[#252B28]/60">
            El entorno [DEMO] crea registros etiquetados independientes para pruebas funcionales sin mezclarse con documentación real.
          </p>
        </div>
      </div>

      {/* User Directory & Invitations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#203C35]">Equipo y control de accesos</h3>
              <p className="text-xs text-[#252B28]/65">
                Los cambios de rol se aplican inmediatamente tanto en la interfaz como en las reglas de base de datos.
              </p>
            </div>
            <span className="text-xs text-[#252B28]/60 font-mono-tabular">
              {usersPublic.length} usuarios
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#ECEEEB] text-[#252B28]/65">
                  <th className="py-2.5 pr-3 font-medium">Usuario</th>
                  <th className="py-2.5 px-3 font-medium">Departamento</th>
                  <th className="py-2.5 px-3 font-medium">Rol</th>
                  <th className="py-2.5 px-3 font-medium">Estado</th>
                  {permissions.canManageUsers && <th className="py-2.5 pl-3 text-right font-medium">Acción</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEEEB]">
                {usersPublic.map((staff) => (
                  <tr key={staff.uid} className="hover:bg-[#F8F8F5]/70">
                    <td className="py-2.5 pr-3 font-medium text-[#252B28]">
                      {staff.displayName}
                      {staff.uid === profile?.uid && (
                        <span className="ml-2 text-[11px] text-[#315348] font-normal">(Tú)</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[#252B28]/70">{staff.department || 'General'}</td>
                    <td className="py-2.5 px-3">
                      {permissions.canManageUsers ? (
                        <select
                          value={staff.role}
                          disabled={staff.uid === profile?.uid}
                          onChange={(e) => handleRoleChange(staff, e.target.value as UserRole)}
                          className="px-2 py-1 text-xs bg-[#F8F8F5] border border-[#ECEEEB] rounded disabled:opacity-60"
                        >
                          {ALL_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>{staff.role}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusLabel value={staff.active ? 'activo' : 'inactivo'} />
                    </td>
                    {permissions.canManageUsers && (
                      <td className="py-2.5 pl-3 text-right">
                        <button
                          type="button"
                          disabled={staff.uid === profile?.uid}
                          onClick={() => handleToggleActive(staff)}
                          className="text-xs font-medium text-[#203C35] hover:underline disabled:opacity-40"
                        >
                          {staff.active ? 'Desactivar' : 'Reactivar'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Invite User Panel */}
        <div className="lg:col-span-4 bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2 text-[#203C35]">
            <UserPlus className="w-4 h-4 text-[#C6A879]" />
            <h3 className="text-sm font-semibold">Preautorizar usuario por email</h3>
          </div>

          {!permissions.canManageUsers ? (
            <div className="p-3 bg-[#F8F8F5] border border-[#ECEEEB] rounded-md text-xs text-[#252B28]/70 flex items-start gap-2">
              <Lock className="w-4 h-4 shrink-0 mt-0.5 text-[#203C35]" />
              <span>Solo los usuarios con rol Administrador pueden invitar o cambiar permisos del equipo.</span>
            </div>
          ) : (
            <>
              <form onSubmit={handleInvite} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                    Correo electrónico Google *
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="nombre@empresa.com"
                    className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                    Nombre completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={inviteForm.displayName}
                    onChange={(e) => setInviteForm((f) => ({ ...f, displayName: e.target.value }))}
                    placeholder="Nombre y apellidos"
                    className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">Rol</label>
                    <select
                      value={inviteForm.role}
                      onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value as UserRole }))}
                      className="w-full px-2.5 py-2 text-xs border border-[#ECEEEB] rounded-md bg-white"
                    >
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                      Departamento
                    </label>
                    <input
                      type="text"
                      value={inviteForm.department}
                      onChange={(e) => setInviteForm((f) => ({ ...f, department: e.target.value }))}
                      className="w-full px-2.5 py-2 text-xs border border-[#ECEEEB] rounded-md"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={inviting}
                  className="w-full px-4 py-2 text-xs font-medium bg-[#203C35] text-[#F8F8F5] rounded-md hover:bg-[#315348] disabled:opacity-50"
                >
                  {inviting ? 'Guardando...' : 'Autorizar acceso'}
                </button>
              </form>

              {userInvites.length > 0 && (
                <div className="pt-3 border-t border-[#ECEEEB] space-y-2">
                  <p className="text-[11px] font-medium text-[#252B28]/65">
                    Invitaciones registradas ({userInvites.length})
                  </p>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {userInvites.map((inv) => (
                      <div key={inv.id} className="text-[11px] flex items-center justify-between gap-2 py-1">
                        <span className="truncate text-[#252B28]">{inv.email}</span>
                        <span className="text-[#315348] font-medium shrink-0">{inv.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Role Permissions Matrix */}
      <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold text-[#203C35]">Matriz de permisos por perfil</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#ECEEEB] text-[#252B28]/65">
                <th className="py-2 pr-4 font-medium">Capacidad operativa</th>
                {ALL_ROLES.map((r) => (
                  <th key={r} className="py-2 px-3 text-center font-medium">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEEEB]">
              {PERMISSION_ROWS.map((row) => (
                <tr key={row.key}>
                  <td className="py-2 pr-4 text-[#252B28]">{row.label}</td>
                  {ALL_ROLES.map((role) => {
                    const allowed = ROLE_PERMISSIONS[role][row.key];
                    return (
                      <td key={role} className="py-2 px-3 text-center">
                        {allowed ? (
                          <Check className="w-3.5 h-3.5 text-[#1E6B47] inline" />
                        ) : (
                          <Minus className="w-3.5 h-3.5 text-[#252B28]/30 inline" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Trail */}
      <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#203C35]">Registro de auditoría e historial</h3>
            <p className="text-xs text-[#252B28]/65">
              Registro inmutable de operaciones relevantes ejecutadas en la plataforma.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-[#252B28]/50 absolute left-3 top-2.5" />
            <input
              type="text"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              placeholder="Filtrar por usuario o acción..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#F8F8F5] border border-[#ECEEEB] rounded-md"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#ECEEEB] text-[#252B28]/65">
                <th className="py-2 pr-3 font-medium">Fecha y hora</th>
                <th className="py-2 px-3 font-medium">Usuario</th>
                <th className="py-2 px-3 font-medium">Módulo</th>
                <th className="py-2 px-3 font-medium">Acción</th>
                <th className="py-2 pl-3 font-medium">Referencia / Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEEEB]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#252B28]/60">
                    No hay registros de auditoría que coincidan con el filtro.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const ms = timestampToMs(log.createdAt);
                  const dateLabel = ms
                    ? new Intl.DateTimeFormat('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(ms))
                    : '—';
                  return (
                    <tr key={log.id}>
                      <td className="py-2 pr-3 font-mono-tabular text-[#252B28]/70 whitespace-nowrap">
                        {dateLabel}
                      </td>
                      <td className="py-2 px-3 font-medium text-[#252B28]">
                        {log.actorName}{' '}
                        <span className="text-[#252B28]/55 font-normal">({log.actorRole})</span>
                      </td>
                      <td className="py-2 px-3 text-[#315348]">{log.module}</td>
                      <td className="py-2 px-3 text-[#252B28]">{log.action}</td>
                      <td className="py-2 pl-3 text-[#252B28]/70">
                        {[log.entityLabel, log.details].filter(Boolean).join(' · ') || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
