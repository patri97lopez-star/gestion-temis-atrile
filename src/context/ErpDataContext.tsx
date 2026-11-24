import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, ORG_ID } from '../lib/firebase';
import {
  addDaysIso,
  computeVerifactuHash,
  createEntityId,
  emailToInviteId,
  normalizeTaxId,
  todayIso,
} from '../lib/formatters';
import { useAuth } from './AuthContext';
import type {
  ActivityLog,
  Client,
  Communication,
  CompanySettings,
  DocumentRecord,
  Expense,
  FiscalObligation,
  GestoriaPackage,
  Invoice,
  InvoicePayment,
  Project,
  ProjectComment,
  Quote,
  Supplier,
  Task,
  UserInvite,
  UserPublic,
  UserRole,
} from '../types/erp';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface ErpDataContextValue {
  loadingData: boolean;
  companySettings: CompanySettings | null;
  usersPublic: UserPublic[];
  userInvites: UserInvite[];
  clients: Client[];
  communications: Communication[];
  projects: Project[];
  tasks: Task[];
  projectComments: ProjectComment[];
  quotes: Quote[];
  invoices: Invoice[];
  invoicePayments: InvoicePayment[];
  suppliers: Supplier[];
  expenses: Expense[];
  fiscalObligations: FiscalObligation[];
  gestoriaPackages: GestoriaPackage[];
  documents: DocumentRecord[];
  activityLogs: ActivityLog[];
  toasts: ToastMessage[];
  notify: (type: ToastMessage['type'], text: string) => void;
  dismissToast: (id: string) => void;

  // Operations
  saveCompanySettings: (data: Omit<CompanySettings, 'id' | 'orgId'>) => Promise<void>;
  saveClient: (data: Omit<Client, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<string>;
  archiveOrDeleteClient: (client: Client, mode: 'archive' | 'delete') => Promise<void>;
  addCommunication: (data: Omit<Communication, 'id' | 'orgId' | 'authorUid' | 'authorName' | 'createdAt'>) => Promise<void>;
  saveProject: (data: Omit<Project, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<string>;
  deleteProject: (projectId: string, name: string) => Promise<void>;
  addProjectComment: (projectId: string, text: string, hoursLogged: number) => Promise<void>;
  saveTask: (data: Omit<Task, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<string>;
  deleteTask: (taskId: string) => Promise<void>;
  saveQuote: (data: Omit<Quote, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<string>;
  deleteQuote: (quoteId: string) => Promise<void>;
  convertQuoteToProject: (quote: Quote) => Promise<string>;
  convertQuoteToInvoice: (quote: Quote) => Promise<string>;
  saveInvoice: (
    data: Omit<Invoice, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt' | 'verifactuHash' | 'verifactuPrevHash'>,
    existingId?: string,
    issueImmediately?: boolean
  ) => Promise<string>;
  deleteDraftInvoice: (invoice: Invoice) => Promise<void>;
  registerInvoicePayment: (params: {
    invoice: Invoice;
    amount: number;
    paymentDate: string;
    method: InvoicePayment['method'];
    reference?: string;
    notes?: string;
  }) => Promise<void>;
  createRectifyingInvoice: (original: Invoice, reason: string) => Promise<string>;
  saveSupplier: (data: Omit<Supplier, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<string>;
  deleteSupplier: (supplierId: string, name: string) => Promise<void>;
  saveExpense: (data: Omit<Expense, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<string>;
  deleteExpense: (expenseId: string) => Promise<void>;
  saveFiscalObligation: (data: Omit<FiscalObligation, 'id' | 'orgId' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<string>;
  initializeDefaultFiscalYear: (year: number) => Promise<void>;
  saveGestoriaPackage: (data: Omit<GestoriaPackage, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<string>;
  inviteUser: (params: { email: string; displayName: string; role: UserRole; department?: string }) => Promise<void>;
  updateStaffRoleAndStatus: (user: UserPublic, role: UserRole, active: boolean) => Promise<void>;
  logActivity: (action: string, module: string, entityId?: string, entityLabel?: string, details?: string) => Promise<void>;
  loadDemoSandbox: () => Promise<void>;
  clearDemoSandbox: () => Promise<void>;
}

const ErpDataContext = createContext<ErpDataContextValue | null>(null);

export const ErpDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { operatorUid, profile, authReady } = useAuth();
  const [loadingData, setLoadingData] = useState(true);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [usersPublic, setUsersPublic] = useState<UserPublic[]>([]);
  const [userInvites, setUserInvites] = useState<UserInvite[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectComments, setProjectComments] = useState<ProjectComment[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicePayments, setInvoicePayments] = useState<InvoicePayment[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [fiscalObligations, setFiscalObligations] = useState<FiscalObligation[]>([]);
  const [gestoriaPackages, setGestoriaPackages] = useState<GestoriaPackage[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((type: ToastMessage['type'], text: string) => {
    const id = createEntityId('toast');
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const logActivity = useCallback(
    async (
      action: string,
      module: string,
      entityId?: string,
      entityLabel?: string,
      details?: string
    ) => {
      if (!profile) return;
      const logId = createEntityId('log');
      try {
        await setDoc(doc(db, 'activityLogs', logId), {
          orgId: ORG_ID,
          actorUid: operatorUid,
          actorName: profile.displayName.slice(0, 120),
          actorRole: profile.role,
          action: action.slice(0, 120),
          module: module.slice(0, 60),
          ...(entityId ? { entityId: entityId.slice(0, 128) } : {}),
          ...(entityLabel ? { entityLabel: entityLabel.slice(0, 200) } : {}),
          ...(details ? { details: details.slice(0, 1000) } : {}),
          createdAt: serverTimestamp(),
        });
      } catch {
        // Non-blocking audit log failure should not crash user flow
      }
    },
    [operatorUid, profile]
  );

  // Subscribe to Firestore collections immediately when workspace profile is active
  useEffect(() => {
    if (!authReady || !profile?.active) {
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    const unsubs: (() => void)[] = [];

    const listen = <T extends { id: string }>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      onFirstLoad?: () => void
    ) => {
      const q = query(collection(db, colName), where('orgId', '==', ORG_ID));
      let loadedOnce = false;
      const unsub = onSnapshot(
        q,
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<T, 'id'>) })) as T[];
          setter(items);
          if (!loadedOnce) {
            loadedOnce = true;
            onFirstLoad?.();
          }
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, colName);
        }
      );
      unsubs.push(unsub);
    };

    listen<CompanySettings>('companySettings', (itemsOrFn) => {
      const list = typeof itemsOrFn === 'function' ? itemsOrFn([]) : itemsOrFn;
      setCompanySettings(list.find((c) => c.id === 'main') || list[0] || null);
    });
    listen<UserPublic>('usersPublic', setUsersPublic);
    listen<Client>('clients', setClients, () => setLoadingData(false));
    listen<Communication>('communications', setCommunications);
    listen<Project>('projects', setProjects);
    listen<Task>('tasks', setTasks);
    listen<ProjectComment>('projectComments', setProjectComments);
    listen<Quote>('quotes', setQuotes);
    listen<Invoice>('invoices', setInvoices);
    listen<InvoicePayment>('invoicePayments', setInvoicePayments);
    listen<Supplier>('suppliers', setSuppliers);
    listen<Expense>('expenses', setExpenses);
    listen<FiscalObligation>('fiscalObligations', setFiscalObligations);
    listen<GestoriaPackage>('gestoriaPackages', setGestoriaPackages);
    listen<DocumentRecord>('documents', setDocuments);
    listen<ActivityLog>('activityLogs', setActivityLogs);

    if (profile.role === 'Administrador') {
      listen<UserInvite>('userInvites', setUserInvites);
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, profile?.active, profile?.role]);

  // Bootstrap initial companySettings/main on empty DB,
  // and migrate legacy placeholder defaults if still unchanged
  useEffect(() => {
    if (!authReady || profile?.role !== 'Administrador') return;
    if (companySettings === null) {
      const timer = setTimeout(async () => {
        try {
          const ref = doc(db, 'companySettings', 'main');
          await setDoc(
            ref,
            {
              orgId: ORG_ID,
              tradeName: 'Gestión Temis Atrile',
              legalName: 'TEMIS ATRILE E.S.P.J.',
              taxId: 'B00000000',
              fiscalAddress: '',
              postalCode: '',
              city: '',
              province: '',
              phone: '',
              email: profile?.email || '',
              iban: '',
              bankName: '',
              invoiceSeries: ['F-2026', 'R-2026'],
              vatRates: [21, 10, 4, 0],
              retentionRates: [0, 7, 15],
              currentFiscalYear: new Date().getFullYear(),
              gestorName: '',
              gestorFirm: '',
              gestorEmail: '',
              gestorPhone: '',
              notifyDaysBeforeDue: 7,
              notifyFiscalDaysBefore: 10,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch {
          // Ignore if already created concurrently
        }
      }, 1200);
      return () => clearTimeout(timer);
    }

    const needsTradeMigration = companySettings.tradeName === 'GESTIÓN360';
    const needsLegalMigration =
      !companySettings.legalName || companySettings.legalName === 'Mi Empresa S.L.';
    if (needsTradeMigration || needsLegalMigration) {
      updateDoc(doc(db, 'companySettings', companySettings.id || 'main'), {
        ...(needsTradeMigration ? { tradeName: 'Gestión Temis Atrile' } : {}),
        ...(needsLegalMigration ? { legalName: 'TEMIS ATRILE E.S.P.J.' } : {}),
        updatedAt: serverTimestamp(),
      }).catch(() => {
        // Non-blocking
      });
    }
  }, [authReady, profile?.role, profile?.email, companySettings]);

  const saveCompanySettings = useCallback(
    async (data: Omit<CompanySettings, 'id' | 'orgId'>) => {
      try {
        await setDoc(doc(db, 'companySettings', 'main'), {
          ...data,
          orgId: ORG_ID,
          updatedAt: serverTimestamp(),
        });
        await logActivity('Actualizó configuración de empresa', 'Configuración', 'main', data.tradeName);
        notify('success', 'Configuración de empresa guardada.');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'companySettings/main');
      }
    },
    [logActivity, notify]
  );

  const saveClient = useCallback(
    async (
      data: Omit<Client, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ): Promise<string> => {
      const normalized = normalizeTaxId(data.taxId);
      const duplicate = clients.find(
        (c) => normalizeTaxId(c.taxId) === normalized && c.id !== existingId
      );
      if (duplicate) {
        throw new Error(`Ya existe un cliente registrado con el CIF/NIF ${data.taxId} (${duplicate.name}).`);
      }

      const id = existingId || createEntityId('cli');
      try {
        if (existingId) {
          await updateDoc(doc(db, 'clients', id), {
            ...data,
            taxId: data.taxId.trim().toUpperCase(),
            updatedAt: serverTimestamp(),
          });
          await logActivity('Actualizó ficha de cliente', 'Clientes', id, data.name);
          notify('success', 'Cliente actualizado correctamente.');
        } else {
          await setDoc(doc(db, 'clients', id), {
            ...data,
            taxId: data.taxId.trim().toUpperCase(),
            orgId: ORG_ID,
            createdBy: operatorUid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await logActivity('Creó nuevo cliente', 'Clientes', id, data.name);
          notify('success', 'Cliente creado correctamente.');
        }
        return id;
      } catch (err) {
        handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, `clients/${id}`);
      }
    },
    [operatorUid, clients, logActivity, notify]
  );

  const archiveOrDeleteClient = useCallback(
    async (client: Client, mode: 'archive' | 'delete') => {
      try {
        if (mode === 'archive') {
          await updateDoc(doc(db, 'clients', client.id), {
            archived: !client.archived,
            status: client.archived ? 'activo' : 'inactivo',
            updatedAt: serverTimestamp(),
          });
          await logActivity(
            client.archived ? 'Reactivó cliente archivado' : 'Archivó cliente',
            'Clientes',
            client.id,
            client.name
          );
          notify('success', client.archived ? 'Cliente restaurado.' : 'Cliente archivado.');
        } else {
          const hasInvoices = invoices.some((i) => i.clientId === client.id);
          if (hasInvoices) {
            throw new Error(
              'No se puede eliminar un cliente con facturas asociadas por trazabilidad fiscal. Archívalo en su lugar.'
            );
          }
          await deleteDoc(doc(db, 'clients', client.id));
          await logActivity('Eliminó cliente', 'Clientes', client.id, client.name);
          notify('success', 'Cliente eliminado definitivamente.');
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('No se puede eliminar')) {
          notify('error', err.message);
          throw err;
        }
        handleFirestoreError(err, OperationType.DELETE, `clients/${client.id}`);
      }
    },
    [invoices, logActivity, notify]
  );

  const addCommunication = useCallback(
    async (data: Omit<Communication, 'id' | 'orgId' | 'authorUid' | 'authorName' | 'createdAt'>) => {
      const id = createEntityId('comm');
      try {
        await setDoc(doc(db, 'communications', id), {
          ...data,
          orgId: ORG_ID,
          authorUid: operatorUid,
          authorName: profile?.displayName || 'Dirección · Temis Atrile',
          createdAt: serverTimestamp(),
        });
        await logActivity('Registró comunicación con cliente', 'Clientes', data.clientId, data.subject);
        notify('success', 'Comunicación registrada.');
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `communications/${id}`);
      }
    },
    [operatorUid, profile?.displayName, logActivity, notify]
  );

  const saveProject = useCallback(
    async (
      data: Omit<Project, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ): Promise<string> => {
      const id = existingId || createEntityId('prj');
      try {
        if (existingId) {
          await updateDoc(doc(db, 'projects', id), {
            ...data,
            updatedAt: serverTimestamp(),
          });
          await logActivity('Actualizó trabajo/proyecto', 'Trabajos', id, data.name);
          notify('success', 'Trabajo actualizado.');
        } else {
          await setDoc(doc(db, 'projects', id), {
            ...data,
            orgId: ORG_ID,
            createdBy: operatorUid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await logActivity('Creó trabajo/proyecto', 'Trabajos', id, data.name);
          notify('success', 'Trabajo creado correctamente.');
        }
        return id;
      } catch (err) {
        handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, `projects/${id}`);
      }
    },
    [operatorUid, logActivity, notify]
  );

  const deleteProject = useCallback(
    async (projectId: string, name: string) => {
      try {
        await deleteDoc(doc(db, 'projects', projectId));
        await logActivity('Eliminó trabajo', 'Trabajos', projectId, name);
        notify('success', 'Trabajo eliminado.');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `projects/${projectId}`);
      }
    },
    [logActivity, notify]
  );

  const addProjectComment = useCallback(
    async (projectId: string, text: string, hoursLogged: number) => {
      const id = createEntityId('pcom');
      try {
        await setDoc(doc(db, 'projectComments', id), {
          orgId: ORG_ID,
          projectId,
          authorUid: operatorUid,
          authorName: profile?.displayName || 'Dirección · Temis Atrile',
          text: text.trim().slice(0, 2000),
          hoursLogged: Math.max(0, Number(hoursLogged) || 0),
          createdAt: serverTimestamp(),
        });
        const target = projects.find((p) => p.id === projectId);
        if (target && hoursLogged > 0) {
          await updateDoc(doc(db, 'projects', projectId), {
            hoursSpent: Number((target.hoursSpent + hoursLogged).toFixed(2)),
            updatedAt: serverTimestamp(),
          });
        }
        await logActivity('Añadió seguimiento en trabajo', 'Trabajos', projectId, target?.name);
        notify('success', 'Seguimiento guardado.');
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `projectComments/${id}`);
      }
    },
    [operatorUid, profile?.displayName, projects, logActivity, notify]
  );

  const saveTask = useCallback(
    async (
      data: Omit<Task, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ): Promise<string> => {
      const id = existingId || createEntityId('tsk');
      try {
        if (existingId) {
          await updateDoc(doc(db, 'tasks', id), {
            ...data,
            updatedAt: serverTimestamp(),
          });
          notify('success', 'Tarea actualizada.');
        } else {
          await setDoc(doc(db, 'tasks', id), {
            ...data,
            orgId: ORG_ID,
            createdBy: operatorUid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await logActivity('Creó tarea / recordatorio', 'Calendario', id, data.title);
          notify('success', 'Tarea creada.');
        }
        return id;
      } catch (err) {
        handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, `tasks/${id}`);
      }
    },
    [operatorUid, logActivity, notify]
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      try {
        await deleteDoc(doc(db, 'tasks', taskId));
        notify('success', 'Tarea eliminada.');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `tasks/${taskId}`);
      }
    },
    [notify]
  );

  const saveQuote = useCallback(
    async (
      data: Omit<Quote, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ): Promise<string> => {
      const id = existingId || createEntityId('quo');
      try {
        if (existingId) {
          await updateDoc(doc(db, 'quotes', id), {
            ...data,
            updatedAt: serverTimestamp(),
          });
          await logActivity('Actualizó presupuesto', 'Presupuestos', id, data.number);
          notify('success', 'Presupuesto actualizado.');
        } else {
          await setDoc(doc(db, 'quotes', id), {
            ...data,
            orgId: ORG_ID,
            createdBy: operatorUid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await logActivity('Creó presupuesto', 'Presupuestos', id, data.number);
          notify('success', 'Presupuesto creado.');
        }
        return id;
      } catch (err) {
        handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, `quotes/${id}`);
      }
    },
    [operatorUid, logActivity, notify]
  );

  const deleteQuote = useCallback(
    async (quoteId: string) => {
      try {
        await deleteDoc(doc(db, 'quotes', quoteId));
        notify('success', 'Borrador de presupuesto eliminado.');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `quotes/${quoteId}`);
      }
    },
    [notify]
  );

  const convertQuoteToProject = useCallback(
    async (quote: Quote): Promise<string> => {
      const projectId = createEntityId('prj');
      try {
        await setDoc(doc(db, 'projects', projectId), {
          orgId: ORG_ID,
          name: `Proyecto ${quote.number} · ${quote.clientName}`.slice(0, 180),
          clientId: quote.clientId,
          clientName: quote.clientName,
          description: quote.lines.map((l) => `${l.description} (x${l.quantity})`).join('\n').slice(0, 3900),
          service: quote.lines[0]?.description?.slice(0, 120) || 'Servicio presupuestado',
          startDate: todayIso(),
          estimatedEndDate: addDaysIso(todayIso(), 30),
          responsibleUid: operatorUid,
          responsibleName: profile?.displayName || 'Dirección · Temis Atrile',
          hoursSpent: 0,
          internalCost: 0,
          budgetedPrice: quote.taxBase,
          invoicedAmount: 0,
          status: 'Pendiente',
          quoteId: quote.id,
          notes: quote.notes || '',
          createdBy: operatorUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'quotes', quote.id), {
          convertedProjectId: projectId,
          updatedAt: serverTimestamp(),
        });
        await logActivity('Convirtió presupuesto en trabajo', 'Presupuestos', projectId, quote.number);
        notify('success', 'Presupuesto convertido en trabajo correctamente.');
        return projectId;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `quotes/${quote.id}`);
      }
    },
    [operatorUid, profile?.displayName, logActivity, notify]
  );

  const getNextSeriesNumber = useCallback(
    (series: string) => {
      const sameSeries = invoices.filter((i) => i.series === series && i.locked);
      const maxSeq = sameSeries.reduce((max, i) => Math.max(max, i.sequenceNumber || 0), 0);
      const nextSeq = maxSeq + 1;
      return {
        sequenceNumber: nextSeq,
        number: `${series}-${String(nextSeq).padStart(4, '0')}`,
      };
    },
    [invoices]
  );

  const saveInvoice = useCallback(
    async (
      data: Omit<Invoice, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt' | 'verifactuHash' | 'verifactuPrevHash'>,
      existingId?: string,
      issueImmediately = false
    ): Promise<string> => {
      const id = existingId || createEntityId('inv');

      let finalPayload: Record<string, unknown> = {
        ...data,
        orgId: ORG_ID,
      };

      if (issueImmediately) {
        const { sequenceNumber, number } = getNextSeriesNumber(data.series);
        const seriesInvoices = invoices
          .filter((i) => i.series === data.series && i.locked && i.verifactuHash)
          .sort((a, b) => b.sequenceNumber - a.sequenceNumber);
        const prevHash = seriesInvoices[0]?.verifactuHash || 'GENESIS';
        const hash = await computeVerifactuHash({
          issuerTaxId: companySettings?.taxId || 'B00000000',
          invoiceNumber: number,
          issueDate: data.issueDate,
          total: data.total,
          prevHash,
        });
        finalPayload = {
          ...finalPayload,
          number,
          sequenceNumber,
          locked: true,
          status: data.status === 'Borrador' ? 'Pendiente de cobro' : data.status,
          verifactuPrevHash: prevHash,
          verifactuHash: hash,
        };
      }

      try {
        if (existingId) {
          await updateDoc(doc(db, 'invoices', id), {
            ...finalPayload,
            updatedAt: serverTimestamp(),
          });
          await logActivity(
            issueImmediately ? 'Emitió factura definitiva' : 'Actualizó borrador de factura',
            'Facturación',
            id,
            String(finalPayload.number)
          );
          notify('success', issueImmediately ? 'Factura emitida y bloqueada.' : 'Borrador actualizado.');
        } else {
          await setDoc(doc(db, 'invoices', id), {
            ...finalPayload,
            createdBy: operatorUid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await logActivity(
            issueImmediately ? 'Emitió nueva factura' : 'Creó borrador de factura',
            'Facturación',
            id,
            String(finalPayload.number)
          );
          notify('success', issueImmediately ? 'Factura emitida correctamente.' : 'Borrador guardado.');
        }

        if (issueImmediately && data.projectId) {
          const proj = projects.find((p) => p.id === data.projectId);
          if (proj) {
            await updateDoc(doc(db, 'projects', proj.id), {
              invoicedAmount: Number((proj.invoicedAmount + data.taxBase).toFixed(2)),
              invoiceId: id,
              status: 'Facturado',
              updatedAt: serverTimestamp(),
            });
          }
        }
        return id;
      } catch (err) {
        handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, `invoices/${id}`);
      }
    },
    [operatorUid, getNextSeriesNumber, invoices, companySettings?.taxId, projects, logActivity, notify]
  );

  const convertQuoteToInvoice = useCallback(
    async (quote: Quote): Promise<string> => {
      const client = clients.find((c) => c.id === quote.clientId);
      const defaultSeries = companySettings?.invoiceSeries?.[0] || `F-${new Date().getFullYear()}`;
      const issueDate = todayIso();
      const dueDate = addDaysIso(issueDate, 30);

      const invId = await saveInvoice(
        {
          number: `BORR-${quote.number}`,
          series: defaultSeries,
          sequenceNumber: 0,
          issueDate,
          dueDate,
          clientId: quote.clientId,
          clientName: quote.clientName,
          clientTaxId: quote.clientTaxId || client?.taxId || '',
          clientAddress: [client?.fiscalAddress, client?.postalCode, client?.city]
            .filter(Boolean)
            .join(', '),
          lines: quote.lines,
          taxBase: quote.taxBase,
          vatAmount: quote.vatAmount,
          retentionRate: quote.retentionRate || 0,
          retentionAmount: quote.retentionAmount,
          total: quote.total,
          paidAmount: 0,
          status: 'Borrador',
          locked: false,
          quoteId: quote.id,
          ...(quote.convertedProjectId ? { projectId: quote.convertedProjectId } : {}),
          notes: quote.notes || `Generada desde presupuesto ${quote.number}`,
        },
        undefined,
        false
      );

      try {
        await updateDoc(doc(db, 'quotes', quote.id), {
          convertedInvoiceId: invId,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Non-blocking
      }
      return invId;
    },
    [clients, companySettings?.invoiceSeries, saveInvoice]
  );

  const deleteDraftInvoice = useCallback(
    async (invoice: Invoice) => {
      if (invoice.locked) {
        notify('error', 'Las facturas definitivas no pueden eliminarse. Emite una factura rectificativa.');
        return;
      }
      try {
        await deleteDoc(doc(db, 'invoices', invoice.id));
        await logActivity('Eliminó borrador de factura', 'Facturación', invoice.id, invoice.number);
        notify('success', 'Borrador eliminado.');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `invoices/${invoice.id}`);
      }
    },
    [logActivity, notify]
  );

  const registerInvoicePayment = useCallback(
    async (params: {
      invoice: Invoice;
      amount: number;
      paymentDate: string;
      method: InvoicePayment['method'];
      reference?: string;
      notes?: string;
    }) => {
      const { invoice, amount, paymentDate, method, reference, notes } = params;
      const paymentId = createEntityId('pay');
      const newPaid = Math.min(invoice.total, Number((invoice.paidAmount + amount).toFixed(2)));
      const newStatus: Invoice['status'] =
        newPaid >= invoice.total - 0.01 ? 'Cobrada' : 'Parcialmente cobrada';

      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'invoicePayments', paymentId), {
          orgId: ORG_ID,
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          clientId: invoice.clientId,
          amount,
          paymentDate,
          method,
          ...(reference ? { reference: reference.slice(0, 120) } : {}),
          ...(notes ? { notes: notes.slice(0, 500) } : {}),
          createdBy: operatorUid,
          createdAt: serverTimestamp(),
        });
        batch.update(doc(db, 'invoices', invoice.id), {
          paidAmount: newPaid,
          status: newStatus,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        await logActivity(
          'Registró cobro de factura',
          'Facturación',
          invoice.id,
          invoice.number,
          `Importe: ${amount.toFixed(2)} € (${method})`
        );
        notify('success', 'Cobro registrado correctamente.');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `invoices/${invoice.id}`);
      }
    },
    [operatorUid, logActivity, notify]
  );

  const createRectifyingInvoice = useCallback(
    async (original: Invoice, reason: string): Promise<string> => {
      const rectSeries = `R-${new Date().getFullYear()}`;
      const { sequenceNumber, number } = getNextSeriesNumber(rectSeries);
      const prevSeriesInvoices = invoices
        .filter((i) => i.series === rectSeries && i.locked && i.verifactuHash)
        .sort((a, b) => b.sequenceNumber - a.sequenceNumber);
      const prevHash = prevSeriesInvoices[0]?.verifactuHash || 'GENESIS';

      const negLines = original.lines.map((l) => ({
        ...l,
        unitPrice: -Math.abs(l.unitPrice),
      }));
      const negTotal = -Math.abs(original.total);
      const hash = await computeVerifactuHash({
        issuerTaxId: companySettings?.taxId || 'B00000000',
        invoiceNumber: number,
        issueDate: todayIso(),
        total: negTotal,
        prevHash,
      });

      const rectId = createEntityId('inv');
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'invoices', rectId), {
          orgId: ORG_ID,
          number,
          series: rectSeries,
          sequenceNumber,
          issueDate: todayIso(),
          dueDate: todayIso(),
          clientId: original.clientId,
          clientName: original.clientName,
          clientTaxId: original.clientTaxId,
          clientAddress: original.clientAddress || '',
          lines: negLines,
          taxBase: -Math.abs(original.taxBase),
          vatAmount: -Math.abs(original.vatAmount),
          retentionRate: original.retentionRate || 0,
          retentionAmount: -Math.abs(original.retentionAmount),
          total: negTotal,
          paidAmount: 0,
          status: 'Emitida',
          locked: true,
          rectifiesInvoiceId: original.id,
          rectificationReason: reason.slice(0, 500),
          verifactuPrevHash: prevHash,
          verifactuHash: hash,
          notes: `Rectifica factura ${original.number}: ${reason}`,
          createdBy: operatorUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'invoices', original.id), {
          status: 'Rectificada',
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        await logActivity('Emitió factura rectificativa', 'Facturación', rectId, number, reason);
        notify('success', `Factura rectificativa ${number} emitida.`);
        return rectId;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `invoices/${rectId}`);
      }
    },
    [operatorUid, getNextSeriesNumber, invoices, companySettings?.taxId, logActivity, notify]
  );

  const saveSupplier = useCallback(
    async (
      data: Omit<Supplier, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ): Promise<string> => {
      const id = existingId || createEntityId('sup');
      try {
        if (existingId) {
          await updateDoc(doc(db, 'suppliers', id), {
            ...data,
            updatedAt: serverTimestamp(),
          });
          notify('success', 'Proveedor actualizado.');
        } else {
          await setDoc(doc(db, 'suppliers', id), {
            ...data,
            orgId: ORG_ID,
            createdBy: operatorUid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await logActivity('Creó proveedor', 'Proveedores', id, data.name);
          notify('success', 'Proveedor creado.');
        }
        return id;
      } catch (err) {
        handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, `suppliers/${id}`);
      }
    },
    [operatorUid, logActivity, notify]
  );

  const deleteSupplier = useCallback(
    async (supplierId: string, name: string) => {
      try {
        await deleteDoc(doc(db, 'suppliers', supplierId));
        await logActivity('Eliminó proveedor', 'Proveedores', supplierId, name);
        notify('success', 'Proveedor eliminado.');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `suppliers/${supplierId}`);
      }
    },
    [logActivity, notify]
  );

  const saveExpense = useCallback(
    async (
      data: Omit<Expense, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ): Promise<string> => {
      const id = existingId || createEntityId('exp');
      try {
        if (existingId) {
          await updateDoc(doc(db, 'expenses', id), {
            ...data,
            updatedAt: serverTimestamp(),
          });
          notify('success', 'Gasto / factura recibida actualizada.');
        } else {
          await setDoc(doc(db, 'expenses', id), {
            ...data,
            orgId: ORG_ID,
            createdBy: operatorUid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await logActivity('Registró gasto / factura recibida', 'Gastos', id, data.concept);
          notify('success', 'Gasto registrado correctamente.');
        }
        return id;
      } catch (err) {
        handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, `expenses/${id}`);
      }
    },
    [operatorUid, logActivity, notify]
  );

  const deleteExpense = useCallback(
    async (expenseId: string) => {
      try {
        await deleteDoc(doc(db, 'expenses', expenseId));
        notify('success', 'Gasto eliminado.');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `expenses/${expenseId}`);
      }
    },
    [notify]
  );

  const saveFiscalObligation = useCallback(
    async (
      data: Omit<FiscalObligation, 'id' | 'orgId' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ): Promise<string> => {
      const id = existingId || createEntityId('fis');
      try {
        if (existingId) {
          await updateDoc(doc(db, 'fiscalObligations', id), {
            ...data,
            updatedAt: serverTimestamp(),
          });
          await logActivity('Actualizó obligación fiscal', 'Hacienda', id, `${data.modelCode} ${data.period}`);
          notify('success', 'Obligación fiscal actualizada.');
        } else {
          await setDoc(doc(db, 'fiscalObligations', id), {
            ...data,
            orgId: ORG_ID,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await logActivity('Creó obligación fiscal', 'Hacienda', id, `${data.modelCode} ${data.period}`);
          notify('success', 'Modelo fiscal añadido.');
        }
        return id;
      } catch (err) {
        handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, `fiscalObligations/${id}`);
      }
    },
    [logActivity, notify]
  );

  const initializeDefaultFiscalYear = useCallback(
    async (year: number) => {
      const templates: Array<{
        modelCode: string;
        modelName: string;
        period: string;
        dueDate: string;
        requiredDocs: string;
        applicable: boolean;
      }> = [
        { modelCode: 'Modelo 303', modelName: 'Autoliquidación IVA Trimestral', period: '1T', dueDate: `${year}-04-20`, requiredDocs: 'Facturas emitidas y recibidas 1T', applicable: true },
        { modelCode: 'Modelo 303', modelName: 'Autoliquidación IVA Trimestral', period: '2T', dueDate: `${year}-07-20`, requiredDocs: 'Facturas emitidas y recibidas 2T', applicable: true },
        { modelCode: 'Modelo 303', modelName: 'Autoliquidación IVA Trimestral', period: '3T', dueDate: `${year}-10-20`, requiredDocs: 'Facturas emitidas y recibidas 3T', applicable: true },
        { modelCode: 'Modelo 303', modelName: 'Autoliquidación IVA Trimestral', period: '4T', dueDate: `${year + 1}-01-30`, requiredDocs: 'Facturas emitidas y recibidas 4T', applicable: true },
        { modelCode: 'Modelo 390', modelName: 'Resumen Anual de IVA', period: 'Anual', dueDate: `${year + 1}-01-30`, requiredDocs: 'Cuadre anual modelos 303', applicable: true },
        { modelCode: 'Modelo 130', modelName: 'Pago fraccionado IRPF (si procede)', period: '4T', dueDate: `${year + 1}-01-30`, requiredDocs: 'Libro ingresos y gastos acumulados', applicable: false },
        { modelCode: 'Modelo 111', modelName: 'Retenciones trabajo y profesionales', period: '4T', dueDate: `${year + 1}-01-20`, requiredDocs: 'Nóminas y facturas con retención IRPF', applicable: true },
        { modelCode: 'Modelo 190', modelName: 'Resumen Anual Retenciones IRPF', period: 'Anual', dueDate: `${year + 1}-01-31`, requiredDocs: 'Certificados retenciones practicadas', applicable: true },
        { modelCode: 'Modelo 115', modelName: 'Retenciones arrendamientos urbanos', period: '4T', dueDate: `${year + 1}-01-20`, requiredDocs: 'Recibos de alquiler del inmueble', applicable: false },
        { modelCode: 'Modelo 180', modelName: 'Resumen Anual Retenciones Alquileres', period: 'Anual', dueDate: `${year + 1}-01-31`, requiredDocs: 'Cuadre anual modelo 115', applicable: false },
        { modelCode: 'Modelo 347', modelName: 'Operaciones con terceros > 3.005,06 €', period: 'Anual', dueDate: `${year + 1}-02-28`, requiredDocs: 'Listado clientes y proveedores anuales', applicable: true },
      ];

      try {
        const batch = writeBatch(db);
        templates.forEach((tpl, idx) => {
          const id = `fis_${year}_${tpl.modelCode.replace(/[^a-zA-Z0-9]/g, '')}_${tpl.period}_${idx}`;
          batch.set(doc(db, 'fiscalObligations', id), {
            orgId: ORG_ID,
            ...tpl,
            fiscalYear: year,
            status: 'Pendiente de preparar',
            responsibleName: profile?.displayName || '',
            notes: 'Generado en calendario base (configura aplicabilidad según tu forma jurídica).',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
        await logActivity('Inicializó calendario fiscal anual', 'Hacienda', String(year), `Ejercicio ${year}`);
        notify('success', `Calendario fiscal ${year} inicializado.`);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'fiscalObligations');
      }
    },
    [profile?.displayName, logActivity, notify]
  );

  const saveGestoriaPackage = useCallback(
    async (
      data: Omit<GestoriaPackage, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ): Promise<string> => {
      const id = existingId || createEntityId('pkg');
      try {
        if (existingId) {
          await updateDoc(doc(db, 'gestoriaPackages', id), {
            ...data,
            updatedAt: serverTimestamp(),
          });
          await logActivity('Actualizó expediente de gestoría', 'Gestoría', id, `${data.fiscalYear} ${data.quarter}`);
          notify('success', 'Expediente actualizado.');
        } else {
          await setDoc(doc(db, 'gestoriaPackages', id), {
            ...data,
            orgId: ORG_ID,
            createdBy: operatorUid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await logActivity('Preparó cierre trimestral para gestoría', 'Gestoría', id, `${data.fiscalYear} ${data.quarter}`);
          notify('success', `Cierre ${data.fiscalYear} ${data.quarter} preparado para revisión.`);
        }
        return id;
      } catch (err) {
        handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, `gestoriaPackages/${id}`);
      }
    },
    [operatorUid, logActivity, notify]
  );

  const inviteUser = useCallback(
    async (params: { email: string; displayName: string; role: UserRole; department?: string }) => {
      const inviteId = emailToInviteId(params.email);
      try {
        await setDoc(doc(db, 'userInvites', inviteId), {
          orgId: ORG_ID,
          email: params.email.trim().toLowerCase(),
          displayName: params.displayName.trim(),
          role: params.role,
          department: params.department?.trim() || 'General',
          active: true,
          invitedBy: operatorUid,
          createdAt: serverTimestamp(),
        });
        await logActivity('Invitó usuario al equipo', 'Usuarios', inviteId, params.email);
        notify('success', `Invitación creada para ${params.email} con rol ${params.role}.`);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `userInvites/${inviteId}`);
      }
    },
    [operatorUid, logActivity, notify]
  );

  const updateStaffRoleAndStatus = useCallback(
    async (user: UserPublic, role: UserRole, active: boolean) => {
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'users', user.uid), {
          role,
          active,
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'usersPublic', user.uid), {
          role,
          active,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        await logActivity(
          'Modificó permisos de usuario',
          'Usuarios',
          user.uid,
          user.displayName,
          `Rol: ${role} · Activo: ${active ? 'Sí' : 'No'}`
        );
        notify('success', 'Permisos de usuario actualizados.');
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
      }
    },
    [logActivity, notify]
  );

  // Isolated Demo Sandbox (explicit user-triggered test environment only)
  const loadDemoSandbox = useCallback(async () => {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const actorName = profile?.displayName || 'Dirección · Temis Atrile';
    try {
      const batch = writeBatch(db);
      const cli1 = 'demo_cli_1';
      const cli2 = 'demo_cli_2';
      batch.set(doc(db, 'clients', cli1), {
        orgId: ORG_ID,
        name: '[DEMO] Arquitectura Norte S.L.',
        taxId: 'B99001122',
        fiscalAddress: 'Paseo de la Castellana 84',
        postalCode: '28046',
        city: 'Madrid',
        province: 'Madrid',
        phone: '910001122',
        email: 'administracion@demo-norte.invalid',
        contactPerson: 'Elena Navarro',
        signupDate: `${year}-01-15`,
        clientType: 'Empresa',
        status: 'activo',
        notes: 'Registro de entorno de pruebas independiente.',
        archived: false,
        createdBy: operatorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'clients', cli2), {
        orgId: ORG_ID,
        name: '[DEMO] Consultoría Médica Sur S.L.P.',
        taxId: 'B99334455',
        fiscalAddress: 'Av. Constitución 18',
        postalCode: '41004',
        city: 'Sevilla',
        province: 'Sevilla',
        phone: '954003344',
        email: 'contacto@demo-sur.invalid',
        contactPerson: 'Carlos Medina',
        signupDate: `${year}-${month}-02`,
        clientType: 'Empresa',
        status: 'activo',
        notes: 'Registro de entorno de pruebas independiente.',
        archived: false,
        createdBy: operatorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'projects', 'demo_prj_1'), {
        orgId: ORG_ID,
        name: '[DEMO] Implantación ERP y Migración Fiscal',
        clientId: cli1,
        clientName: '[DEMO] Arquitectura Norte S.L.',
        description: 'Proyecto de prueba para validar flujo de trabajo Kanban y facturación.',
        service: 'Consultoría Digital',
        startDate: `${year}-${month}-01`,
        estimatedEndDate: addDaysIso(todayIso(), 15),
        responsibleUid: operatorUid,
        responsibleName: actorName,
        hoursSpent: 18,
        internalCost: 720,
        budgetedPrice: 3200,
        invoicedAmount: 3200,
        status: 'En proceso',
        notes: 'Entorno de prueba.',
        createdBy: operatorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'quotes', 'demo_quo_1'), {
        orgId: ORG_ID,
        number: `DEMO-P-${year}-001`,
        series: `P-${year}`,
        clientId: cli2,
        clientName: '[DEMO] Consultoría Médica Sur S.L.P.',
        clientTaxId: 'B99334455',
        issueDate: `${year}-${month}-03`,
        validUntil: addDaysIso(`${year}-${month}-03`, 30),
        status: 'aceptado',
        lines: [
          {
            description: 'Auditoría de procesos administrativos y archivo documental',
            quantity: 1,
            unitPrice: 1850,
            discountPercent: 0,
            vatRate: 21,
          },
        ],
        taxBase: 1850,
        vatAmount: 388.5,
        retentionRate: 0,
        retentionAmount: 0,
        total: 2238.5,
        notes: 'Presupuesto de prueba.',
        createdBy: operatorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const hash = await computeVerifactuHash({
        issuerTaxId: companySettings?.taxId || 'B00000000',
        invoiceNumber: `DEMO-F-${year}-0001`,
        issueDate: `${year}-${month}-05`,
        total: 3872,
        prevHash: 'GENESIS',
      });

      batch.set(doc(db, 'invoices', 'demo_inv_1'), {
        orgId: ORG_ID,
        number: `DEMO-F-${year}-0001`,
        series: `DEMO-${year}`,
        sequenceNumber: 1,
        issueDate: `${year}-${month}-05`,
        dueDate: addDaysIso(`${year}-${month}-05`, 30),
        clientId: cli1,
        clientName: '[DEMO] Arquitectura Norte S.L.',
        clientTaxId: 'B99001122',
        clientAddress: 'Paseo de la Castellana 84, Madrid',
        lines: [
          {
            description: 'Implantación ERP y Migración Fiscal (Fase 1)',
            quantity: 1,
            unitPrice: 3200,
            discountPercent: 0,
            vatRate: 21,
          },
        ],
        taxBase: 3200,
        vatAmount: 672,
        retentionRate: 0,
        retentionAmount: 0,
        total: 3872,
        paidAmount: 1500,
        status: 'Parcialmente cobrada',
        locked: true,
        verifactuPrevHash: 'GENESIS',
        verifactuHash: hash,
        projectId: 'demo_prj_1',
        notes: 'Factura de prueba del entorno sandbox.',
        createdBy: operatorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'suppliers', 'demo_sup_1'), {
        orgId: ORG_ID,
        name: '[DEMO] Cloud Infraestructura Iberia S.A.',
        taxId: 'A88112233',
        address: 'C/ Alcalá 210, Madrid',
        contactPerson: 'Soporte Facturación',
        phone: '911223344',
        email: 'billing@demo-cloud.invalid',
        category: 'Software y suscripciones',
        paymentTerms: 'Domiciliación mensual',
        notes: 'Proveedor de prueba.',
        createdBy: operatorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'expenses', 'demo_exp_1'), {
        orgId: ORG_ID,
        supplierId: 'demo_sup_1',
        supplierName: '[DEMO] Cloud Infraestructura Iberia S.A.',
        supplierTaxId: 'A88112233',
        invoiceNumber: 'CLD-2026-881',
        date: `${year}-${month}-04`,
        concept: 'Suscripción licencias nube y copias de seguridad',
        taxBase: 240,
        vatRate: 21,
        vatAmount: 50.4,
        total: 290.4,
        category: 'Software y suscripciones',
        paymentDate: `${year}-${month}-05`,
        status: 'Pagado',
        notes: 'Gasto de prueba sin justificante adjunto (detectable en cierre trimestral).',
        createdBy: operatorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'tasks', 'demo_tsk_1'), {
        orgId: ORG_ID,
        title: '[DEMO] Revisar cobro pendiente Arquitectura Norte',
        description: 'Confirmar segundo pago parcial de la factura DEMO.',
        dueDate: addDaysIso(todayIso(), 3),
        priority: 'Alta',
        responsibleUid: operatorUid,
        responsibleName: actorName,
        clientId: cli1,
        clientName: '[DEMO] Arquitectura Norte S.L.',
        category: 'Cobro',
        status: 'Pendiente',
        createdBy: operatorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      await logActivity('Cargó entorno de demostración', 'Sistema', 'demo_sandbox', 'Entorno de Pruebas');
      notify('info', 'Datos de demostración [DEMO] cargados en el entorno de prueba.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'demo_sandbox');
    }
  }, [operatorUid, profile?.displayName, companySettings?.taxId, logActivity, notify]);

  const clearDemoSandbox = useCallback(async () => {
    const demoDocs: Array<[string, string]> = [
      ['clients', 'demo_cli_1'],
      ['clients', 'demo_cli_2'],
      ['projects', 'demo_prj_1'],
      ['quotes', 'demo_quo_1'],
      ['suppliers', 'demo_sup_1'],
      ['expenses', 'demo_exp_1'],
      ['tasks', 'demo_tsk_1'],
    ];
    try {
      for (const [col, id] of demoDocs) {
        try {
          await deleteDoc(doc(db, col, id));
        } catch {
          // Ignore missing
        }
      }
      notify('success', 'Registros de prueba no bloqueados eliminados.');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'demo_sandbox');
    }
  }, [notify]);

  return (
    <ErpDataContext.Provider
      value={{
        loadingData,
        companySettings,
        usersPublic,
        userInvites,
        clients,
        communications,
        projects,
        tasks,
        projectComments,
        quotes,
        invoices,
        invoicePayments,
        suppliers,
        expenses,
        fiscalObligations,
        gestoriaPackages,
        documents,
        activityLogs,
        toasts,
        notify,
        dismissToast,
        saveCompanySettings,
        saveClient,
        archiveOrDeleteClient,
        addCommunication,
        saveProject,
        deleteProject,
        addProjectComment,
        saveTask,
        deleteTask,
        saveQuote,
        deleteQuote,
        convertQuoteToProject,
        convertQuoteToInvoice,
        saveInvoice,
        deleteDraftInvoice,
        registerInvoicePayment,
        createRectifyingInvoice,
        saveSupplier,
        deleteSupplier,
        saveExpense,
        deleteExpense,
        saveFiscalObligation,
        initializeDefaultFiscalYear,
        saveGestoriaPackage,
        inviteUser,
        updateStaffRoleAndStatus,
        logActivity,
        loadDemoSandbox,
        clearDemoSandbox,
      }}
    >
      {children}
    </ErpDataContext.Provider>
  );
};

export function useErpData(): ErpDataContextValue {
  const ctx = useContext(ErpDataContext);
  if (!ctx) throw new Error('useErpData debe usarse dentro de ErpDataProvider.');
  return ctx;
}
