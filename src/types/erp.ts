export type UserRole =
  | 'Administrador'
  | 'Administración'
  | 'Comercial'
  | 'Técnico'
  | 'Consulta';

export type ModuleKey =
  | 'dashboard'
  | 'clients'
  | 'projects'
  | 'quotes'
  | 'invoices'
  | 'expenses'
  | 'hacienda'
  | 'documents'
  | 'calendar'
  | 'suppliers'
  | 'reports'
  | 'ai'
  | 'users'
  | 'settings';

export type ClientType = 'Empresa' | 'Autónomo' | 'Organismo Público' | 'Particular';
export type ClientStatus = 'activo' | 'inactivo' | 'potencial';

export type ProjectStatus =
  | 'Pendiente'
  | 'En proceso'
  | 'Esperando al cliente'
  | 'En revisión'
  | 'Finalizado'
  | 'Facturado';

export type QuoteStatus = 'borrador' | 'enviado' | 'aceptado' | 'rechazado' | 'caducado';

export type InvoiceStatus =
  | 'Borrador'
  | 'Emitida'
  | 'Pendiente de cobro'
  | 'Parcialmente cobrada'
  | 'Cobrada'
  | 'Vencida'
  | 'Rectificada';

export type ExpenseCategory =
  | 'Alquiler'
  | 'Suministros'
  | 'Software y suscripciones'
  | 'Publicidad'
  | 'Material'
  | 'Transporte'
  | 'Telecomunicaciones'
  | 'Servicios profesionales'
  | 'Seguros'
  | 'Nóminas'
  | 'Otros';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Alquiler',
  'Suministros',
  'Software y suscripciones',
  'Publicidad',
  'Material',
  'Transporte',
  'Telecomunicaciones',
  'Servicios profesionales',
  'Seguros',
  'Nóminas',
  'Otros',
];

export type FiscalStatus =
  | 'Pendiente de preparar'
  | 'Preparando'
  | 'Documentación incompleta'
  | 'Listo para gestor'
  | 'Enviado al gestor'
  | 'Revisado'
  | 'Presentado'
  | 'Justificante archivado';

export const FISCAL_STATUSES: FiscalStatus[] = [
  'Pendiente de preparar',
  'Preparando',
  'Documentación incompleta',
  'Listo para gestor',
  'Enviado al gestor',
  'Revisado',
  'Presentado',
  'Justificante archivado',
];

export type DocumentFolder =
  | 'Empresa'
  | 'Clientes'
  | 'Proveedores'
  | 'Bancos'
  | 'Personal'
  | 'Hacienda'
  | 'Gestoría'
  | 'Seguros'
  | 'Contratos'
  | 'Otros';

export const DOCUMENT_FOLDERS: DocumentFolder[] = [
  'Empresa',
  'Clientes',
  'Proveedores',
  'Bancos',
  'Personal',
  'Hacienda',
  'Gestoría',
  'Seguros',
  'Contratos',
  'Otros',
];

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
}

export interface UserPublic {
  id: string;
  uid: string;
  displayName: string;
  role: UserRole;
  department?: string;
  active: boolean;
  orgId: string;
}

export interface UserProfile extends UserPublic {
  email: string;
  phone?: string;
}

export interface UserInvite {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  department?: string;
  active: boolean;
  invitedBy: string;
  orgId: string;
}

export interface CompanySettings {
  id: string;
  orgId: string;
  tradeName: string;
  legalName: string;
  taxId: string;
  fiscalAddress?: string;
  postalCode?: string;
  city?: string;
  province?: string;
  phone?: string;
  email?: string;
  iban?: string;
  bankName?: string;
  logoDataUrl?: string;
  invoiceSeries?: string[];
  vatRates?: number[];
  retentionRates?: number[];
  currentFiscalYear: number;
  gestorName?: string;
  gestorFirm?: string;
  gestorEmail?: string;
  gestorPhone?: string;
  notifyDaysBeforeDue?: number;
  notifyFiscalDaysBefore?: number;
}

