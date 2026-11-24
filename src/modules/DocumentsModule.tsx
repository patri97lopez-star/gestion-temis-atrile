import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Eye,
  FileText,
  Folder,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useErpData } from '../context/ErpDataContext';
import {
  deleteDocumentWithChunks,
  downloadDocumentRecord,
  getDocumentPreviewUrl,
  uploadDocumentToFirestore,
} from '../lib/fileStorage';
import { formatDate } from '../lib/formatters';
import { DOCUMENT_FOLDERS, type DocumentFolder, type DocumentRecord } from '../types/erp';

export const DocumentsModule: React.FC<{ initialAction?: string; onClearAction?: () => void }> = ({
  initialAction,
  onClearAction,
}) => {
  const { permissions, operatorUid, profile } = useAuth();
  const { documents, clients, projects, invoices, expenses, logActivity, notify } = useErpData();

  const [selectedFolder, setSelectedFolder] = useState<string>('todas');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    folder: 'Empresa' as DocumentFolder,
    docType: 'Documento general',
    description: '',
    clientId: '',
    projectId: '',
    invoiceId: '',
    expenseId: '',
    tagsText: '',
  });

  useEffect(() => {
    if (initialAction === 'new' && permissions.canWriteDocuments) {
      setUploadOpen(true);
      onClearAction?.();
    }
  }, [initialAction, permissions.canWriteDocuments, onClearAction]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      notify('error', 'Selecciona un archivo para subir.');
      return;
    }
    setUploading(true);
    try {
      const client = clients.find((c) => c.id === form.clientId);
      const tags = form.tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10);

      const created = await uploadDocumentToFirestore({
        file,
        folder: form.folder,
        docType: form.docType,
        description: form.description,
        clientId: form.clientId || undefined,
        clientName: client?.name,
        projectId: form.projectId || undefined,
        invoiceId: form.invoiceId || undefined,
        expenseId: form.expenseId || undefined,
        tags,
        uploadedByUid: operatorUid,
        uploadedByName: profile?.displayName || 'Dirección · Temis Atrile',
      });

      await logActivity('Subió documento al archivo', 'Documentación', created.id, created.name);
      notify('success', `Documento "${created.name}" almacenado correctamente.`);
      setUploadOpen(false);
      setFile(null);
      setForm({
        folder: 'Empresa',
        docType: 'Documento general',
        description: '',
        clientId: '',
        projectId: '',
        invoiceId: '',
        expenseId: '',
        tagsText: '',
      });
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'No se pudo subir el documento.');
    } finally {
      setUploading(false);
    }
  };

  const handleOpenPreview = async (docRec: DocumentRecord) => {
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = await getDocumentPreviewUrl(docRec);
      setPreviewUrl(url);
      setPreviewDoc(docRec);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'No se pudo previsualizar el archivo.');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents
      .filter((d) => (selectedFolder === 'todas' ? true : d.folder === selectedFolder))
      .filter((d) => (dateFilter ? d.uploadDate === dateFilter : true))
      .filter((d) => {
        if (!q) return true;
        return (
          d.name.toLowerCase().includes(q) ||
          d.docType.toLowerCase().includes(q) ||
          (d.clientName || '').toLowerCase().includes(q) ||
          (d.tags || []).some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.uploadDate.localeCompare(a.uploadDate));
  }, [documents, selectedFolder, dateFilter, search]);

  return (
    <div className="space-y-5">
      {/* Folder Tabs */}
      <div className="bg-white border border-[#ECEEEB] rounded-lg p-3 flex items-center gap-1.5 overflow-x-auto">
        <button
          type="button"
          onClick={() => setSelectedFolder('todas')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
            selectedFolder === 'todas' ? 'bg-[#203C35] text-white' : 'text-[#252B28]/75 hover:bg-[#F8F8F5]'
          }`}
        >
          Todas ({documents.length})
        </button>
        {DOCUMENT_FOLDERS.map((folder) => {
          const count = documents.filter((d) => d.folder === folder).length;
          return (
            <button
              key={folder}
              type="button"
              onClick={() => setSelectedFolder(folder)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                selectedFolder === folder ? 'bg-[#203C35] text-white' : 'text-[#252B28]/75 hover:bg-[#F8F8F5]'
              }`}
            >
              <Folder className="w-3.5 h-3.5" />
              {folder} ({count})
            </button>
          );
        })}
      </div>

      {/* Search & Actions */}
      <div className="bg-white border border-[#ECEEEB] rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-[#252B28]/45 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nombre, tipo, cliente o etiqueta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-[#F8F8F5] border border-[#ECEEEB] rounded-md"
            />
          </div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-[#F8F8F5] border border-[#ECEEEB] rounded-md"
          />
          {dateFilter && (
            <button
              type="button"
              onClick={() => setDateFilter('')}
              className="text-xs text-[#315348] hover:underline"
            >
              Limpiar fecha
            </button>
          )}
        </div>

        {permissions.canWriteDocuments && (
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#203C35] text-white rounded-md hover:bg-[#315348]"
          >
            <Plus className="w-3.5 h-3.5" />
            Subir archivo
          </button>
        )}
      </div>

      {/* Documents List */}
      <div className="bg-white border border-[#ECEEEB] rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-[#203C35]">No hay documentos en esta vista</p>
            <p className="text-xs text-[#252B28]/60">
              Sube archivos PDF, Word, Excel o imágenes y vincúlalos con clientes, facturas o proyectos.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F8F8F5] border-b border-[#ECEEEB]">
                <tr className="text-left text-[#252B28]/70">
                  <th className="px-4 py-3 font-medium">Documento</th>
                  <th className="px-4 py-3 font-medium">Carpeta</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Cliente / Vínculo</th>
                  <th className="px-4 py-3 font-medium">Subido</th>
                  <th className="px-4 py-3 font-medium text-right">Tamaño</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEEEB]">
                {filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-[#F8F8F5]/70">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#203C35] flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-[#315348] shrink-0" />
                        <span>{d.name}</span>
                      </div>
                      {d.tags && d.tags.length > 0 && (
                        <div className="text-[11px] text-[#252B28]/55 mt-0.5">
                          {d.tags.join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">{d.folder}</td>
                    <td className="px-4 py-3">{d.docType}</td>
                    <td className="px-4 py-3">{d.clientName || 'General'}</td>
                    <td className="px-4 py-3 font-mono-tabular">{formatDate(d.uploadDate)}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular">
                      {(d.fileSize / 1024).toFixed(0)} KB
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                      <button
                        type="button"
                        onClick={() => handleOpenPreview(d)}
                        title="Previsualizar"
                        className="p-1.5 text-[#252B28]/70 hover:text-[#203C35] rounded hover:bg-[#ECEEEB]"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadDocumentRecord(d)}
                        title="Descargar"
                        className="p-1.5 text-[#252B28]/70 hover:text-[#203C35] rounded hover:bg-[#ECEEEB]"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      {permissions.canWriteInvoices && (
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteDocumentWithChunks(d.id);
                            notify('success', 'Documento eliminado.');
                          }}
                          title="Eliminar"
                          className="p-1.5 text-[#252B28]/70 hover:text-[#B42318] rounded hover:bg-[#ECEEEB]"
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

      {/* Upload Modal */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Subir documento al archivo digital"
        subtitle="Admite PDF, Word, Excel e imágenes (hasta 3,5 MB por archivo)."
      >
        <form onSubmit={handleUpload} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium">Archivo *</span>
              <input
                type="file"
                required
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md bg-[#F8F8F5]"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Carpeta principal</span>
              <select
                value={form.folder}
                onChange={(e) => setForm({ ...form, folder: e.target.value as DocumentFolder })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                {DOCUMENT_FOLDERS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium">Tipo de documento</span>
              <input
                type="text"
                required
                value={form.docType}
                onChange={(e) => setForm({ ...form, docType: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
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
            <label className="space-y-1">
              <span className="font-medium">Trabajo asociado (opcional)</span>
              <select
                value={form.projectId}
                onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                <option value="">Ninguno</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium">Factura vinculada (opcional)</span>
              <select
                value={form.invoiceId}
                onChange={(e) => setForm({ ...form, invoiceId: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                <option value="">Ninguna</option>
                {invoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.number} · {i.clientName}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium">Gasto vinculado (opcional)</span>
              <select
                value={form.expenseId}
                onChange={(e) => setForm({ ...form, expenseId: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                <option value="">Ninguno</option>
                {expenses.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.supplierName} · {ex.concept}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium">Etiquetas (separadas por coma)</span>
              <input
                type="text"
                placeholder="Ej. contrato, 2026, firma"
                value={form.tagsText}
                onChange={(e) => setForm({ ...form, tagsText: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
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
          <div className="flex justify-end gap-2 pt-3 border-t border-[#ECEEEB]">
            <button type="button" onClick={() => setUploadOpen(false)} className="px-4 py-2 border border-[#ECEEEB] rounded-md">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="px-4 py-2 bg-[#203C35] text-white rounded-md hover:bg-[#315348]"
            >
              {uploading ? 'Subiendo...' : 'Guardar documento'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Preview Modal */}
      <Modal
        open={Boolean(previewDoc)}
        onClose={() => {
          setPreviewDoc(null);
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl(null);
        }}
        title={previewDoc?.name || 'Vista previa'}
        subtitle={previewDoc ? `${previewDoc.folder} · ${previewDoc.docType}` : ''}
        maxWidthClass="max-w-4xl"
      >
        {previewDoc && previewUrl && (
          <div className="space-y-3">
            {previewDoc.mimeType.startsWith('image/') ? (
              <img
                src={previewUrl}
                alt={previewDoc.name}
                className="max-h-[65vh] mx-auto rounded border border-[#ECEEEB]"
              />
            ) : previewDoc.mimeType === 'application/pdf' ? (
              <iframe
                src={previewUrl}
                title={previewDoc.name}
                className="w-full h-[65vh] border border-[#ECEEEB] rounded"
              />
            ) : (
              <div className="p-8 text-center space-y-3 bg-[#F8F8F5] rounded border border-[#ECEEEB]">
                <p className="text-xs text-[#252B28]/75">
                  La previsualización directa en navegador está disponible para PDF e imágenes. Para archivos Word/Excel descarga el documento original.
                </p>
                <button
                  type="button"
                  onClick={() => downloadDocumentRecord(previewDoc)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#203C35] text-white rounded-md"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar {previewDoc.name}
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
