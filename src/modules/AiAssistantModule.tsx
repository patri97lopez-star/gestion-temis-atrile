import React, { useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  FileSearch,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  Upload,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useErpData } from '../context/ErpDataContext';
import { fileToBase64, MAX_UPLOAD_BYTES, uploadDocumentToFirestore } from '../lib/fileStorage';
import { formatCurrency, getQuarterDateRange, getQuarterFromDate, round2, todayIso } from '../lib/formatters';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../types/erp';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

interface OcrProposal {
  supplierName: string;
  supplierTaxId: string;
  invoiceNumber: string;
  issueDate: string;
  concept: string;
  taxBase: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  suggestedCategory: ExpenseCategory;
  confidenceNotes: string;
}

const SUGGESTED_PROMPTS = [
  '¿Cuánto hemos facturado este mes y cuál es el beneficio estimado?',
  '¿Qué clientes tienen facturas pendientes o vencidas de cobro?',
  '¿Qué gastos de este trimestre no tienen justificante documental adjunto?',
  '¿Cuál es el cliente más rentable y qué trabajos siguen abiertos?',
  '¿Qué obligaciones fiscales tenemos próximas a vencer?',
];

export const AiAssistantModule: React.FC = () => {
  const { operatorUid, profile, permissions, getIdToken } = useAuth();
  const {
    companySettings,
    clients,
    invoices,
    expenses,
    projects,
    quotes,
    suppliers,
    fiscalObligations,
    tasks,
    documents,
    saveExpense,
    logActivity,
    notify,
  } = useErpData();

  const [activeTab, setActiveTab] = useState<'assistant' | 'ocr'>('assistant');

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);

  // OCR state
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [savingOcr, setSavingOcr] = useState(false);
  const [ocrNotes, setOcrNotes] = useState('');
  const [ocrForm, setOcrForm] = useState<{
    supplierId: string;
    supplierName: string;
    supplierTaxId: string;
    invoiceNumber: string;
    date: string;
    concept: string;
    taxBase: number;
    vatRate: number;
    vatAmount: number;
    total: number;
    category: ExpenseCategory;
    status: 'Pendiente' | 'Pagado';
    paymentDate: string;
    clientId: string;
    projectId: string;
    notes: string;
  } | null>(null);

  // Authorized context snapshot computed from live Firestore state
  const contextSnapshot = useMemo(() => {
    const today = todayIso();
    const currentYear = new Date().getFullYear();
    const currentMonth = today.slice(0, 7);
    const currentQuarter = getQuarterFromDate(today) || { year: currentYear, quarter: '1T' as const };
    const qRange = getQuarterDateRange(currentQuarter.year, currentQuarter.quarter);

    const validInvoices = invoices.filter((i) => i.status !== 'Borrador');
    const monthlyInvoices = validInvoices.filter((i) => i.issueDate.startsWith(currentMonth));
    const annualInvoices = validInvoices.filter((i) => i.issueDate.startsWith(`${currentYear}-`));

    const monthlyExpenses = expenses.filter((e) => e.date.startsWith(currentMonth));
    const annualExpenses = expenses.filter((e) => e.date.startsWith(`${currentYear}-`));

    const pendingInvoices = validInvoices
      .filter(
        (i) =>
          i.status === 'Emitida' ||
          i.status === 'Pendiente de cobro' ||
          i.status === 'Parcialmente cobrada' ||
          i.status === 'Vencida'
      )
      .map((i) => ({
        number: i.number,
        clientName: i.clientName,
        issueDate: i.issueDate,
        dueDate: i.dueDate,
        total: i.total,
        paidAmount: i.paidAmount,
        pendingAmount: round2(Math.max(0, i.total - i.paidAmount)),
        status: i.status,
      }));

    const clientBillingMap: Record<string, { name: string; taxBase: number; expenses: number; invoiceCount: number }> = {};
    validInvoices.forEach((i) => {
      if (!clientBillingMap[i.clientId]) {
        clientBillingMap[i.clientId] = { name: i.clientName, taxBase: 0, expenses: 0, invoiceCount: 0 };
      }
      clientBillingMap[i.clientId].taxBase = round2(clientBillingMap[i.clientId].taxBase + i.taxBase);
      clientBillingMap[i.clientId].invoiceCount += 1;
    });
    expenses.forEach((e) => {
      if (e.clientId && clientBillingMap[e.clientId]) {
        clientBillingMap[e.clientId].expenses = round2(clientBillingMap[e.clientId].expenses + e.taxBase);
      }
    });

    const topClients = Object.values(clientBillingMap)
      .map((c) => ({ ...c, estimatedMargin: round2(c.taxBase - c.expenses) }))
      .sort((a, b) => b.estimatedMargin - a.estimatedMargin)
      .slice(0, 12);

    const expenseByCategory: Record<string, number> = {};
    annualExpenses.forEach((e) => {
      expenseByCategory[e.category] = round2((expenseByCategory[e.category] || 0) + e.taxBase);
    });

    const quarterExpensesMissingDocs = expenses
      .filter((e) => e.date >= qRange.start && e.date <= qRange.end && !e.documentId)
      .map((e) => ({
        date: e.date,
        supplierName: e.supplierName,
        concept: e.concept,
        total: e.total,
      }));

    return {
      fechaReferencia: today,
      empresa: {
        nombreComercial: companySettings?.tradeName || 'Gestión Temis Atrile',
        razonSocial: companySettings?.legalName || 'TEMIS ATRILE E.S.P.J.',
        ejercicioActual: companySettings?.currentFiscalYear || currentYear,
      },
      resumenMesActual: {
        mes: currentMonth,
        facturacionBase: round2(monthlyInvoices.reduce((s, i) => s + i.taxBase, 0)),
        ivaRepercutido: round2(monthlyInvoices.reduce((s, i) => s + i.vatAmount, 0)),
        gastosBase: round2(monthlyExpenses.reduce((s, e) => s + e.taxBase, 0)),
        ivaSoportado: round2(monthlyExpenses.reduce((s, e) => s + e.vatAmount, 0)),
        beneficioEstimadoBase: round2(
          monthlyInvoices.reduce((s, i) => s + i.taxBase, 0) -
            monthlyExpenses.reduce((s, e) => s + e.taxBase, 0)
        ),
      },
      resumenAnual: {
        ejercicio: currentYear,
        facturacionBase: round2(annualInvoices.reduce((s, i) => s + i.taxBase, 0)),
        gastosBase: round2(annualExpenses.reduce((s, e) => s + e.taxBase, 0)),
        gastosPorCategoria: expenseByCategory,
      },
      clientesTotales: clients.filter((c) => !c.archived).length,
      clientesActivos: clients.filter((c) => !c.archived && c.status === 'activo').length,
      clientesRentabilidadTop: topClients,
      facturasPendientesCobro: pendingInvoices,
      trabajosAbiertos: projects
        .filter((p) => p.status !== 'Finalizado' && p.status !== 'Facturado')
        .map((p) => ({
          name: p.name,
          clientName: p.clientName,
          status: p.status,
          estimatedEndDate: p.estimatedEndDate,
          budgetedPrice: p.budgetedPrice,
          hoursSpent: p.hoursSpent,
        })),
      presupuestosPendientes: quotes
        .filter((q) => q.status === 'enviado' || q.status === 'aceptado')
        .map((q) => ({
          number: q.number,
          clientName: q.clientName,
          status: q.status,
          total: q.total,
          validUntil: q.validUntil,
        })),
      trimestreActual: `${currentQuarter.year} ${currentQuarter.quarter}`,
      gastosTrimestreSinJustificante: quarterExpensesMissingDocs,
      documentosArchivadosTotal: documents.length,
      obligacionesFiscalesPendientes: fiscalObligations
        .filter((f) => f.applicable && f.status !== 'Presentado' && f.status !== 'Justificante archivado')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 10)
        .map((f) => ({
          modelCode: f.modelCode,
          period: f.period,
          dueDate: f.dueDate,
          status: f.status,
        })),
      tareasPendientes: tasks
        .filter((t) => t.status !== 'Completada')
        .slice(0, 12)
        .map((t) => ({
          title: t.title,
          dueDate: t.dueDate,
          priority: t.priority,
          category: t.category,
        })),
    };
  }, [
    companySettings,
    clients,
    invoices,
    expenses,
    projects,
    quotes,
    fiscalObligations,
    tasks,
    documents.length,
  ]);

  const sendQuestion = async (promptText?: string) => {
    const queryText = (promptText ?? question).trim();
    if (!queryText || asking) return;
    if (!permissions.canUseAi) {
      notify('error', 'Tu rol no tiene acceso al asistente inteligente.');
      return;
    }

    const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: 'user', text: queryText };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!promptText) setQuestion('');
    setAsking(true);

    try {
      const token = await getIdToken();
      const resp = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question: queryText,
          history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
          contextSnapshot,
        }),
      });
      const payload = (await resp.json()) as { answer?: string; error?: string };
      if (!resp.ok) {
        throw new Error(payload.error || 'No se pudo obtener respuesta del asistente.');
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          text: payload.answer || 'Sin respuesta generada.',
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al consultar el asistente IA.';
      notify('error', msg);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          text: `No se pudo completar la consulta: ${msg}`,
        },
      ]);
    } finally {
      setAsking(false);
    }
  };

  const handleAnalyzeInvoice = async () => {
    if (!ocrFile) {
      notify('error', 'Selecciona una factura en PDF o imagen primero.');
      return;
    }
    if (ocrFile.size > MAX_UPLOAD_BYTES) {
      notify('error', 'El archivo supera el máximo permitido de 3,5 MB.');
      return;
    }

    setExtracting(true);
    try {
      const base64Data = await fileToBase64(ocrFile);
      const token = await getIdToken();
      const resp = await fetch('/api/ai/ocr-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mimeType: ocrFile.type || 'application/pdf',
          base64Data,
          fileName: ocrFile.name,
        }),
      });
      const payload = (await resp.json()) as { proposal?: OcrProposal; error?: string };
      if (!resp.ok || !payload.proposal) {
        throw new Error(payload.error || 'No se pudo analizar la factura.');
      }

      const p = payload.proposal;
      const validCat = EXPENSE_CATEGORIES.includes(p.suggestedCategory)
        ? p.suggestedCategory
        : 'Otros';
      const matchedSupplier = suppliers.find(
        (s) =>
          (p.supplierTaxId &&
            s.taxId.replace(/[^A-Z0-9]/gi, '').toUpperCase() ===
              p.supplierTaxId.replace(/[^A-Z0-9]/gi, '').toUpperCase()) ||
          s.name.toLowerCase().includes((p.supplierName || '').toLowerCase().slice(0, 8))
      );

      const safeBase = Number(p.taxBase) || 0;
      const safeVatRate = Number.isFinite(Number(p.vatRate)) ? Number(p.vatRate) : 21;
      const safeVatAmt = Number(p.vatAmount) || round2(safeBase * (safeVatRate / 100));
      const safeTotal = Number(p.total) || round2(safeBase + safeVatAmt);

      setOcrNotes(p.confidenceNotes || '');
      setOcrForm({
        supplierId: matchedSupplier?.id || '',
        supplierName: matchedSupplier?.name || p.supplierName || '',
        supplierTaxId: matchedSupplier?.taxId || p.supplierTaxId || '',
        invoiceNumber: p.invoiceNumber || '',
        date: /^\d{4}-\d{2}-\d{2}$/.test(p.issueDate || '') ? p.issueDate : todayIso(),
        concept: p.concept || ocrFile.name,
        taxBase: safeBase,
        vatRate: safeVatRate,
        vatAmount: safeVatAmt,
        total: safeTotal,
        category: validCat,
        status: 'Pendiente',
        paymentDate: '',
        clientId: '',
        projectId: '',
        notes: 'Propuesta extraída mediante lectura asistida OCR y verificada manualmente.',
      });
      notify('info', 'Campos propuestos listos. Revísalos antes de confirmar el guardado.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Error en la lectura OCR.');
    } finally {
      setExtracting(false);
    }
  };

  const handleConfirmOcrSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ocrForm || !ocrFile) return;
    if (!permissions.canWriteExpenses || !permissions.canWriteDocuments) {
      notify('error', 'Tu rol no tiene permisos para registrar gastos y documentos.');
      return;
    }
    if (!ocrForm.supplierName.trim() || !ocrForm.concept.trim()) {
      notify('error', 'Indica al menos el proveedor y el concepto de la factura.');
      return;
    }

    setSavingOcr(true);
    try {
      const uploadedDoc = await uploadDocumentToFirestore({
        file: ocrFile,
        folder: 'Proveedores',
        docType: 'Factura recibida',
        description: `Factura ${ocrForm.invoiceNumber || ''} · ${ocrForm.supplierName}`.trim(),
        supplierId: ocrForm.supplierId || undefined,
        clientId: ocrForm.clientId || undefined,
        projectId: ocrForm.projectId || undefined,
        tags: ['OCR', ocrForm.category],
        uploadedByUid: operatorUid,
        uploadedByName: profile?.displayName || 'Dirección · Temis Atrile',
      });

      await saveExpense({
        supplierId: ocrForm.supplierId || undefined,
        supplierName: ocrForm.supplierName.trim(),
        supplierTaxId: ocrForm.supplierTaxId.trim().toUpperCase(),
        invoiceNumber: ocrForm.invoiceNumber.trim(),
        date: ocrForm.date,
        concept: ocrForm.concept.trim(),
        taxBase: Number(ocrForm.taxBase) || 0,
        vatRate: Number(ocrForm.vatRate) || 0,
        vatAmount: Number(ocrForm.vatAmount) || 0,
        total: Number(ocrForm.total) || 0,
        category: ocrForm.category,
        status: ocrForm.status,
        paymentDate: ocrForm.status === 'Pagado' ? ocrForm.paymentDate || ocrForm.date : undefined,
        clientId: ocrForm.clientId || undefined,
        projectId: ocrForm.projectId || undefined,
        documentId: uploadedDoc.id,
        notes: ocrForm.notes,
      });

      await logActivity(
        'Guardó factura recibida desde OCR',
        'Inteligencia Artificial',
        uploadedDoc.id,
        `${ocrForm.supplierName} (${formatCurrency(ocrForm.total)})`
      );
      setOcrFile(null);
      setOcrForm(null);
      setOcrNotes('');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'No se pudo guardar la factura.');
    } finally {
      setSavingOcr(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="bg-white border border-[#ECEEEB] rounded-lg p-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('assistant')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'assistant'
              ? 'bg-[#203C35] text-[#F8F8F5]'
              : 'text-[#252B28]/75 hover:bg-[#F8F8F5]'
          }`}
        >
          <Bot className="w-4 h-4" />
          Asistente Empresarial IA
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ocr')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'ocr'
              ? 'bg-[#203C35] text-[#F8F8F5]'
              : 'text-[#252B28]/75 hover:bg-[#F8F8F5]'
          }`}
        >
          <FileSearch className="w-4 h-4" />
          Lectura de Facturas (OCR)
        </button>
      </div>

      {activeTab === 'assistant' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Quick Prompts Sidebar */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#C6A879]" />
                <h2 className="text-sm font-semibold text-[#203C35]">Consultas sugeridas</h2>
              </div>
              <p className="text-xs text-[#252B28]/70 leading-relaxed">
                El asistente analiza exclusivamente los registros reales y autorizados de tu empresa en tiempo real.
              </p>
              <div className="space-y-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={asking}
                    onClick={() => sendQuestion(prompt)}
                    className="w-full text-left px-3 py-2.5 text-xs text-[#252B28] bg-[#F8F8F5] border border-[#ECEEEB] rounded-md hover:border-[#315348] hover:bg-white transition-colors disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white border border-[#ECEEEB] rounded-lg p-4 text-xs text-[#252B28]/70 space-y-1.5">
              <p className="font-semibold text-[#203C35]">Alcance y control</p>
              <p>
                Respuestas orientativas basadas en los datos cargados en Firestore ({invoices.length} facturas,{' '}
                {expenses.length} gastos, {clients.filter((c) => !c.archived).length} clientes). No ejecuta presentaciones fiscales ni movimientos bancarios.
              </p>
            </div>
          </div>

          {/* Chat Panel */}
          <div className="lg:col-span-8 bg-white border border-[#ECEEEB] rounded-lg flex flex-col min-h-[540px]">
            <div className="px-5 py-3.5 border-b border-[#ECEEEB] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#203C35]">
                  Analista de gestión y control interno
                </h3>
                <p className="text-xs text-[#252B28]/60">
                  Pregunta sobre facturación, cobros pendientes, rentabilidad, proyectos o cierre trimestral.
                </p>
              </div>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[#252B28]/70 hover:text-[#203C35] border border-[#ECEEEB] rounded-md"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Limpiar
                </button>
              )}
            </div>

            <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[460px]">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 space-y-3">
                  <div className="w-10 h-10 rounded-md bg-[#F8F8F5] border border-[#ECEEEB] flex items-center justify-center text-[#203C35]">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="max-w-md space-y-1">
                    <p className="text-sm font-medium text-[#203C35]">
                      Listo para analizar la situación de {companySettings?.tradeName || 'tu empresa'}
                    </p>
                    <p className="text-xs text-[#252B28]/65">
                      Selecciona una consulta sugerida o escribe tu pregunta abajo. Si faltan datos registrados, te lo indicará con transparencia.
                    </p>
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-[#203C35] text-[#F8F8F5]'
                          : 'bg-[#F8F8F5] border border-[#ECEEEB] text-[#252B28]'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
              {asking && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#F8F8F5] border border-[#ECEEEB] rounded-lg text-xs text-[#252B28]/70">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#203C35]" />
                    Analizando datos autorizados de la empresa...
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendQuestion();
              }}
              className="p-4 border-t border-[#ECEEEB] flex items-center gap-2"
            >
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ej: ¿Qué facturas vencidas tenemos pendientes de cobro?"
                maxLength={2000}
                className="flex-1 px-3 py-2 text-xs bg-[#F8F8F5] border border-[#ECEEEB] rounded-md focus:outline-none focus:border-[#203C35]"
              />
              <button
                type="submit"
                disabled={asking || !question.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#203C35] text-[#F8F8F5] rounded-md hover:bg-[#315348] disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                Consultar
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Upload & Extract Panel */}
          <div className="lg:col-span-5 bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-[#203C35]">
                1. Subir factura de proveedor para lectura OCR
              </h2>
              <p className="text-xs text-[#252B28]/65">
                Formatos admitidos: PDF, JPG, PNG o WEBP (máximo 3,5 MB). La IA propondrá los campos para que los verifiques antes de registrar el gasto.
              </p>
            </div>

            <label className="block border border-dashed border-[#C6A879] bg-[#F8F8F5] rounded-lg p-6 text-center cursor-pointer hover:bg-[#ECEEEB]/40 transition-colors">
              <input
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const selected = e.target.files?.[0] || null;
                  setOcrFile(selected);
                  setOcrForm(null);
                  setOcrNotes('');
                }}
                className="hidden"
              />
              <Upload className="w-6 h-6 text-[#203C35] mx-auto mb-2" />
              <p className="text-xs font-medium text-[#203C35]">
                {ocrFile ? ocrFile.name : 'Haz clic para seleccionar factura o recibo'}
              </p>
              <p className="text-[11px] text-[#252B28]/60 mt-1">
                {ocrFile
                  ? `${(ocrFile.size / 1024).toFixed(0)} KB · ${ocrFile.type || 'archivo'}`
                  : 'PDF, JPG, PNG o WEBP'}
              </p>
            </label>

            <button
              type="button"
              disabled={!ocrFile || extracting}
              onClick={handleAnalyzeInvoice}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium bg-[#203C35] text-[#F8F8F5] rounded-md hover:bg-[#315348] disabled:opacity-50 transition-colors"
            >
              {extracting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extrayendo campos de la factura...
                </>
              ) : (
                <>
                  <FileSearch className="w-4 h-4" />
                  Extraer datos con OCR
                </>
              )}
            </button>

            {ocrNotes && (
              <div className="p-3 bg-[#F8F8F5] border border-[#C6A879]/50 rounded-md text-xs text-[#252B28] space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-[#203C35]">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#C6A879]" />
                  Observaciones de lectura
                </div>
                <p className="text-[#252B28]/80">{ocrNotes}</p>
              </div>
            )}
          </div>

          {/* Review & Confirm Panel */}
          <div className="lg:col-span-7 bg-white border border-[#ECEEEB] rounded-lg p-5">
            <h2 className="text-sm font-semibold text-[#203C35] mb-1">
              2. Revisión y confirmación obligatoria antes de guardar
            </h2>
            <p className="text-xs text-[#252B28]/65 mb-4">
              Ningún dato se registra automáticamente sin tu validación explícita.
            </p>

            {!ocrForm ? (
              <div className="py-16 text-center text-xs text-[#252B28]/60 border border-[#ECEEEB] rounded-md bg-[#F8F8F5]">
                Sube una factura y pulsa &ldquo;Extraer datos con OCR&rdquo; para revisar la propuesta aquí.
              </div>
            ) : (
              <form onSubmit={handleConfirmOcrSave} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                      Vincular a proveedor existente (opcional)
                    </label>
                    <select
                      value={ocrForm.supplierId}
                      onChange={(e) => {
                        const sup = suppliers.find((s) => s.id === e.target.value);
                        setOcrForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                supplierId: e.target.value,
                                supplierName: sup ? sup.name : prev.supplierName,
                                supplierTaxId: sup ? sup.taxId : prev.supplierTaxId,
                              }
                            : null
                        );
                      }}
                      className="w-full px-3 py-2 text-xs bg-[#F8F8F5] border border-[#ECEEEB] rounded-md"
                    >
                      <option value="">-- Proveedor libre / nuevo --</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.taxId})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                      Categoría del gasto *
                    </label>
                    <select
                      value={ocrForm.category}
                      onChange={(e) =>
                        setOcrForm((prev) =>
                          prev ? { ...prev, category: e.target.value as ExpenseCategory } : null
                        )
                      }
                      className="w-full px-3 py-2 text-xs bg-white border border-[#ECEEEB] rounded-md"
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                      Razón social / Proveedor *
                    </label>
                    <input
                      type="text"
                      required
                      value={ocrForm.supplierName}
                      onChange={(e) =>
                        setOcrForm((prev) => (prev ? { ...prev, supplierName: e.target.value } : null))
                      }
                      className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                      CIF / NIF proveedor
                    </label>
                    <input
                      type="text"
                      value={ocrForm.supplierTaxId}
                      onChange={(e) =>
                        setOcrForm((prev) => (prev ? { ...prev, supplierTaxId: e.target.value } : null))
                      }
                      className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md font-mono-tabular"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                      Nº de factura recibida
                    </label>
                    <input
                      type="text"
                      value={ocrForm.invoiceNumber}
                      onChange={(e) =>
                        setOcrForm((prev) => (prev ? { ...prev, invoiceNumber: e.target.value } : null))
                      }
                      className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md font-mono-tabular"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                      Fecha factura *
                    </label>
                    <input
                      type="date"
                      required
                      value={ocrForm.date}
                      onChange={(e) =>
                        setOcrForm((prev) => (prev ? { ...prev, date: e.target.value } : null))
                      }
                      className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md font-mono-tabular"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                      Concepto *
                    </label>
                    <input
                      type="text"
                      required
                      value={ocrForm.concept}
                      onChange={(e) =>
                        setOcrForm((prev) => (prev ? { ...prev, concept: e.target.value } : null))
                      }
                      className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                      Base imponible (€) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={ocrForm.taxBase}
                      onChange={(e) => {
                        const base = Number(e.target.value) || 0;
                        setOcrForm((prev) => {
                          if (!prev) return null;
                          const vat = round2(base * (prev.vatRate / 100));
                          return { ...prev, taxBase: base, vatAmount: vat, total: round2(base + vat) };
                        });
                      }}
                      className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md font-mono-tabular"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                      Tipo IVA (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={ocrForm.vatRate}
                      onChange={(e) => {
                        const rate = Number(e.target.value) || 0;
                        setOcrForm((prev) => {
                          if (!prev) return null;
                          const vat = round2(prev.taxBase * (rate / 100));
                          return { ...prev, vatRate: rate, vatAmount: vat, total: round2(prev.taxBase + vat) };
                        });
                      }}
                      className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md font-mono-tabular"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                      IVA soportado (€)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={ocrForm.vatAmount}
                      onChange={(e) => {
                        const vat = Number(e.target.value) || 0;
                        setOcrForm((prev) =>
                          prev ? { ...prev, vatAmount: vat, total: round2(prev.taxBase + vat) } : null
                        );
                      }}
                      className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md font-mono-tabular"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                      Total factura (€) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={ocrForm.total}
                      onChange={(e) =>
                        setOcrForm((prev) =>
                          prev ? { ...prev, total: Number(e.target.value) || 0 } : null
                        )
                      }
                      className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md font-semibold text-[#203C35] font-mono-tabular"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                      Estado de pago
                    </label>
                    <select
                      value={ocrForm.status}
                      onChange={(e) =>
                        setOcrForm((prev) =>
                          prev ? { ...prev, status: e.target.value as 'Pendiente' | 'Pagado' } : null
                        )
                      }
                      className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md"
                    >
                      <option value="Pendiente">Pendiente</option>
                      <option value="Pagado">Pagado</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                      Cliente imputado (opcional)
                    </label>
                    <select
                      value={ocrForm.clientId}
                      onChange={(e) =>
                        setOcrForm((prev) => (prev ? { ...prev, clientId: e.target.value } : null))
                      }
                      className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md"
                    >
                      <option value="">-- Gasto general de estructura --</option>
                      {clients
                        .filter((c) => !c.archived)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {(!permissions.canWriteExpenses || !permissions.canWriteDocuments) && (
                  <p className="text-xs text-[#B42318]">
                    Tu rol actual ({profile?.role}) no tiene permisos para guardar gastos o documentos.
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#ECEEEB]">
                  <button
                    type="button"
                    onClick={() => {
                      setOcrForm(null);
                      setOcrNotes('');
                    }}
                    className="px-4 py-2 text-xs font-medium text-[#252B28] border border-[#ECEEEB] rounded-md hover:bg-[#F8F8F5]"
                  >
                    Descartar propuesta
                  </button>
                  <button
                    type="submit"
                    disabled={savingOcr || !permissions.canWriteExpenses || !permissions.canWriteDocuments}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#203C35] text-[#F8F8F5] rounded-md hover:bg-[#315348] disabled:opacity-50"
                  >
                    {savingOcr ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Guardando gasto y PDF...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Confirmar y guardar gasto + justificante
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
