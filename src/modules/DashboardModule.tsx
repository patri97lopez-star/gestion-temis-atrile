import React, { useMemo, useState } from 'react';
import {
  Bell,
  Briefcase,
  CalendarClock,
  CheckSquare,
  ChevronRight,
  FilePlus2,
  FolderUp,
  Landmark,
  Plus,
  Receipt,
  Scale,
  UserPlus,
} from 'lucide-react';
import {
  AreaEvolutionChart,
  BarComparisonChart,
  DonutBreakdownChart,
  HorizontalBarList,
} from '../components/ui/Charts';
import { StatusLabel } from '../components/ui/StatusLabel';
import { useAuth } from '../context/AuthContext';
import { useErpData } from '../context/ErpDataContext';
import { addDaysIso, formatCurrency, formatDate, timestampToMs, todayIso } from '../lib/formatters';
import type { ModuleKey } from '../types/erp';

interface DashboardProps {
  onNavigate: (mod: ModuleKey, action?: string) => void;
}

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 13) return 'Buenos días';
  if (hour >= 13 && hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function formatHeroDate(): string {
  const formatted = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatRelativeDay(isoDate: string, today: string): string {
  if (isoDate === today) return 'Hoy';
  if (isoDate === addDaysIso(today, 1)) return 'Mañana';
  return formatDate(isoDate);
}

export const DashboardModule: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { permissions, profile } = useAuth();
  const {
    companySettings,
    clients,
    invoices,
    expenses,
    projects,
    fiscalObligations,
    tasks,
    activityLogs,
    loadingData,
  } = useErpData();

  const [alertsOpen, setAlertsOpen] = useState(false);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthPrefix = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayStr = todayIso();
  const firstName = profile?.displayName?.split(' ')[0] || '';

  const metrics = useMemo(() => {
    const activeClientsList = clients.filter((c) => !c.archived);
    const totalClients = activeClientsList.length;
    const activeClients = activeClientsList.filter((c) => c.status === 'activo').length;
    const newClientsMonth = activeClientsList.filter((c) =>
      (c.signupDate || '').startsWith(currentMonthPrefix)
    ).length;

    const validInvoices = invoices.filter((i) => i.status !== 'Borrador');
    const monthlyBilling = validInvoices
      .filter((i) => i.issueDate.startsWith(currentMonthPrefix))
      .reduce((s, i) => s + i.taxBase, 0);
    const annualBilling = validInvoices
      .filter((i) => i.issueDate.startsWith(`${currentYear}-`))
      .reduce((s, i) => s + i.taxBase, 0);

    const pendingInvoicesList = validInvoices.filter(
      (i) =>
        i.status === 'Emitida' ||
        i.status === 'Pendiente de cobro' ||
        i.status === 'Parcialmente cobrada' ||
        i.status === 'Vencida'
    );
    const pendingCollectionAmount = pendingInvoicesList.reduce(
      (s, i) => s + Math.max(0, i.total - i.paidAmount),
      0
    );

    const monthlyExpenses = expenses
      .filter((e) => e.date.startsWith(currentMonthPrefix))
      .reduce((s, e) => s + e.taxBase, 0);

    const estimatedProfit = monthlyBilling - monthlyExpenses;

    const projectsInProgress = projects.filter(
      (p) => p.status === 'En proceso' || p.status === 'En revisión'
    ).length;
    const projectsPending = projects.filter(
      (p) => p.status === 'Pendiente' || p.status === 'Esperando al cliente'
    ).length;

    const upcomingFiscal = fiscalObligations.filter(
      (f) =>
        f.applicable &&
        f.status !== 'Presentado' &&
        f.status !== 'Justificante archivado' &&
        f.dueDate >= todayStr
    ).length;

    const pendingTasksCount = tasks.filter((t) => t.status !== 'Completada').length;

    return {
      totalClients,
      activeClients,
      newClientsMonth,
      monthlyBilling,
      annualBilling,
      pendingInvoicesCount: pendingInvoicesList.length,
      pendingCollectionAmount,
      monthlyExpenses,
      estimatedProfit,
      projectsInProgress,
      projectsPending,
      upcomingFiscal,
      pendingTasksCount,
    };
  }, [clients, invoices, expenses, projects, fiscalObligations, tasks, currentMonthPrefix, currentYear, todayStr]);

  // Actionable alerts for the hero bell button
  const alerts = useMemo(() => {
    const list: Array<{ id: string; title: string; detail: string; target: ModuleKey }> = [];
    const dueWarnLimit = addDaysIso(todayStr, companySettings?.notifyDaysBeforeDue ?? 7);
    const fiscalWarnLimit = addDaysIso(todayStr, companySettings?.notifyFiscalDaysBefore ?? 10);

    invoices
      .filter(
        (i) =>
          i.status !== 'Borrador' &&
          i.status !== 'Cobrada' &&
          i.status !== 'Rectificada' &&
          i.dueDate <= dueWarnLimit
      )
      .slice(0, 4)
      .forEach((i) => {
        list.push({
          id: `inv_${i.id}`,
          title: i.dueDate < todayStr ? `Factura vencida ${i.number}` : `Cobro próximo ${i.number}`,
          detail: `${i.clientName} · Vence ${formatDate(i.dueDate)}`,
          target: 'invoices',
        });
      });

    fiscalObligations
      .filter(
        (f) =>
          f.applicable &&
          f.status !== 'Presentado' &&
          f.status !== 'Justificante archivado' &&
          f.dueDate <= fiscalWarnLimit
      )
      .slice(0, 4)
      .forEach((f) => {
        list.push({
          id: `fis_${f.id}`,
          title: `${f.modelCode} (${f.period})`,
          detail: `Plazo límite ${formatDate(f.dueDate)}`,
          target: 'hacienda',
        });
      });

    tasks
      .filter((t) => t.status !== 'Completada' && (t.priority === 'Urgente' || t.dueDate <= todayStr))
      .slice(0, 4)
      .forEach((t) => {
        list.push({
          id: `tsk_${t.id}`,
          title: t.title,
          detail: `${t.priority} · ${formatRelativeDay(t.dueDate, todayStr)}`,
          target: 'calendar',
        });
      });

    return list;
  }, [invoices, fiscalObligations, tasks, todayStr, companySettings]);

  const monthlyChartData = useMemo(() => {
    return MONTH_NAMES.map((label, idx) => {
      const prefix = `${currentYear}-${String(idx + 1).padStart(2, '0')}`;
      const income = invoices
        .filter((i) => i.status !== 'Borrador' && i.issueDate.startsWith(prefix))
        .reduce((s, i) => s + i.taxBase, 0);
      const expense = expenses
        .filter((e) => e.date.startsWith(prefix))
        .reduce((s, e) => s + e.taxBase, 0);
      return { label, income, expense };
    });
  }, [invoices, expenses, currentYear]);

  const billingByClient = useMemo(() => {
    const map: Record<string, number> = {};
    invoices
      .filter((i) => i.status !== 'Borrador')
      .forEach((i) => {
        map[i.clientName] = (map[i.clientName] || 0) + i.taxBase;
      });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }));
  }, [invoices]);

  const expensesByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + e.taxBase;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));
  }, [expenses]);

  const projectsByStatus = useMemo(() => {
    const statuses = ['Pendiente', 'En proceso', 'Esperando al cliente', 'En revisión', 'Finalizado', 'Facturado'];
    return statuses
      .map((st) => ({
        label: st,
        value: projects.filter((p) => p.status === st).length,
      }))
      .filter((s) => s.value > 0);
  }, [projects]);

  const recentActivity = useMemo(() => {
    return [...activityLogs]
      .sort((a, b) => timestampToMs(b.createdAt) - timestampToMs(a.createdAt))
      .slice(0, 6);
  }, [activityLogs]);

  const upcomingTasks = useMemo(() => {
    return tasks
      .filter((t) => t.status !== 'Completada')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 6);
  }, [tasks]);

  const nextFiscalDeadlines = useMemo(() => {
    return fiscalObligations
      .filter(
        (f) =>
          f.applicable &&
          f.status !== 'Presentado' &&
          f.status !== 'Justificante archivado'
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5);
  }, [fiscalObligations]);

  const quickActions = [
    {
      key: 'client',
      label: 'Cliente',
      icon: UserPlus,
      allowed: permissions.canWriteClients,
      onClick: () => onNavigate('clients', 'new'),
    },
    {
      key: 'invoice',
      label: 'Factura',
      icon: Receipt,
      allowed: permissions.canWriteInvoices,
      onClick: () => onNavigate('invoices', 'new'),
    },
    {
      key: 'expense',
      label: 'Gasto',
      icon: Plus,
      allowed: permissions.canWriteExpenses,
      onClick: () => onNavigate('expenses', 'new'),
    },
    {
      key: 'project',
      label: 'Trabajo',
      icon: Briefcase,
      allowed: permissions.canWriteProjects,
      onClick: () => onNavigate('projects', 'new'),
    },
    {
      key: 'document',
      label: 'Documento',
      icon: FolderUp,
      allowed: permissions.canWriteDocuments,
      onClick: () => onNavigate('documents', 'new'),
    },
    {
      key: 'quote',
      label: 'Presupuesto',
      icon: FilePlus2,
      allowed: permissions.canWriteQuotes,
      onClick: () => onNavigate('quotes', 'new'),
    },
  ].filter((item) => item.allowed);

  return (
    <div className="space-y-6">
      {/* Executive Forest-Green Hero Card */}
      <section className="relative bg-[#203C35] text-[#F8F8F5] rounded-2xl p-6 sm:p-8">
        {/* Hero Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#C6A879]/25 border border-[#C6A879]/40 flex items-center justify-center shrink-0 overflow-hidden">
              {companySettings?.logoDataUrl ? (
                <img
                  src={companySettings.logoDataUrl}
                  alt={companySettings.tradeName}
                  className="w-full h-full object-contain p-1 bg-white/90"
                />
              ) : (
                <Scale className="w-5 h-5 text-[#C6A879]" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-semibold tracking-tight text-[#F8F8F5] truncate">
                {companySettings?.tradeName && companySettings.tradeName !== 'GESTIÓN360'
                  ? companySettings.tradeName
                  : 'Gestión Temis Atrile'}
              </div>
              <div className="text-xs text-[#F8F8F5]/70 truncate">
                Panel de administración
              </div>
            </div>
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setAlertsOpen((v) => !v)}
              aria-label="Ver avisos y vencimientos"
              className="relative w-10 h-10 rounded-xl bg-[#2B4B43] hover:bg-[#315348] flex items-center justify-center text-[#F8F8F5] transition-colors"
            >
              <Bell className="w-4 h-4" />
              {alerts.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C6A879] text-[#203C35] text-[10px] font-semibold font-mono-tabular flex items-center justify-center">
                  {alerts.length}
                </span>
              )}
            </button>

            {alertsOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white text-[#252B28] border border-[#ECEEEB] rounded-xl shadow-lg p-4 z-30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#203C35]">
                    Avisos y próximos plazos
                  </span>
                  <button
                    type="button"
                    onClick={() => setAlertsOpen(false)}
                    className="text-[11px] text-[#252B28]/60 hover:text-[#203C35]"
                  >
                    Cerrar
                  </button>
                </div>
                {alerts.length === 0 ? (
                  <p className="text-xs text-[#252B28]/65 py-2">
                    No hay vencimientos inmediatos ni incidencias pendientes.
                  </p>
                ) : (
                  <div className="divide-y divide-[#ECEEEB] max-h-64 overflow-y-auto">
                    {alerts.map((al) => (
                      <button
                        key={al.id}
                        type="button"
                        onClick={() => {
                          setAlertsOpen(false);
                          onNavigate(al.target);
                        }}
                        className="w-full text-left py-2.5 flex items-center justify-between gap-2 hover:bg-[#F8F8F5] rounded px-1.5 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-[#203C35] truncate">{al.title}</p>
                          <p className="text-[11px] text-[#252B28]/65 truncate">{al.detail}</p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-[#252B28]/45 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Date & Executive Greeting */}
        <div className="mt-6 space-y-1">
          <p className="text-xs font-medium text-[#C6A879] tracking-wide">
            {formatHeroDate()}
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#F8F8F5]">
            {getTimeGreeting()}
            {firstName ? `, ${firstName}` : ''}
          </h2>
          <p className="text-sm text-[#F8F8F5]/75">
            Este es el resumen actualizado de tu empresa.
          </p>
        </div>

        {/* 4 Core KPI Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mt-6">
          <button
            type="button"
            onClick={() => onNavigate('clients')}
            className="text-left bg-[#2B4B43] hover:bg-[#315348] rounded-xl p-5 transition-colors flex flex-col justify-between gap-2"
          >
            <span className="text-xs font-medium text-[#F8F8F5]/80">Clientes activos</span>
            {loadingData ? (
              <div className="h-8 w-20 bg-white/10 rounded animate-pulse" />
            ) : (
              <div className="text-2xl sm:text-3xl font-semibold text-[#F8F8F5] font-mono-tabular tracking-tight">
                {metrics.activeClients}
              </div>
            )}
            <span className="text-xs text-[#C6A879] font-mono-tabular">
              +{metrics.newClientsMonth} este mes · {metrics.totalClients} totales
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('invoices')}
            className="text-left bg-[#2B4B43] hover:bg-[#315348] rounded-xl p-5 transition-colors flex flex-col justify-between gap-2"
          >
            <span className="text-xs font-medium text-[#F8F8F5]/80">Facturación del mes</span>
            {loadingData ? (
              <div className="h-8 w-28 bg-white/10 rounded animate-pulse" />
            ) : (
              <div className="text-2xl sm:text-3xl font-semibold text-[#F8F8F5] font-mono-tabular tracking-tight">
                {formatCurrency(metrics.monthlyBilling)}
              </div>
            )}
            <span className="text-xs text-[#F8F8F5]/70 font-mono-tabular">
              Anual {currentYear}: {formatCurrency(metrics.annualBilling)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('invoices')}
            className="text-left bg-[#2B4B43] hover:bg-[#315348] rounded-xl p-5 transition-colors flex flex-col justify-between gap-2"
          >
            <span className="text-xs font-medium text-[#F8F8F5]/80">Facturas pendientes</span>
            {loadingData ? (
              <div className="h-8 w-28 bg-white/10 rounded animate-pulse" />
            ) : (
              <div className="text-2xl sm:text-3xl font-semibold text-[#F8F8F5] font-mono-tabular tracking-tight">
                {formatCurrency(metrics.pendingCollectionAmount)}
              </div>
            )}
            <span className="text-xs text-[#F8F8F5]/70 font-mono-tabular">
              {metrics.pendingInvoicesCount} por cobrar
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('expenses')}
            className="text-left bg-[#2B4B43] hover:bg-[#315348] rounded-xl p-5 transition-colors flex flex-col justify-between gap-2"
          >
            <span className="text-xs font-medium text-[#F8F8F5]/80">Gastos del mes</span>
            {loadingData ? (
              <div className="h-8 w-28 bg-white/10 rounded animate-pulse" />
            ) : (
              <div className="text-2xl sm:text-3xl font-semibold text-[#F8F8F5] font-mono-tabular tracking-tight">
                {formatCurrency(metrics.monthlyExpenses)}
              </div>
            )}
            <span className="text-xs text-[#F8F8F5]/70 font-mono-tabular">
              Beneficio est.: {formatCurrency(metrics.estimatedProfit)}
            </span>
          </button>
        </div>

        {/* Secondary Operational Summary Strip */}
        <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <button
            type="button"
            onClick={() => onNavigate('projects')}
            className="text-left flex items-center justify-between gap-2 py-1 text-[#F8F8F5]/80 hover:text-[#F8F8F5] transition-colors"
          >
            <span>Trabajos en curso</span>
            <span className="font-mono-tabular font-semibold text-[#F8F8F5]">
              {metrics.projectsInProgress}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('projects')}
            className="text-left flex items-center justify-between gap-2 py-1 text-[#F8F8F5]/80 hover:text-[#F8F8F5] transition-colors"
          >
            <span>Trabajos pendientes</span>
            <span className="font-mono-tabular font-semibold text-[#F8F8F5]">
              {metrics.projectsPending}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('hacienda')}
            className="text-left flex items-center justify-between gap-2 py-1 text-[#F8F8F5]/80 hover:text-[#F8F8F5] transition-colors"
          >
            <span>Vencimientos fiscales</span>
            <span className="font-mono-tabular font-semibold text-[#C6A879]">
              {metrics.upcomingFiscal}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('calendar')}
            className="text-left flex items-center justify-between gap-2 py-1 text-[#F8F8F5]/80 hover:text-[#F8F8F5] transition-colors"
          >
            <span>Tareas pendientes</span>
            <span className="font-mono-tabular font-semibold text-[#F8F8F5]">
              {metrics.pendingTasksCount}
            </span>
          </button>
        </div>
      </section>

      {/* Quick Actions Tile Strip */}
      {quickActions.length > 0 && (
        <section className="bg-white border border-[#ECEEEB] rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-semibold text-[#203C35]">Accesos rápidos</h3>
            <span className="text-xs text-[#252B28]/55">Creación directa</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={action.onClick}
                  className="group flex flex-col items-center gap-2.5 p-3 rounded-xl hover:bg-[#F8F8F5] transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#ECEEEB]/80 text-[#203C35] group-hover:bg-[#203C35] group-hover:text-[#F8F8F5] flex items-center justify-center transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium text-[#252B28] whitespace-nowrap">
                    {action.label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Operational Lists: Tareas pendientes, Vencimientos fiscales, Actividad reciente */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-[#ECEEEB] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-semibold text-[#203C35] flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-[#C6A879]" />
              Tareas pendientes
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="text-xs text-[#315348] hover:underline font-medium whitespace-nowrap"
            >
              Ver agenda
            </button>
          </div>
          {upcomingTasks.length === 0 ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-xs text-[#252B28]/60">No hay tareas pendientes programadas.</p>
              <button
                type="button"
                onClick={() => onNavigate('calendar')}
                className="text-xs font-medium text-[#203C35] underline"
              >
                Añadir recordatorio
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#ECEEEB]">
              {upcomingTasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onNavigate('calendar')}
                  className="w-full text-left py-3 flex items-center justify-between gap-3 text-xs hover:bg-[#F8F8F5]/70 px-1 rounded transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusLabel value={t.priority} className="shrink-0" />
                    <span className="font-medium text-[#252B28] truncate">{t.title}</span>
                  </div>
                  <span className="text-[#252B28]/60 font-mono-tabular shrink-0">
                    {formatRelativeDay(t.dueDate, todayStr)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#ECEEEB] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-semibold text-[#203C35] flex items-center gap-2">
              <Landmark className="w-4 h-4 text-[#C6A879]" />
              Vencimientos fiscales
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('hacienda')}
              className="text-xs text-[#315348] hover:underline font-medium whitespace-nowrap"
            >
              Ir a Hacienda
            </button>
          </div>
          {nextFiscalDeadlines.length === 0 ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-xs text-[#252B28]/60">
                No hay obligaciones fiscales pendientes configuradas.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('hacienda')}
                className="text-xs font-medium text-[#203C35] underline"
              >
                Configurar calendario fiscal
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#ECEEEB]">
              {nextFiscalDeadlines.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onNavigate('hacienda')}
                  className="w-full text-left py-3 flex items-center justify-between gap-3 text-xs hover:bg-[#F8F8F5]/70 px-1 rounded transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[#203C35] truncate">
                      {f.modelCode} · {f.period}
                    </p>
                    <p className="text-[#252B28]/60 truncate">
                      Límite {formatDate(f.dueDate)}
                    </p>
                  </div>
                  <StatusLabel value={f.status} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#ECEEEB] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-semibold text-[#203C35] flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-[#C6A879]" />
              Actividad reciente
            </h3>
            <span className="text-xs text-[#252B28]/55 font-mono-tabular">
              {recentActivity.length} reg.
            </span>
          </div>
          {recentActivity.length === 0 ? (
            <p className="text-xs text-[#252B28]/60 py-6 text-center">
              Aquí aparecerá el historial de operaciones realizadas en la plataforma.
            </p>
          ) : (
            <div className="divide-y divide-[#ECEEEB]">
              {recentActivity.map((log) => (
                <div key={log.id} className="py-2.5 text-xs space-y-0.5">
                  <div className="font-medium text-[#252B28] truncate">
                    {log.action}
                    {log.entityLabel ? ` · ${log.entityLabel}` : ''}
                  </div>
                  <div className="text-[#252B28]/60 truncate">
                    {log.actorName} · {log.module}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Primary Financial Charts */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border border-[#ECEEEB] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-semibold text-[#203C35]">
              Ingresos y gastos mensuales ({currentYear})
            </h3>
            <span className="text-xs text-[#252B28]/60">Base imponible</span>
          </div>
          <BarComparisonChart data={monthlyChartData} />
        </div>

        <div className="bg-white border border-[#ECEEEB] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-semibold text-[#203C35]">
              Evolución de facturación ({currentYear})
            </h3>
            <span className="text-xs text-[#252B28]/60">Tendencia mensual</span>
          </div>
          <AreaEvolutionChart
            points={monthlyChartData.map((m) => ({ label: m.label, value: m.income }))}
          />
        </div>
      </section>

      {/* Secondary Breakdown Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-[#ECEEEB] rounded-2xl p-6 space-y-4">
          <h3 className="text-sm sm:text-base font-semibold text-[#203C35]">Facturación por cliente</h3>
          <HorizontalBarList
            items={billingByClient}
            emptyText="Aún no hay facturas emitidas registradas."
          />
        </div>

        <div className="bg-white border border-[#ECEEEB] rounded-2xl p-6 space-y-4">
          <h3 className="text-sm sm:text-base font-semibold text-[#203C35]">Gastos por categorías</h3>
          <DonutBreakdownChart
            items={expensesByCategory}
            emptyText="Aún no hay gastos registrados."
          />
        </div>

        <div className="bg-white border border-[#ECEEEB] rounded-2xl p-6 space-y-4">
          <h3 className="text-sm sm:text-base font-semibold text-[#203C35]">Trabajos por estado</h3>
          <HorizontalBarList
            items={projectsByStatus}
            formatValue={(v) => `${v} proy.`}
            emptyText="Sin trabajos o proyectos activos."
          />
        </div>
      </section>
    </div>
  );
};
