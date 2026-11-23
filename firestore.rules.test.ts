/**
 * Payload-First Security Test Suite for GESTIÓN360 Firestore Rules
 * Verifies the "Dirty Dozen" adversarial payloads against expected PERMISSION_DENIED invariants.
 */

export interface AdversarialPayloadTest {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean; role?: string };
  docId?: string;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
  enforcedByRule: string;
}

export const dirtyDozenTests: AdversarialPayloadTest[] = [
  {
    id: 1,
    name: 'Privilege Escalation on Signup',
    collection: 'users',
    operation: 'create',
    docId: 'attackerUid',
    auth: { uid: 'attackerUid', email: 'attacker@example.com', email_verified: true },
    payload: {
      uid: 'attackerUid',
      email: 'attacker@example.com',
      displayName: 'Attacker',
      role: 'Administrador',
      active: true,
      orgId: 'gestion360-main',
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'users.create restricts self-registration strictly to role == "Consulta"',
  },
  {
    id: 2,
    name: 'Unverified Email Bypass',
    collection: 'clients',
    operation: 'create',
    docId: 'client_1',
    auth: { uid: 'u1', email: 'staff@empresa.es', email_verified: false, role: 'Comercial' },
    payload: { orgId: 'gestion360-main', name: 'Test SL', taxId: 'B12345678' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'isVerifiedUser() requires request.auth.token.email_verified == true',
  },
  {
    id: 3,
    name: 'Shadow Field Injection',
    collection: 'clients',
    operation: 'create',
    docId: 'client_shadow',
    auth: { uid: 'u2', email: 'comercial@empresa.es', email_verified: true, role: 'Comercial' },
    payload: {
      orgId: 'gestion360-main',
      name: 'Shadow Corp',
      taxId: 'B99999999',
      clientType: 'Empresa',
      status: 'activo',
      archived: false,
      createdBy: 'u2',
      isAdminOverride: true,
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidClient() enforces strict data.keys().hasOnly(...)',
  },
  {
    id: 4,
    name: 'ID Poisoning (Oversized / Path Traversal Document ID)',
    collection: 'projects',
    operation: 'create',
    docId: 'invalid/../' + 'x'.repeat(200),
    auth: { uid: 'u2', email: 'comercial@empresa.es', email_verified: true, role: 'Administrador' },
    payload: { orgId: 'gestion360-main', name: 'Poisoned' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidId(projectId) enforces ^[a-zA-Z0-9_\\-]+$ and size <= 128',
  },
  {
    id: 5,
    name: 'Locked Invoice Tampering',
    collection: 'invoices',
    operation: 'update',
    docId: 'inv_001',
    auth: { uid: 'u_fin', email: 'admin@empresa.es', email_verified: true, role: 'Administración' },
    payload: { total: 1.0, taxBase: 0.83 },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'invoices.update locks fiscal fields when existing().locked == true',
  },
  {
    id: 6,
    name: 'Locked Invoice Silent Deletion',
    collection: 'invoices',
    operation: 'delete',
    docId: 'inv_001',
    auth: { uid: 'root', email: 'patri97lopez@gmail.com', email_verified: true, role: 'Administrador' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'invoices.delete requires existing().locked == false',
  },
  {
    id: 7,
    name: 'Consulta Role Mutation Attempt',
    collection: 'expenses',
    operation: 'create',
    docId: 'exp_001',
    auth: { uid: 'u_read', email: 'viewer@empresa.es', email_verified: true, role: 'Consulta' },
    payload: { orgId: 'gestion360-main', supplierName: 'Proveedor SA', concept: 'Test', total: 100 },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'expenses.create requires isFinanceOrAdmin()',
  },
  {
    id: 8,
    name: 'Cross-User PII Read',
    collection: 'users',
    operation: 'get',
    docId: 'otherUid',
    auth: { uid: 'u_tech', email: 'tech@empresa.es', email_verified: true, role: 'Técnico' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'users.get restricted strictly to request.auth.uid == userId || isAdmin()',
  },
  {
    id: 9,
    name: 'Client Timestamp Forgery',
    collection: 'quotes',
    operation: 'create',
    docId: 'q_001',
    auth: { uid: 'u_com', email: 'comercial@empresa.es', email_verified: true, role: 'Comercial' },
    payload: { orgId: 'gestion360-main', number: 'P-2026-001', createdAt: '1999-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'quotes.create enforces incoming().createdAt == request.time',
  },
  {
    id: 10,
    name: 'Orphaned Project Comment',
    collection: 'projectComments',
    operation: 'create',
    docId: 'pc_001',
    auth: { uid: 'u_tech', email: 'tech@empresa.es', email_verified: true, role: 'Técnico' },
    payload: {
      orgId: 'gestion360-main',
      projectId: 'non_existent_project',
      authorUid: 'u_tech',
      authorName: 'Tech',
      text: 'Orphaned',
      hoursLogged: 1,
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'projectComments.create checks exists(/projects/$(incoming().projectId))',
  },
  {
    id: 11,
    name: 'Audit Log Erasure Attempt',
    collection: 'activityLogs',
    operation: 'delete',
    docId: 'log_001',
    auth: { uid: 'root', email: 'patri97lopez@gmail.com', email_verified: true, role: 'Administrador' },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'activityLogs.update and activityLogs.delete are unconditionally false',
  },
  {
    id: 12,
    name: 'Denial-of-Wallet Oversized String / Array',
    collection: 'documents',
    operation: 'create',
    docId: 'doc_big',
    auth: { uid: 'u_com', email: 'comercial@empresa.es', email_verified: true, role: 'Comercial' },
    payload: {
      orgId: 'gestion360-main',
      name: 'Oversized.pdf',
      description: 'A'.repeat(5000),
      tags: Array.from({ length: 25 }, (_, i) => `tag-${i}`),
    },
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidDocumentRecord() enforces description <= 1000 and tags.size() <= 10',
  },
];
