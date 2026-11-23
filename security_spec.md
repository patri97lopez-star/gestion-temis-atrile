# Security Specification — GESTIÓN360

## 1. Data Invariants
1. **Identity & Privilege Separation**: Users cannot self-assign `Administrador`, `Administración`, `Comercial`, or `Técnico` roles during registration unless matched against a verified `Administrador` invite or the bootstrapped root administrator email (`patri97lopez@gmail.com` with `email_verified == true`). Uninvited users may only register with the lowest-privilege `Consulta` role or must be invited by an Administrator.
2. **PII Isolation**: User emails and phone numbers live in `/users/{userId}` and are readable only by the owner (`request.auth.uid == userId`) or an active `Administrador`. Non-PII staff metadata (`displayName`, `role`, `department`, `active`) lives in `/usersPublic/{userId}`.
3. **Immutable Definitive Invoices (Ley Antifraude / VERI*FACTU)**: Once an invoice transitions to `locked == true` (any non-`Borrador` state), its fiscal fields (`number`, `series`, `sequenceNumber`, `issueDate`, `clientTaxId`, `lines`, `taxBase`, `vatAmount`, `retentionAmount`, `total`, `verifactuHash`, `verifactuPrevHash`) and document deletion are strictly blocked. Only payment tracking (`paidAmount`, `status`, `updatedAt`) or creating a separate rectifying invoice is permitted.
4. **Role-Based Mutation Enforcement**: `Consulta` users are strictly read-only across all business collections. `Técnico` users can only mutate projects, project comments, tasks, and documents. `Comercial` users can mutate clients, communications, quotes, tasks, and documents. `Administración` and `Administrador` can mutate billing, expenses, suppliers, fiscal obligations, and gestoría packages. Only `Administrador` can mutate `companySettings`, `users` roles/active status, and `userInvites`.
5. **Audit Log Integrity**: `/activityLogs/{logId}` is append-only (`create` only for active staff with `actorUid == request.auth.uid` and `createdAt == request.time`); `update` and `delete` are permanently denied.
6. **Temporal & Relational Integrity**: All `createdAt` and `updatedAt` fields must equal `request.time` (`serverTimestamp()`), and `createdBy`/`authorUid` must match `request.auth.uid`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Privilege Escalation on Signup**: `POST /users/attackerUid` with `{ role: "Administrador", uid: "attackerUid", ... }` by a non-root user. -> Expected: `PERMISSION_DENIED`.
2. **Unverified Email Bypass**: Any write to `/clients/{id}` with `request.auth.token.email_verified == false`. -> Expected: `PERMISSION_DENIED`.
3. **Shadow Field Injection**: `create` or `update` on `/clients/{id}` adding an unexpected field `{ isAdminOverride: true }`. -> Expected: `PERMISSION_DENIED`.
4. **ID Poisoning (1KB+ Document ID)**: `setDoc` on `/projects/{200-char-junk-id}` or ID with `/../`. -> Expected: `PERMISSION_DENIED`.
5. **Locked Invoice Tampering**: `update` on `/invoices/{id}` where `existing().locked == true` trying to alter `total` or `taxBase`. -> Expected: `PERMISSION_DENIED`.
6. **Locked Invoice Silent Deletion**: `delete` on `/invoices/{id}` where `existing().locked == true`. -> Expected: `PERMISSION_DENIED`.
7. **Consulta Role Mutation**: `create` on `/expenses/{id}` by a user whose `/users/{uid}` role is `Consulta`. -> Expected: `PERMISSION_DENIED`.
8. **Cross-User PII Read**: `get` on `/users/otherUid` by a non-admin user (`uid != otherUid`). -> Expected: `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: `create` on `/quotes/{id}` with a hardcoded client `createdAt` string instead of `request.time`. -> Expected: `PERMISSION_DENIED`.
10. **Orphaned Project Comment**: `create` on `/projectComments/{id}` referencing a non-existent `projectId`. -> Expected: `PERMISSION_DENIED`.
11. **Audit Log Erasure**: `delete` or `update` on `/activityLogs/{id}` even by an Administrator. -> Expected: `PERMISSION_DENIED`.
12. **Denial-of-Wallet Oversized String**: `create` on `/documents/{id}` with `description` exceeding `maxLength` (1000 chars) or `tags.size() > 10`. -> Expected: `PERMISSION_DENIED`.

## 3. Verification Runner
See `firestore.rules.test.ts` for the automated rules unit-test suite covering all 12 adversarial payloads.
