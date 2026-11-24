/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  BarChart3,
  Bot,
  Briefcase,
  CalendarDays,
  FileSpreadsheet,
  FolderArchive,
  Landmark,
  LayoutDashboard,
  Menu,
  Receipt,
  Scale,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
  X,
  AlertTriangle,
} from 'lucide-react';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ToastContainer } from './components/ui/ToastContainer';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ErpDataProvider, useErpData } from './context/ErpDataContext';
import { AiAssistantModule } from './modules/AiAssistantModule';
import { CalendarModule } from './modules/CalendarModule';
import { ClientsModule } from './modules/ClientsModule';
import { CompanySettingsModule } from './modules/CompanySettingsModule';
import { DashboardModule } from './modules/DashboardModule';
import { DocumentsModule } from './modules/DocumentsModule';
import { ExpensesAccountingModule } from './modules/ExpensesAccountingModule';
import { HaciendaGestoriaModule } from './modules/HaciendaGestoriaModule';
import { InvoicesModule } from './modules/InvoicesModule';
import { ProjectsModule } from './modules/ProjectsModule';
import { QuotesModule } from './modules/QuotesModule';
import { ReportsModule } from './modules/ReportsModule';
import { SuppliersModule } from './modules/SuppliersModule';
import { UsersSecurityModule } from './modules/UsersSecurityModule';
import type { ModuleKey } from './types/erp';