export interface Client {
  id: string;
  orgId: string;
  name: string;
  taxId: string;
  fiscalAddress?: string;
  postalCode?: string;
  city?: string;
  province?: string;
  phone?: string;
  email?: string;
  contactPerson?: string;
  signupDate?: string;
  clientType: ClientType;
  status: ClientStatus;
  notes?: string;
  archived: boolean;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Communication {
  id: string;
  orgId: string;
  clientId: string;
  channel: 'Email' | 'Teléfono' | 'Reunión' | 'Videollamada' | 'Presencial';
  subject: string;
  summary?: string;
  date: string;
  authorUid: string;
  authorName: string;
  createdAt?: unknown;
}

export interface Project {
  id: string;
  orgId: string;
  name: string;
  clientId: string;
  clientName: string;
  description?: string;
  service?: string;
  startDate?: string;
  estimatedEndDate?: string;
  actualEndDate?: string;
  responsibleUid?: string;
  responsibleName?: string;
  hoursSpent: number;
  internalCost: number;
  budgetedPrice: number;
  invoicedAmount: number;
  status: ProjectStatus;
  quoteId?: string;
  invoiceId?: string;
  notes?: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Task {
  id: string;
  orgId: string;
  title: string;
  description?: string;
  dueDate: string;
  priority: 'Baja' | 'Media' | 'Alta' | 'Urgente';
  responsibleUid?: string;
  responsibleName?: string;
  clientId?: string;
  clientName?: string;
  projectId?: string;
  category: 'Tarea' | 'Reunión' | 'Entrega' | 'Seguimiento' | 'Cobro' | 'Fiscal';
  status: 'Pendiente' | 'En curso' | 'Completada';
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProjectComment {
  id: string;
  orgId: string;
  projectId: string;
  authorUid: string;
  authorName: string;
  text: string;
  hoursLogged: number;
  createdAt?: unknown;
}

export interface Quote {
  id: string;
  orgId: string;
  number: string;
  series: string;
  clientId: string;
  clientName: string;
  clientTaxId?: string;
  issueDate: string;
  validUntil: string;
  status: QuoteStatus;
  lines: LineItem[];
  taxBase: number;
  vatAmount: number;
  retentionRate?: number;
  retentionAmount: number;
  total: number;
  notes?: string;
  convertedProjectId?: string;
  convertedInvoiceId?: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Invoice {
  id: string;
  orgId: string;
  number: string;
  series: string;
  sequenceNumber: number;
  issueDate: string;
  dueDate: string;
  clientId: string;
  clientName: string;
  clientTaxId: string;
  clientAddress?: string;
  lines: LineItem[];
  taxBase: number;
  vatAmount: number;
  retentionRate?: number;
  retentionAmount: number;
  total: number;
  paidAmount: number;
  status: InvoiceStatus;
  locked: boolean;
  rectifiesInvoiceId?: string;
  rectificationReason?: string;
  verifactuHash?: string;
  verifactuPrevHash?: string;
  projectId?: string;
  quoteId?: string;
  notes?: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface InvoicePayment {
  id: string;
  orgId: string;
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  amount: number;
  paymentDate: string;
  method: 'Transferencia' | 'Domiciliación' | 'Tarjeta' | 'Efectivo' | 'Otro';
  reference?: string;
  notes?: string;
  createdBy: string;
  createdAt?: unknown;
}

export interface Supplier {
  id: string;
  orgId: string;
  name: string;
  taxId: string;
  address?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  category: string;
  paymentTerms?: string;
  notes?: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Expense {
  id: string;
  orgId: string;
  supplierId?: string;
  supplierName: string;
  supplierTaxId?: string;
  invoiceNumber?: string;
  date: string;
  concept: string;
  taxBase: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  category: ExpenseCategory;
  paymentDate?: string;
  status: 'Pendiente' | 'Pagado';
  clientId?: string;
  projectId?: string;
  documentId?: string;
  notes?: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FiscalObligation {
  id: string;
  orgId: string;
  modelCode: string;
  modelName: string;
  applicable: boolean;
  fiscalYear: number;
  period: string;
  dueDate: string;
  requiredDocs?: string;
  status: FiscalStatus;
  responsibleName?: string;
  submissionDate?: string;
  receiptDocumentId?: string;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GestoriaPackage {
  id: string;
  orgId: string;
  fiscalYear: number;
  quarter: '1T' | '2T' | '3T' | '4T';
  status: 'Preparado para revisión' | 'Enviado al gestor' | 'Recibido por gestor';
  sentDate?: string;
  recipientName?: string;
  recipientEmail?: string;
  observations?: string;
  issuedBase: number;
  issuedVat: number;
  receivedBase: number;
  receivedVat: number;
  issuedCount: number;
  expensesCount: number;
  missingDocsCount: number;
  incidences?: string[];
  receiptDocumentId?: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DocumentRecord {
  id: string;
  orgId: string;
  name: string;
  folder: DocumentFolder;
  uploadDate: string;
  clientId?: string;
  clientName?: string;
  supplierId?: string;
  projectId?: string;
  invoiceId?: string;
  expenseId?: string;
  docType: string;
  description?: string;
  mimeType: string;
  fileSize: number;
  chunkCount: number;
  tags?: string[];
  uploadedByUid: string;
  uploadedByName: string;
  createdAt?: unknown;
}

export interface ActivityLog {
  id: string;
  orgId: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  action: string;
  module: string;
  entityId?: string;
  entityLabel?: string;
  details?: string;
  createdAt?: unknown;
}

export const ROLE_PERMISSIONS: Record<
  UserRole,
  {
    canWriteClients: boolean;
    canWriteProjects: boolean;
    canWriteQuotes: boolean;
    canWriteInvoices: boolean;
    canWriteExpenses: boolean;
    canWriteFiscal: boolean;
    canWriteDocuments: boolean;
    canDeleteNonFinancial: boolean;
    canManageUsers: boolean;
    canEditSettings: boolean;
    canUseAi: boolean;
  }
> = {
  Administrador: {
    canWriteClients: true,
    canWriteProjects: true,
    canWriteQuotes: true,
    canWriteInvoices: true,
    canWriteExpenses: true,
    canWriteFiscal: true,
    canWriteDocuments: true,
    canDeleteNonFinancial: true,
    canManageUsers: true,
    canEditSettings: true,
    canUseAi: true,
  },
  Administración: {
    canWriteClients: true,
    canWriteProjects: true,
    canWriteQuotes: true,
    canWriteInvoices: true,
    canWriteExpenses: true,
    canWriteFiscal: true,
    canWriteDocuments: true,
    canDeleteNonFinancial: false,
    canManageUsers: false,
    canEditSettings: false,
    canUseAi: true,
  },
  Comercial: {
    canWriteClients: true,
    canWriteProjects: true,
    canWriteQuotes: true,
    canWriteInvoices: false,
    canWriteExpenses: false,
    canWriteFiscal: false,
    canWriteDocuments: true,
    canDeleteNonFinancial: false,
    canManageUsers: false,
    canEditSettings: false,
    canUseAi: true,
  },
  Técnico: {
    canWriteClients: false,
    canWriteProjects: true,
    canWriteQuotes: false,
    canWriteInvoices: false,
    canWriteExpenses: false,
    canWriteFiscal: false,
    canWriteDocuments: true,
    canDeleteNonFinancial: false,
    canManageUsers: false,
    canEditSettings: false,
    canUseAi: true,
  },
  Consulta: {
    canWriteClients: false,
    canWriteProjects: false,
    canWriteQuotes: false,
    canWriteInvoices: false,
    canWriteExpenses: false,
    canWriteFiscal: false,
    canWriteDocuments: false,
    canDeleteNonFinancial: false,
    canManageUsers: false,
    canEditSettings: false,
    canUseAi: true,
  },
};
