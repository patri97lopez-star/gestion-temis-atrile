import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  FileCheck,
  FolderOpen,
  Landmark,
  PackageCheck,
  Plus,
  Send,
  Upload,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { StatusLabel } from '../components/ui/StatusLabel';
import { useAuth } from '../context/AuthContext';
import { useErpData } from '../context/ErpDataContext';
import { generateQuarterlyZipPackage } from '../lib/exportUtils';
import { downloadDocumentRecord, uploadDocumentToFirestore, uploadGeneratedBlobAsDocument } from '../lib/fileStorage';
import { formatCurrency, formatDate, getQuarterDateRange, todayIso } from '../lib/formatters';
import { buildQuarterlyClosingPdfBlob } from '../lib/pdfGenerator';
import {
  FISCAL_STATUSES,
  type FiscalObligation,
  type FiscalStatus,
  type GestoriaPackage,
} from '../types/erp';

type SubTab = 'obligaciones' | 'carpeta_gestor' | 'cierre_trimestral' | 'envios';

const GESTOR_DOC_CATEGORIES = [
  'Facturas emitidas',
  'Facturas recibidas',
  'Extractos bancarios',
  'Justificantes de pago',
  'Nóminas',
  'Seguros sociales',
  'Contratos',
  'Certificados',
  'Documentos fiscales',
  'Otros archivos',
];

