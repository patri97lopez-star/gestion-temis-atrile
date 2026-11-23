import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, ORG_ID } from './firebase';
import { createEntityId, todayIso } from './formatters';
import type { DocumentFolder, DocumentRecord } from '../types/erp';

const CHUNK_CHAR_SIZE = 450_000;
export const MAX_UPLOAD_BYTES = 3_500_000; // ~3.5 MB binary (~4.7 MB base64 <= 11 chunks)

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

export async function uploadDocumentToFirestore(params: {
  file: File;
  folder: DocumentFolder;
  docType: string;
  description?: string;
  clientId?: string;
  clientName?: string;
  supplierId?: string;
  projectId?: string;
  invoiceId?: string;
  expenseId?: string;
  tags?: string[];
  uploadedByUid: string;
  uploadedByName: string;
}): Promise<DocumentRecord> {
  if (params.file.size > MAX_UPLOAD_BYTES) {
    throw new Error('El archivo supera el límite de 3,5 MB por documento.');
  }

  const base64 = await fileToBase64(params.file);
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += CHUNK_CHAR_SIZE) {
    chunks.push(base64.slice(i, i + CHUNK_CHAR_SIZE));
  }
  if (chunks.length === 0) {
    chunks.push('');
  }

  const docId = createEntityId('doc');
  const uploadDate = todayIso();

  const recordPayload: Omit<DocumentRecord, 'id'> = {
    orgId: ORG_ID,
    name: params.file.name.slice(0, 200),
    folder: params.folder,
    uploadDate,
    docType: params.docType.slice(0, 80),
    description: (params.description || '').slice(0, 1000),
    mimeType: params.file.type || 'application/octet-stream',
    fileSize: params.file.size,
    chunkCount: chunks.length,
    tags: (params.tags || []).slice(0, 10).map((t) => String(t).slice(0, 40)),
    uploadedByUid: params.uploadedByUid,
    uploadedByName: params.uploadedByName.slice(0, 120),
    createdAt: serverTimestamp(),
    ...(params.clientId ? { clientId: params.clientId } : {}),
    ...(params.clientName ? { clientName: params.clientName.slice(0, 160) } : {}),
    ...(params.supplierId ? { supplierId: params.supplierId } : {}),
    ...(params.projectId ? { projectId: params.projectId } : {}),
    ...(params.invoiceId ? { invoiceId: params.invoiceId } : {}),
    ...(params.expenseId ? { expenseId: params.expenseId } : {}),
  };

  try {
    const batch = writeBatch(db);
    const docRef = doc(db, 'documents', docId);
    batch.set(docRef, recordPayload);

    chunks.forEach((chunkData, index) => {
      const chunkRef = doc(db, 'documents', docId, 'chunks', `chunk_${index}`);
      batch.set(chunkRef, {
        orgId: ORG_ID,
        index,
        data: chunkData,
      });
    });

    await batch.commit();
    return { id: docId, ...recordPayload };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `documents/${docId}`);
  }
}

export async function uploadGeneratedBlobAsDocument(params: {
  blob: Blob;
  fileName: string;
  folder: DocumentFolder;
  docType: string;
  description?: string;
  uploadedByUid: string;
  uploadedByName: string;
}): Promise<string> {
  const file = new File([params.blob], params.fileName, {
    type: params.blob.type || 'application/pdf',
  });
  const saved = await uploadDocumentToFirestore({
    file,
    folder: params.folder,
    docType: params.docType,
    description: params.description,
    uploadedByUid: params.uploadedByUid,
    uploadedByName: params.uploadedByName,
  });
  return saved.id;
}

export async function fetchDocumentBytes(documentId: string): Promise<Uint8Array> {
  try {
    const chunksSnap = await getDocs(
      query(collection(db, 'documents', documentId, 'chunks'), orderBy('index', 'asc'))
    );
    const base64Combined = chunksSnap.docs
      .map((d) => String((d.data() as { data?: string }).data || ''))
      .join('');
    return base64ToUint8Array(base64Combined);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `documents/${documentId}/chunks`);
  }
}

export async function downloadDocumentRecord(docRecord: DocumentRecord): Promise<void> {
  const bytes = await fetchDocumentBytes(docRecord.id);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: docRecord.mimeType || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = docRecord.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function getDocumentPreviewUrl(docRecord: DocumentRecord): Promise<string> {
  const bytes = await fetchDocumentBytes(docRecord.id);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: docRecord.mimeType || 'application/octet-stream' });
  return URL.createObjectURL(blob);
}

export async function deleteDocumentWithChunks(documentId: string): Promise<void> {
  try {
    const chunksSnap = await getDocs(collection(db, 'documents', documentId, 'chunks'));
    for (const chunkDoc of chunksSnap.docs) {
      await deleteDoc(doc(db, 'documents', documentId, 'chunks', chunkDoc.id));
    }
    await deleteDoc(doc(db, 'documents', documentId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `documents/${documentId}`);
  }
}

export async function saveEmptyPlaceholderDoc(id: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await setDoc(doc(db, 'documents', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `documents/${id}`);
  }
}