interface NavGroup {
  title: string;
  items: Array<{
    key: ModuleKey;
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Dirección',
    items: [
      {
        key: 'dashboard',
        label: 'Panel Principal',
        subtitle: 'Visión ejecutiva, KPIs, evolución financiera y accesos operativos',
        icon: LayoutDashboard,
      },
      {
        key: 'calendar',
        label: 'Calendario y Seguimiento',
        subtitle: 'Agenda unificada de vencimientos, proyectos, impuestos y tareas',
        icon: CalendarDays,
      },
    ],
  },
  {
    title: 'Operaciones y CRM',
    items: [
      {
        key: 'clients',
        label: 'Clientes (CRM)',
        subtitle: 'Directorio corporativo y fichas individuales con 11 vistas operativas',
        icon: Users,
      },
      {
        key: 'projects',
        label: 'Trabajos y Proyectos',
        subtitle: 'Control de ejecución, tablero Kanban, horas dedicadas y márgenes',
        icon: Briefcase,
      },
      {
        key: 'quotes',
        label: 'Presupuestos',
        subtitle: 'Elaboración de ofertas, PDF corporativo y conversión a proyecto o factura',
        icon: FileSpreadsheet,
      },
      {
        key: 'suppliers',
        label: 'Proveedores',
        subtitle: 'Ficha de acreedores, condiciones de pago e historial de compras',
        icon: Truck,
      },
    ],
  },
  {
    title: 'Económico y Fiscal',
    items: [
      {
        key: 'invoices',
        label: 'Facturación',
        subtitle: 'Facturas emitidas y recibidas, cobros parciales, rectificativas y bloqueos',
        icon: Receipt,
      },
      {
        key: 'expenses',
        label: 'Gastos y Contabilidad',
        subtitle: 'Categorías de gasto, cálculo orientativo de IVA y rentabilidad',
        icon: Wallet,
      },
      {
        key: 'hacienda',
        label: 'Hacienda y Gestoría',
        subtitle: 'Calendario fiscal configurable y preparación de paquete trimestral ZIP',
        icon: Landmark,
      },
      {
        key: 'reports',
        label: 'Informes y Estadísticas',
        subtitle: 'Análisis económico, comparativas trimestrales y exportación PDF/Excel',
        icon: BarChart3,
      },
    ],
  },
  {
    title: 'Archivo y Sistema',
    items: [
      {
        key: 'documents',
        label: 'Gestión Documental',
        subtitle: 'Archivo digital organizado por carpetas y vinculado a operaciones',
        icon: FolderArchive,
      },
      {
        key: 'ai',
        label: 'Asistente IA y OCR',
        subtitle: 'Consultas sobre datos reales y lectura asistida de facturas recibidas',
        icon: Bot,
      },
      {
        key: 'users',
        label: 'Usuarios y Seguridad',
        subtitle: 'Roles, invitaciones, copias de seguridad y auditoría de actividad',
        icon: ShieldCheck,
      },
      {
        key: 'settings',
        label: 'Configuración Empresa',
        subtitle: 'Datos fiscales, logotipo corporativo, series, tipos impositivos y gestoría',
        icon: Settings,
      },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

const WorkspaceShell: React.FC = () => {
  const { profile, connectionOk } = useAuth();
  const { companySettings } = useErpData();
  const [activeModule, setActiveModule] = useState<ModuleKey>('dashboard');
  const [pendingAction, setPendingAction] = useState<string | undefined>(undefined);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentMeta =
    ALL_NAV_ITEMS.find((item) => item.key === activeModule) || ALL_NAV_ITEMS[0];

  const handleNavigate = (mod: ModuleKey, action?: string) => {
    setActiveModule(mod);
    setPendingAction(action);
    setMobileMenuOpen(false);
  };

  const clearAction = () => setPendingAction(undefined);

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return <DashboardModule onNavigate={handleNavigate} />;
      case 'clients':
        return <ClientsModule initialAction={pendingAction} onClearAction={clearAction} />;
      case 'projects':
        return <ProjectsModule initialAction={pendingAction} onClearAction={clearAction} />;
      case 'quotes':
        return <QuotesModule initialAction={pendingAction} onClearAction={clearAction} />;
      case 'invoices':
        return <InvoicesModule initialAction={pendingAction} onClearAction={clearAction} />;
      case 'expenses':
        return (
          <ExpensesAccountingModule initialAction={pendingAction} onClearAction={clearAction} />
        );
      case 'hacienda':
        return <HaciendaGestoriaModule />;
      case 'documents':
        return <DocumentsModule initialAction={pendingAction} onClearAction={clearAction} />;
      case 'calendar':
        return <CalendarModule />;
      case 'suppliers':
        return <SuppliersModule />;
      case 'reports':
        return <ReportsModule />;
      case 'ai':
        return <AiAssistantModule />;
      case 'users':
        return <UsersSecurityModule />;
      case 'settings':
        return <CompanySettingsModule />;
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#203C35] text-[#F8F8F5] select-none">
      {/* Brand Header */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-md bg-[#C6A879]/20 border border-[#C6A879]/40 flex items-center justify-center shrink-0">
            <Scale className="w-4 h-4 text-[#C6A879]" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight text-[#F8F8F5] truncate">
              {companySettings?.tradeName && companySettings.tradeName !== 'GESTIÓN360'
                ? companySettings.tradeName
                : 'Gestión Temis Atrile'}
            </div>
            <div className="text-[11px] text-[#F8F8F5]/60 truncate font-mono-tabular">
              {companySettings?.taxId || 'ERP Corporativo'}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1 text-[#F8F8F5]/70 hover:text-white"
          aria-label="Cerrar menú"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="space-y-1">
            <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-[#C6A879]/85">
              {group.title}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeModule === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleNavigate(item.key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left ${
                    isActive
                      ? 'bg-[#315348] text-[#F8F8F5] border-r-2 border-[#C6A879]'
                      : 'text-[#F8F8F5]/75 hover:bg-white/5 hover:text-[#F8F8F5]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-[#C6A879]' : 'text-[#F8F8F5]/60'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User Footer */}
      <div className="p-3 border-t border-white/10 shrink-0">
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#F8F8F5] truncate">{profile?.displayName}</p>
            <p className="text-[11px] text-[#C6A879] truncate">{profile?.role}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F8F5] text-[#252B28] flex">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 fixed inset-y-0 left-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#252B28]/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 max-w-[85vw] h-full z-10">{sidebarContent}</div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-[#ECEEEB] px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-[#203C35] hover:bg-[#F8F8F5] rounded-md"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-[#203C35] truncate">
                {currentMeta.label}
              </h1>
              <p className="text-xs text-[#252B28]/65 truncate hidden sm:block">
                {currentMeta.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0 text-xs">
            <div className="hidden md:block text-right">
              <div className="font-medium text-[#203C35] font-mono-tabular">
                Ejercicio {companySettings?.currentFiscalYear || new Date().getFullYear()}
              </div>
              <div className="text-[11px] text-[#252B28]/60">
                {companySettings?.legalName && companySettings.legalName !== 'Mi Empresa S.L.'
                  ? companySettings.legalName
                  : 'TEMIS ATRILE E.S.P.J.'}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto space-y-4">
          {!connectionOk && (
            <div className="p-3 bg-white border border-amber-300 rounded-md text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                No se pudo confirmar la conectividad inicial con Firestore. Verifica tu conexión a internet para sincronizar los cambios.
              </span>
            </div>
          )}
          {renderModule()}
        </main>
      </div>

      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ErpDataProvider>
          <WorkspaceShell />
        </ErpDataProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