export const HaciendaGestoriaModule: React.FC = () => {
  const { permissions, operatorUid, profile } = useAuth();
  const {
    fiscalObligations,
    gestoriaPackages,
    invoices,
    expenses,
    documents,
    companySettings,
    saveFiscalObligation,
    initializeDefaultFiscalYear,
    saveGestoriaPackage,
    notify,
  } = useErpData();

  const [subTab, setSubTab] = useState<SubTab>('cierre_trimestral');
  const [selectedYear, setSelectedYear] = useState(
    companySettings?.currentFiscalYear || new Date().getFullYear()
  );
  const [selectedQuarter, setSelectedQuarter] = useState<'1T' | '2T' | '3T' | '4T'>(() => {
    const m = new Date().getMonth() + 1;
    if (m <= 3) return '1T';
    if (m <= 6) return '2T';
    if (m <= 9) return '3T';
    return '4T';
  });

  // Fiscal obligation modal
  const [obModalOpen, setObModalOpen] = useState(false);
  const [editingOb, setEditingOb] = useState<FiscalObligation | null>(null);
  const [obForm, setObForm] = useState({
    modelCode: '',
    modelName: '',
    applicable: true,
    fiscalYear: selectedYear,
    period: '1T',
    dueDate: todayIso(),
    requiredDocs: '',
    status: 'Pendiente de preparar' as FiscalStatus,
    responsibleName: profile?.displayName || '',
    submissionDate: '',
    notes: '',
  });
  const [obReceiptFile, setObReceiptFile] = useState<File | null>(null);

  // Gestor upload modal
  const [gestorUploadType, setGestorUploadType] = useState(GESTOR_DOC_CATEGORIES[0]);
  const [gestorFile, setGestorFile] = useState<File | null>(null);
  const [uploadingGestorDoc, setUploadingGestorDoc] = useState(false);

  // Quarterly closing execution
  const [closingPrepared, setClosingPrepared] = useState(false);
  const [preparingClosing, setPreparingClosing] = useState(false);

  // Delivery modal
  const [deliveryPkg, setDeliveryPkg] = useState<GestoriaPackage | null>(null);
  const [deliveryForm, setDeliveryForm] = useState({
    sentDate: todayIso(),
    recipientName: companySettings?.gestorName || companySettings?.gestorFirm || '',
    recipientEmail: companySettings?.gestorEmail || '',
    observations: '',
    status: 'Enviado al gestor' as GestoriaPackage['status'],
  });
  const [deliveryReceiptFile, setDeliveryReceiptFile] = useState<File | null>(null);

  // Quarter compilation memo
  const quarterData = useMemo(() => {
    const { start, end } = getQuarterDateRange(selectedYear, selectedQuarter);
    const issued = invoices.filter(
      (i) => i.status !== 'Borrador' && i.issueDate >= start && i.issueDate <= end
    );
    const draftInvoices = invoices.filter(
      (i) => i.status === 'Borrador' && i.issueDate >= start && i.issueDate <= end
    );
    const periodExpenses = expenses.filter((e) => e.date >= start && e.date <= end);
    const periodDocs = documents.filter(
      (d) =>
        (d.uploadDate >= start && d.uploadDate <= end) ||
        d.folder === 'Hacienda' ||
        d.folder === 'Gestoría'
    );

    const issuedBase = issued.reduce((s, i) => s + i.taxBase, 0);
    const issuedVat = issued.reduce((s, i) => s + i.vatAmount, 0);
    const receivedBase = periodExpenses.reduce((s, e) => s + e.taxBase, 0);
    const receivedVat = periodExpenses.reduce((s, e) => s + e.vatAmount, 0);

    const byCategory: Record<string, number> = {};
    periodExpenses.forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.taxBase;
    });

    const incidences: string[] = [];
    const expensesWithoutDoc = periodExpenses.filter((e) => !e.documentId);
    if (expensesWithoutDoc.length > 0) {
      incidences.push(
        `${expensesWithoutDoc.length} gasto(s)/factura(s) recibida(s) sin justificante PDF/imagen adjunto.`
      );
    }
    const expensesWithoutTaxId = periodExpenses.filter((e) => !e.supplierTaxId);
    if (expensesWithoutTaxId.length > 0) {
      incidences.push(
        `${expensesWithoutTaxId.length} registro(s) de gasto sin CIF/NIF de proveedor informado.`
      );
    }
    if (draftInvoices.length > 0) {
      incidences.push(
        `${draftInvoices.length} factura(s) en estado Borrador dentro del trimestre (no incluidas en totales).`
      );
    }
    const bankDocs = periodDocs.filter((d) => d.folder === 'Bancos');
    if (bankDocs.length === 0) {
      incidences.push('No se han detectado extractos bancarios subidos en la carpeta Bancos para este periodo.');
    }

    return {
      start,
      end,
      issued,
      draftInvoices,
      periodExpenses,
      periodDocs,
      issuedBase,
      issuedVat,
      receivedBase,
      receivedVat,
      byCategory,
      missingDocsCount: expensesWithoutDoc.length + (bankDocs.length === 0 ? 1 : 0),
      incidences,
    };
  }, [selectedYear, selectedQuarter, invoices, expenses, documents]);

  const handlePrepareQuarter = async () => {
    setPreparingClosing(true);
    try {
      setClosingPrepared(true);

      // Generate summary PDF & save to Gestoría archive
      const summaryBlob = buildQuarterlyClosingPdfBlob({
        fiscalYear: selectedYear,
        quarter: selectedQuarter,
        company: companySettings,
        issuedInvoices: quarterData.issued,
        expenses: quarterData.periodExpenses,
        incidences: quarterData.incidences,
      });

      const summaryDocId = await uploadGeneratedBlobAsDocument({
        blob: summaryBlob,
        fileName: `Resumen_Cierre_${selectedYear}_${selectedQuarter}.pdf`,
        folder: 'Gestoría',
        docType: 'Resumen Cierre Trimestral',
        description: `Expediente preparatorio ${selectedYear} ${selectedQuarter}`,
        uploadedByUid: operatorUid,
        uploadedByName: profile?.displayName || 'Dirección · Temis Atrile',
      });

      // Download ZIP package
      await generateQuarterlyZipPackage({
        fiscalYear: selectedYear,
        quarter: selectedQuarter,
        company: companySettings,
        issuedInvoices: quarterData.issued,
        expenses: quarterData.periodExpenses,
        documents: quarterData.periodDocs,
        incidences: quarterData.incidences,
      });

      // Persist gestoriaPackages record
      await saveGestoriaPackage({
        fiscalYear: selectedYear,
        quarter: selectedQuarter,
        status: 'Preparado para revisión',
        issuedBase: Number(quarterData.issuedBase.toFixed(2)),
        issuedVat: Number(quarterData.issuedVat.toFixed(2)),
        receivedBase: Number(quarterData.receivedBase.toFixed(2)),
        receivedVat: Number(quarterData.receivedVat.toFixed(2)),
        issuedCount: quarterData.issued.length,
        expensesCount: quarterData.periodExpenses.length,
        missingDocsCount: quarterData.missingDocsCount,
        incidences: quarterData.incidences.slice(0, 30),
        receiptDocumentId: summaryDocId,
        observations: 'Cierre trimestral generado automáticamente para revisión del gestor.',
      });
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Error al preparar el cierre trimestral.');
    } finally {
      setPreparingClosing(false);
    }
  };

  const handleSaveObligation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obForm.modelCode.trim() || !obForm.modelName.trim()) return;
    try {
      let receiptDocumentId = editingOb?.receiptDocumentId || '';
      if (obReceiptFile) {
        const uploaded = await uploadDocumentToFirestore({
          file: obReceiptFile,
          folder: 'Hacienda',
          docType: `Justificante ${obForm.modelCode}`,
          description: `${obForm.modelCode} ${obForm.period} ${obForm.fiscalYear}`,
          uploadedByUid: operatorUid,
          uploadedByName: profile?.displayName || 'Dirección · Temis Atrile',
        });
        receiptDocumentId = uploaded.id;
      }
      await saveFiscalObligation(
        {
          ...obForm,
          ...(receiptDocumentId ? { receiptDocumentId } : {}),
        },
        editingOb?.id
      );
      setObModalOpen(false);
      setObReceiptFile(null);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Error al guardar obligación fiscal.');
    }
  };

  const gestorDocs = useMemo(() => {
    return documents.filter(
      (d) =>
        d.folder === 'Gestoría' ||
        d.folder === 'Hacienda' ||
        d.folder === 'Bancos' ||
        d.folder === 'Personal' ||
        d.folder === 'Contratos'
    );
  }, [documents]);

  const yearObligations = useMemo(() => {
    return fiscalObligations
      .filter((f) => f.fiscalYear === selectedYear)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [fiscalObligations, selectedYear]);

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="bg-white border border-[#ECEEEB] rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F8F8F5] border border-[#ECEEEB] rounded-md">
          <button
            type="button"
            onClick={() => setSubTab('cierre_trimestral')}
            className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap ${
              subTab === 'cierre_trimestral' ? 'bg-[#203C35] text-white' : 'text-[#252B28]/75'
            }`}
          >
            C. Cierre Trimestral
          </button>
          <button
            type="button"
            onClick={() => setSubTab('obligaciones')}
            className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap ${
              subTab === 'obligaciones' ? 'bg-[#203C35] text-white' : 'text-[#252B28]/75'
            }`}
          >
            A. Obligaciones Fiscales
          </button>
          <button
            type="button"
            onClick={() => setSubTab('carpeta_gestor')}
            className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap ${
              subTab === 'carpeta_gestor' ? 'bg-[#203C35] text-white' : 'text-[#252B28]/75'
            }`}
          >
            B. Carpeta para el Gestor
          </button>
          <button
            type="button"
            onClick={() => setSubTab('envios')}
            className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap ${
              subTab === 'envios' ? 'bg-[#203C35] text-white' : 'text-[#252B28]/75'
            }`}
          >
            D. Envíos al Gestor ({gestoriaPackages.length})
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#252B28]/65">Ejercicio:</span>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-2.5 py-1.5 bg-[#F8F8F5] border border-[#ECEEEB] rounded-md font-mono-tabular"
          >
            {[selectedYear - 1, selectedYear, selectedYear + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* SECTION C: CIERRE TRIMESTRAL AUTOMATIZADO */}
      {subTab === 'cierre_trimestral' && (
        <div className="space-y-5">
          <div className="bg-[#203C35] text-[#F8F8F5] rounded-lg p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-1.5 max-w-2xl">
              <div className="text-xs font-medium text-[#C6A879]">
                Módulo prioritario · Preparación fiscal y documental
              </div>
              <h2 className="text-lg font-semibold">Cierre Trimestral para Gestoría</h2>
              <p className="text-xs text-[#F8F8F5]/80 leading-relaxed">
                Recopila facturas emitidas, facturas recibidas y gastos del periodo, detecta documentos ausentes, genera el resumen económico en PDF y empaqueta toda la documentación en un archivo ZIP listo para revisión profesional.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <select
                value={selectedQuarter}
                onChange={(e) => setSelectedQuarter(e.target.value as '1T' | '2T' | '3T' | '4T')}
                className="px-3 py-2.5 text-xs bg-[#315348] text-white border border-white/15 rounded-md font-mono-tabular"
              >
                <option value="1T">1T (Ene - Mar)</option>
                <option value="2T">2T (Abr - Jun)</option>
                <option value="3T">3T (Jul - Sep)</option>
                <option value="4T">4T (Oct - Dic)</option>
              </select>

              {permissions.canWriteFiscal && (
                <button
                  type="button"
                  disabled={preparingClosing}
                  onClick={handlePrepareQuarter}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold bg-[#C6A879] text-[#203C35] rounded-md hover:bg-[#d5ba8f] transition-colors disabled:opacity-60"
                >
                  <PackageCheck className="w-4 h-4" />
                  {preparingClosing
                    ? 'Generando PDF y ZIP...'
                    : 'PREPARAR TRIMESTRE PARA EL GESTOR'}
                </button>
              )}
            </div>
          </div>

          {/* Live Quarterly Preview & Audit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#ECEEEB] rounded-lg p-4">
              <span className="text-xs text-[#252B28]/65">Facturas emitidas ({selectedQuarter})</span>
              <div className="text-xl font-semibold text-[#203C35] font-mono-tabular mt-1">
                {quarterData.issued.length} · {formatCurrency(quarterData.issuedBase)}
              </div>
              <span className="text-xs text-[#252B28]/65 font-mono-tabular">
                IVA repercutido: {formatCurrency(quarterData.issuedVat)}
              </span>
            </div>
            <div className="bg-white border border-[#ECEEEB] rounded-lg p-4">
              <span className="text-xs text-[#252B28]/65">Facturas recibidas y gastos</span>
              <div className="text-xl font-semibold text-[#203C35] font-mono-tabular mt-1">
                {quarterData.periodExpenses.length} · {formatCurrency(quarterData.receivedBase)}
              </div>
              <span className="text-xs text-[#252B28]/65 font-mono-tabular">
                IVA soportado: {formatCurrency(quarterData.receivedVat)}
              </span>
            </div>
            <div className="bg-white border border-[#ECEEEB] rounded-lg p-4">
              <span className="text-xs text-[#252B28]/65">Resultado IVA orientativo</span>
              <div className="text-xl font-semibold text-[#315348] font-mono-tabular mt-1">
                {formatCurrency(quarterData.issuedVat - quarterData.receivedVat)}
              </div>
              <span className="text-xs text-[#252B28]/65">Sujeto a revisión del gestor</span>
            </div>
            <div className="bg-white border border-[#ECEEEB] rounded-lg p-4">
              <span className="text-xs text-[#252B28]/65">Incidencias detectadas</span>
              <div className="text-xl font-semibold text-[#9A6315] font-mono-tabular mt-1">
                {quarterData.incidences.length}
              </div>
              <span className="text-xs text-[#252B28]/65">
                {quarterData.periodDocs.length} archivos adjuntos en periodo
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#203C35] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#C6A879]" />
                Detección de documentos ausentes e incidencias ({selectedYear} {selectedQuarter})
              </h3>
              {quarterData.incidences.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-[#1E6B47] py-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Documentación básica completa para los registros actuales del periodo.
                </div>
              ) : (
                <ul className="space-y-2 text-xs text-[#252B28]/85 list-disc pl-5">
                  {quarterData.incidences.map((inc, idx) => (
                    <li key={idx}>{inc}</li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-[#252B28]/60 pt-2 border-t border-[#ECEEEB]">
                Los cálculos reflejados son preparatorios sobre los datos registrados y no sustituyen la contabilidad oficial ni la validación de tu asesor fiscal.
              </p>
            </div>

            <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#203C35]">
                Clasificación de gastos del periodo ({selectedQuarter})
              </h3>
              {Object.keys(quarterData.byCategory).length === 0 ? (
                <p className="text-xs text-[#252B28]/60">No hay gastos registrados en este trimestre.</p>
              ) : (
                <div className="divide-y divide-[#ECEEEB] text-xs">
                  {Object.entries(quarterData.byCategory).map(([cat, amount]) => (
                    <div key={cat} className="py-2 flex justify-between">
                      <span>{cat}</span>
                      <span className="font-mono-tabular font-medium text-[#203C35]">
                        {formatCurrency(amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {closingPrepared && (
                <div className="p-3 bg-[#F8F8F5] border border-[#ECEEEB] rounded text-xs text-[#1E6B47] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Expediente {selectedYear} {selectedQuarter} marcado como "Preparado para revisión" y archivo ZIP descargado.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION A: OBLIGACIONES FISCALES */}
      {subTab === 'obligaciones' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#ECEEEB] rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs">
              <h3 className="text-sm font-semibold text-[#203C35]">
                Calendario configurable de modelos fiscales ({selectedYear})
              </h3>
              <p className="text-[#252B28]/65">
                Activa o desactiva cada modelo según corresponda a tu empresa (SL, autónomo, retenciones, etc.).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {permissions.canWriteFiscal && yearObligations.length === 0 && (
                <button
                  type="button"
                  onClick={() => initializeDefaultFiscalYear(selectedYear)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#315348] text-white rounded-md"
                >
                  <Landmark className="w-3.5 h-3.5" />
                  Cargar plantilla modelos {selectedYear}
                </button>
              )}
              {permissions.canWriteFiscal && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingOb(null);
                    setObForm({
                      modelCode: 'Modelo ',
                      modelName: '',
                      applicable: true,
                      fiscalYear: selectedYear,
                      period: '1T',
                      dueDate: todayIso(),
                      requiredDocs: '',
                      status: 'Pendiente de preparar',
                      responsibleName: profile?.displayName || '',
                      submissionDate: '',
                      notes: '',
                    });
                    setObModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#203C35] text-white rounded-md"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Añadir modelo
                </button>
              )}
            </div>
          </div>

          <div className="bg-white border border-[#ECEEEB] rounded-lg overflow-hidden">
            {yearObligations.length === 0 ? (
              <div className="p-10 text-center space-y-2 text-xs">
                <p className="font-medium text-sm text-[#203C35]">
                  Sin obligaciones fiscales configuradas para {selectedYear}
                </p>
                <p className="text-[#252B28]/60">
                  Pulsa "Cargar plantilla modelos {selectedYear}" o añade manualmente los modelos aplicables a tu actividad.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#F8F8F5] border-b border-[#ECEEEB]">
                    <tr className="text-left text-[#252B28]/70">
                      <th className="px-4 py-3 font-medium">Aplica</th>
                      <th className="px-4 py-3 font-medium">Modelo</th>
                      <th className="px-4 py-3 font-medium">Periodo</th>
                      <th className="px-4 py-3 font-medium">Fecha límite</th>
                      <th className="px-4 py-3 font-medium">Documentación</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                      <th className="px-4 py-3 font-medium text-right">Gestión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ECEEEB]">
                    {yearObligations.map((ob) => (
                      <tr key={ob.id} className={!ob.applicable ? 'opacity-55 bg-[#F8F8F5]/40' : 'hover:bg-[#F8F8F5]/70'}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            disabled={!permissions.canWriteFiscal}
                            checked={ob.applicable}
                            onChange={(e) =>
                              saveFiscalObligation(
                                {
                                  modelCode: ob.modelCode,
                                  modelName: ob.modelName,
                                  applicable: e.target.checked,
                                  fiscalYear: ob.fiscalYear,
                                  period: ob.period,
                                  dueDate: ob.dueDate,
                                  requiredDocs: ob.requiredDocs,
                                  status: ob.status,
                                  responsibleName: ob.responsibleName,
                                  submissionDate: ob.submissionDate,
                                  receiptDocumentId: ob.receiptDocumentId,
                                  notes: ob.notes,
                                },
                                ob.id
                              )
                            }
                            className="accent-[#203C35]"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#203C35]">{ob.modelCode}</div>
                          <div className="text-[11px] text-[#252B28]/65">{ob.modelName}</div>
                        </td>
                        <td className="px-4 py-3 font-mono-tabular">{ob.period}</td>
                        <td className="px-4 py-3 font-mono-tabular">{formatDate(ob.dueDate)}</td>
                        <td className="px-4 py-3 max-w-[220px] truncate">{ob.requiredDocs || '—'}</td>
                        <td className="px-4 py-3">
                          <StatusLabel value={ob.status} />
                        </td>
                        <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                          {ob.receiptDocumentId && (
                            <button
                              type="button"
                              onClick={() => {
                                const docRec = documents.find((d) => d.id === ob.receiptDocumentId);
                                if (docRec) downloadDocumentRecord(docRec);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 border border-[#ECEEEB] rounded hover:bg-[#F8F8F5]"
                            >
                              <FileCheck className="w-3 h-3" />
                              Justificante
                            </button>
                          )}
                          {permissions.canWriteFiscal && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingOb(ob);
                                setObForm({
                                  modelCode: ob.modelCode,
                                  modelName: ob.modelName,
                                  applicable: ob.applicable,
                                  fiscalYear: ob.fiscalYear,
                                  period: ob.period,
                                  dueDate: ob.dueDate,
                                  requiredDocs: ob.requiredDocs || '',
                                  status: ob.status,
                                  responsibleName: ob.responsibleName || '',
                                  submissionDate: ob.submissionDate || '',
                                  notes: ob.notes || '',
                                });
                                setObModalOpen(true);
                              }}
                              className="px-2.5 py-1 bg-[#F8F8F5] border border-[#ECEEEB] rounded hover:bg-[#ECEEEB]"
                            >
                              Actualizar
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
        </div>
      )}

      {/* SECTION B: DOCUMENTACIÓN PARA EL GESTOR */}
      {subTab === 'carpeta_gestor' && (
        <div className="space-y-5">
          {permissions.canWriteDocuments && (
            <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#203C35] flex items-center gap-2">
                <Upload className="w-4 h-4 text-[#C6A879]" />
                Subir documentación a la carpeta digital de gestoría
              </h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!gestorFile) return;
                  setUploadingGestorDoc(true);
                  try {
                    const folderMap: Record<string, 'Gestoría' | 'Bancos' | 'Personal' | 'Contratos' | 'Hacienda'> = {
                      'Extractos bancarios': 'Bancos',
                      Nóminas: 'Personal',
                      'Seguros sociales': 'Personal',
                      Contratos: 'Contratos',
                      'Documentos fiscales': 'Hacienda',
                      Certificados: 'Hacienda',
                    };
                    await uploadDocumentToFirestore({
                      file: gestorFile,
                      folder: folderMap[gestorUploadType] || 'Gestoría',
                      docType: gestorUploadType,
                      description: `Carpeta gestoría · ${gestorUploadType}`,
                      uploadedByUid: operatorUid,
                      uploadedByName: profile?.displayName || 'Dirección · Temis Atrile',
                    });
                    setGestorFile(null);
                    notify('success', 'Documento subido a la carpeta del gestor.');
                  } catch (err) {
                    notify('error', err instanceof Error ? err.message : 'Error al subir archivo.');
                  } finally {
                    setUploadingGestorDoc(false);
                  }
                }}
                className="flex flex-wrap items-center gap-3 text-xs"
              >
                <select
                  value={gestorUploadType}
                  onChange={(e) => setGestorUploadType(e.target.value)}
                  className="px-3 py-2 bg-[#F8F8F5] border border-[#ECEEEB] rounded-md"
                >
                  {GESTOR_DOC_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="file"
                  required
                  onChange={(e) => setGestorFile(e.target.files?.[0] || null)}
                  className="flex-1 min-w-[220px] px-3 py-1.5 bg-[#F8F8F5] border border-[#ECEEEB] rounded-md"
                />
                <button
                  type="submit"
                  disabled={uploadingGestorDoc || !gestorFile}
                  className="px-4 py-2 bg-[#203C35] text-white rounded-md hover:bg-[#315348] disabled:opacity-50"
                >
                  {uploadingGestorDoc ? 'Subiendo...' : 'Guardar en carpeta'}
                </button>
              </form>
            </div>
          )}

          <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#203C35] flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-[#C6A879]" />
              Archivo digital disponible para el gestor ({gestorDocs.length})
            </h3>
            {gestorDocs.length === 0 ? (
              <p className="text-xs text-[#252B28]/60 py-4">
                No hay documentos todavía en las carpetas de Gestoría, Hacienda, Bancos, Personal o Contratos.
              </p>
            ) : (
              <div className="divide-y divide-[#ECEEEB] text-xs">
                {gestorDocs.map((d) => (
                  <div key={d.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-[#203C35]">{d.name}</p>
                      <p className="text-[#252B28]/60">
                        {d.folder} · {d.docType} · {formatDate(d.uploadDate)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadDocumentRecord(d)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[#ECEEEB] rounded hover:bg-[#F8F8F5]"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Descargar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION D: ENVÍOS AL GESTOR */}
      {subTab === 'envios' && (
        <div className="bg-white border border-[#ECEEEB] rounded-lg overflow-hidden">
          {gestoriaPackages.length === 0 ? (
            <div className="p-10 text-center space-y-2 text-xs">
              <p className="text-sm font-medium text-[#203C35]">No hay paquetes trimestrales registrados</p>
              <p className="text-[#252B28]/60">
                Ejecuta "PREPARAR TRIMESTRE PARA EL GESTOR" en la pestaña Cierre Trimestral para generar tu primer expediente.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#F8F8F5] border-b border-[#ECEEEB]">
                  <tr className="text-left text-[#252B28]/70">
                    <th className="px-4 py-3 font-medium">Periodo</th>
                    <th className="px-4 py-3 font-medium">Base Emit. / Recib.</th>
                    <th className="px-4 py-3 font-medium">IVA Rep. / Sop.</th>
                    <th className="px-4 py-3 font-medium">Destinatario</th>
                    <th className="px-4 py-3 font-medium">Fecha envío</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECEEEB]">
                  {gestoriaPackages.map((pkg) => (
                    <tr key={pkg.id} className="hover:bg-[#F8F8F5]/70">
                      <td className="px-4 py-3 font-mono-tabular font-semibold text-[#203C35]">
                        {pkg.fiscalYear} · {pkg.quarter}
                      </td>
                      <td className="px-4 py-3 font-mono-tabular">
                        {formatCurrency(pkg.issuedBase)} / {formatCurrency(pkg.receivedBase)}
                      </td>
                      <td className="px-4 py-3 font-mono-tabular">
                        {formatCurrency(pkg.issuedVat)} / {formatCurrency(pkg.receivedVat)}
                      </td>
                      <td className="px-4 py-3">{pkg.recipientName || companySettings?.gestorFirm || 'Pendiente'}</td>
                      <td className="px-4 py-3 font-mono-tabular">{formatDate(pkg.sentDate)}</td>
                      <td className="px-4 py-3">
                        <StatusLabel value={pkg.status} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                        {pkg.receiptDocumentId && (
                          <button
                            type="button"
                            onClick={() => {
                              const d = documents.find((docItem) => docItem.id === pkg.receiptDocumentId);
                              if (d) downloadDocumentRecord(d);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 border border-[#ECEEEB] rounded hover:bg-[#F8F8F5]"
                          >
                            <Download className="w-3 h-3" />
                            Resumen
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const { start, end } = getQuarterDateRange(pkg.fiscalYear, pkg.quarter);
                            generateQuarterlyZipPackage({
                              fiscalYear: pkg.fiscalYear,
                              quarter: pkg.quarter,
                              company: companySettings,
                              issuedInvoices: invoices.filter(
                                (i) => i.status !== 'Borrador' && i.issueDate >= start && i.issueDate <= end
                              ),
                              expenses: expenses.filter((e) => e.date >= start && e.date <= end),
                              documents: documents.filter((d) => d.uploadDate >= start && d.uploadDate <= end),
                              incidences: pkg.incidences || [],
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 border border-[#ECEEEB] rounded hover:bg-[#F8F8F5]"
                        >
                          <Archive className="w-3 h-3" />
                          ZIP
                        </button>
                        {permissions.canWriteFiscal && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeliveryPkg(pkg);
                              setDeliveryForm({
                                sentDate: pkg.sentDate || todayIso(),
                                recipientName:
                                  pkg.recipientName || companySettings?.gestorName || companySettings?.gestorFirm || '',
                                recipientEmail: pkg.recipientEmail || companySettings?.gestorEmail || '',
                                observations: pkg.observations || '',
                                status:
                                  pkg.status === 'Preparado para revisión'
                                    ? 'Enviado al gestor'
                                    : pkg.status,
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#203C35] text-white rounded"
                          >
                            <Send className="w-3 h-3" />
                            Registrar envío
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
      )}

      {/* Fiscal Obligation Modal */}
      <Modal
        open={obModalOpen}
        onClose={() => setObModalOpen(false)}
        title={editingOb ? `Actualizar ${editingOb.modelCode}` : 'Añadir modelo fiscal'}
      >
        <form onSubmit={handleSaveObligation} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="font-medium">Código modelo *</span>
              <input
                type="text"
                required
                value={obForm.modelCode}
                onChange={(e) => setObForm({ ...obForm, modelCode: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Periodo *</span>
              <input
                type="text"
                required
                value={obForm.period}
                onChange={(e) => setObForm({ ...obForm, period: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium">Nombre descriptivo *</span>
              <input
                type="text"
                required
                value={obForm.modelName}
                onChange={(e) => setObForm({ ...obForm, modelName: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Fecha límite *</span>
              <input
                type="date"
                required
                value={obForm.dueDate}
                onChange={(e) => setObForm({ ...obForm, dueDate: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Estado</span>
              <select
                value={obForm.status}
                onChange={(e) => setObForm({ ...obForm, status: e.target.value as FiscalStatus })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                {FISCAL_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-medium">Responsable</span>
              <input
                type="text"
                value={obForm.responsibleName}
                onChange={(e) => setObForm({ ...obForm, responsibleName: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Fecha de presentación</span>
              <input
                type="date"
                value={obForm.submissionDate}
                onChange={(e) => setObForm({ ...obForm, submissionDate: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium">Documentación necesaria</span>
              <input
                type="text"
                value={obForm.requiredDocs}
                onChange={(e) => setObForm({ ...obForm, requiredDocs: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium">Adjuntar justificante de presentación (PDF)</span>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => setObReceiptFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md bg-[#F8F8F5]"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="font-medium">Observaciones</span>
              <textarea
                rows={2}
                value={obForm.notes}
                onChange={(e) => setObForm({ ...obForm, notes: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[#ECEEEB]">
            <button type="button" onClick={() => setObModalOpen(false)} className="px-4 py-2 border border-[#ECEEEB] rounded-md">
              Cancelar
            </button>
            <button type="submit" className="px-4 py-2 bg-[#203C35] text-white rounded-md">
              Guardar modelo
            </button>
          </div>
        </form>
      </Modal>

      {/* Gestoria Delivery Modal */}
      <Modal
        open={Boolean(deliveryPkg)}
        onClose={() => setDeliveryPkg(null)}
        title={`Envío a gestoría · ${deliveryPkg?.fiscalYear} ${deliveryPkg?.quarter}`}
        maxWidthClass="max-w-md"
      >
        {deliveryPkg && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              let receiptDocumentId = deliveryPkg.receiptDocumentId || '';
              if (deliveryReceiptFile) {
                const uploaded = await uploadDocumentToFirestore({
                  file: deliveryReceiptFile,
                  folder: 'Gestoría',
                  docType: 'Justificante recepción gestoría',
                  description: `Entrega ${deliveryPkg.fiscalYear} ${deliveryPkg.quarter}`,
                  uploadedByUid: operatorUid,
                  uploadedByName: profile?.displayName || 'Dirección · Temis Atrile',
                });
                receiptDocumentId = uploaded.id;
              }
              await saveGestoriaPackage(
                {
                  fiscalYear: deliveryPkg.fiscalYear,
                  quarter: deliveryPkg.quarter,
                  status: deliveryForm.status,
                  sentDate: deliveryForm.sentDate,
                  recipientName: deliveryForm.recipientName,
                  recipientEmail: deliveryForm.recipientEmail,
                  observations: deliveryForm.observations,
                  issuedBase: deliveryPkg.issuedBase,
                  issuedVat: deliveryPkg.issuedVat,
                  receivedBase: deliveryPkg.receivedBase,
                  receivedVat: deliveryPkg.receivedVat,
                  issuedCount: deliveryPkg.issuedCount,
                  expensesCount: deliveryPkg.expensesCount,
                  missingDocsCount: deliveryPkg.missingDocsCount,
                  incidences: deliveryPkg.incidences,
                  ...(receiptDocumentId ? { receiptDocumentId } : {}),
                },
                deliveryPkg.id
              );
              setDeliveryPkg(null);
              setDeliveryReceiptFile(null);
            }}
            className="space-y-3 text-xs"
          >
            <label className="block space-y-1">
              <span className="font-medium">Estado del envío</span>
              <select
                value={deliveryForm.status}
                onChange={(e) => setDeliveryForm({ ...deliveryForm, status: e.target.value as GestoriaPackage['status'] })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              >
                <option value="Preparado para revisión">Preparado para revisión</option>
                <option value="Enviado al gestor">Enviado al gestor</option>
                <option value="Recibido por gestor">Recibido por gestor</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="font-medium">Fecha de envío</span>
              <input
                type="date"
                value={deliveryForm.sentDate}
                onChange={(e) => setDeliveryForm({ ...deliveryForm, sentDate: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-medium">Destinatario / Asesoría</span>
              <input
                type="text"
                value={deliveryForm.recipientName}
                onChange={(e) => setDeliveryForm({ ...deliveryForm, recipientName: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-medium">Email destinatario</span>
              <input
                type="email"
                value={deliveryForm.recipientEmail}
                onChange={(e) => setDeliveryForm({ ...deliveryForm, recipientEmail: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-medium">Adjuntar acuse o documentación del gestor</span>
              <input
                type="file"
                onChange={(e) => setDeliveryReceiptFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md bg-[#F8F8F5]"
              />
            </label>
            <label className="block space-y-1">
              <span className="font-medium">Observaciones</span>
              <textarea
                rows={2}
                value={deliveryForm.observations}
                onChange={(e) => setDeliveryForm({ ...deliveryForm, observations: e.target.value })}
                className="w-full px-3 py-2 border border-[#ECEEEB] rounded-md"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#ECEEEB]">
              <button type="button" onClick={() => setDeliveryPkg(null)} className="px-3 py-2 border border-[#ECEEEB] rounded-md">
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 bg-[#203C35] text-white rounded-md">
                Guardar registro
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
