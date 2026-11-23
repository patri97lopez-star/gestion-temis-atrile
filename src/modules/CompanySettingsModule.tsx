import React, { useEffect, useState } from 'react';
import { Building2, ImagePlus, Lock, Save, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useErpData } from '../context/ErpDataContext';

export const CompanySettingsModule: React.FC = () => {
  const { permissions } = useAuth();
  const { companySettings, saveCompanySettings, notify } = useErpData();

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    tradeName: 'Gestión Temis Atrile',
    legalName: 'TEMIS ATRILE E.S.P.J.',
    taxId: '',
    fiscalAddress: '',
    postalCode: '',
    city: '',
    province: '',
    phone: '',
    email: '',
    iban: '',
    bankName: '',
    logoDataUrl: '',
    invoiceSeriesText: 'F-2026, R-2026',
    vatRatesText: '21, 10, 4, 0',
    retentionRatesText: '0, 7, 15',
    currentFiscalYear: new Date().getFullYear(),
    gestorName: '',
    gestorFirm: '',
    gestorEmail: '',
    gestorPhone: '',
    notifyDaysBeforeDue: 7,
    notifyFiscalDaysBefore: 10,
  });

  useEffect(() => {
    if (!companySettings) return;
    setForm({
      tradeName:
        companySettings.tradeName && companySettings.tradeName !== 'GESTIÓN360'
          ? companySettings.tradeName
          : 'Gestión Temis Atrile',
      legalName:
        companySettings.legalName && companySettings.legalName !== 'Mi Empresa S.L.'
          ? companySettings.legalName
          : 'TEMIS ATRILE E.S.P.J.',
      taxId: companySettings.taxId || '',
      fiscalAddress: companySettings.fiscalAddress || '',
      postalCode: companySettings.postalCode || '',
      city: companySettings.city || '',
      province: companySettings.province || '',
      phone: companySettings.phone || '',
      email: companySettings.email || '',
      iban: companySettings.iban || '',
      bankName: companySettings.bankName || '',
      logoDataUrl: companySettings.logoDataUrl || '',
      invoiceSeriesText: (companySettings.invoiceSeries || ['F-2026', 'R-2026']).join(', '),
      vatRatesText: (companySettings.vatRates || [21, 10, 4, 0]).join(', '),
      retentionRatesText: (companySettings.retentionRates || [0, 7, 15]).join(', '),
      currentFiscalYear: companySettings.currentFiscalYear || new Date().getFullYear(),
      gestorName: companySettings.gestorName || '',
      gestorFirm: companySettings.gestorFirm || '',
      gestorEmail: companySettings.gestorEmail || '',
      gestorPhone: companySettings.gestorPhone || '',
      notifyDaysBeforeDue: companySettings.notifyDaysBeforeDue ?? 7,
      notifyFiscalDaysBefore: companySettings.notifyFiscalDaysBefore ?? 10,
    });
  }, [companySettings]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 180_000) {
      notify('error', 'El logotipo debe pesar menos de 180 KB para incluirse en los PDF.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((prev) => ({ ...prev, logoDataUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissions.canEditSettings) {
      notify('error', 'Solo los administradores pueden modificar la configuración de empresa.');
      return;
    }
    if (!form.tradeName.trim() || !form.legalName.trim() || !form.taxId.trim()) {
      notify('error', 'Nombre comercial, razón social y CIF/NIF son obligatorios.');
      return;
    }

    const invoiceSeries = form.invoiceSeriesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const vatRates = form.vatRatesText
      .split(',')
      .map((n) => Number(n.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0);
    const retentionRates = form.retentionRatesText
      .split(',')
      .map((n) => Number(n.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0);

    setSaving(true);
    try {
      await saveCompanySettings({
        tradeName: form.tradeName.trim(),
        legalName: form.legalName.trim(),
        taxId: form.taxId.trim().toUpperCase(),
        fiscalAddress: form.fiscalAddress.trim(),
        postalCode: form.postalCode.trim(),
        city: form.city.trim(),
        province: form.province.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        iban: form.iban.trim().toUpperCase(),
        bankName: form.bankName.trim(),
        logoDataUrl: form.logoDataUrl || undefined,
        invoiceSeries: invoiceSeries.length > 0 ? invoiceSeries : ['F-2026', 'R-2026'],
        vatRates: vatRates.length > 0 ? vatRates : [21, 10, 4, 0],
        retentionRates: retentionRates.length > 0 ? retentionRates : [0, 7, 15],
        currentFiscalYear: Number(form.currentFiscalYear) || new Date().getFullYear(),
        gestorName: form.gestorName.trim(),
        gestorFirm: form.gestorFirm.trim(),
        gestorEmail: form.gestorEmail.trim(),
        gestorPhone: form.gestorPhone.trim(),
        notifyDaysBeforeDue: Number(form.notifyDaysBeforeDue) || 7,
        notifyFiscalDaysBefore: Number(form.notifyFiscalDaysBefore) || 10,
      });
    } finally {
      setSaving(false);
    }
  };

  const disabled = !permissions.canEditSettings;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {disabled && (
        <div className="bg-white border border-[#ECEEEB] rounded-lg p-4 flex items-center gap-2.5 text-xs text-[#252B28]/80">
          <Lock className="w-4 h-4 text-[#C6A879] shrink-0" />
          <span>
            Vista de solo lectura. Únicamente el perfil <strong>Administrador</strong> puede modificar los datos fiscales y series de facturación.
          </span>
        </div>
      )}

      {/* Fiscal Identity & Logo */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2 text-[#203C35]">
            <Building2 className="w-4 h-4 text-[#C6A879]" />
            <h2 className="text-sm font-semibold">Datos identificativos y domicilio fiscal</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Nombre comercial *
              </label>
              <input
                type="text"
                required
                disabled={disabled}
                value={form.tradeName}
                onChange={(e) => setForm((f) => ({ ...f, tradeName: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md disabled:bg-[#F8F8F5]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Razón social *
              </label>
              <input
                type="text"
                required
                disabled={disabled}
                value={form.legalName}
                onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md disabled:bg-[#F8F8F5]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                CIF / NIF *
              </label>
              <input
                type="text"
                required
                disabled={disabled}
                value={form.taxId}
                onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md font-mono-tabular disabled:bg-[#F8F8F5]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Correo electrónico corporativo
              </label>
              <input
                type="email"
                disabled={disabled}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md disabled:bg-[#F8F8F5]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Dirección fiscal
              </label>
              <input
                type="text"
                disabled={disabled}
                value={form.fiscalAddress}
                onChange={(e) => setForm((f) => ({ ...f, fiscalAddress: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md disabled:bg-[#F8F8F5]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Código postal
              </label>
              <input
                type="text"
                disabled={disabled}
                value={form.postalCode}
                onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md font-mono-tabular disabled:bg-[#F8F8F5]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Localidad
              </label>
              <input
                type="text"
                disabled={disabled}
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md disabled:bg-[#F8F8F5]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Provincia
              </label>
              <input
                type="text"
                disabled={disabled}
                value={form.province}
                onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md disabled:bg-[#F8F8F5]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Teléfono
              </label>
              <input
                type="text"
                disabled={disabled}
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md font-mono-tabular disabled:bg-[#F8F8F5]"
              />
            </div>
          </div>
        </div>

        {/* Logo Card */}
        <div className="lg:col-span-4 bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[#203C35]">Logotipo para PDFs</h3>
          <p className="text-xs text-[#252B28]/65">
            Se mostrará en la cabecera de facturas, presupuestos e informes exportados en PDF.
          </p>

          <div className="h-36 bg-[#F8F8F5] border border-[#ECEEEB] rounded-md flex items-center justify-center p-4">
            {form.logoDataUrl ? (
              <img
                src={form.logoDataUrl}
                alt="Logotipo corporativo"
                className="max-h-28 max-w-full object-contain"
              />
            ) : (
              <span className="text-xs text-[#252B28]/50">Sin logotipo cargado</span>
            )}
          </div>

          {!disabled && (
            <div className="flex items-center gap-2">
              <label className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#F8F8F5] text-[#203C35] border border-[#ECEEEB] rounded-md hover:bg-[#ECEEEB] cursor-pointer">
                <ImagePlus className="w-3.5 h-3.5" />
                Subir imagen (&lt;180 KB)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </label>
              {form.logoDataUrl && (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, logoDataUrl: '' }))}
                  className="p-2 text-[#B42318] border border-[#ECEEEB] rounded-md hover:bg-red-50"
                  title="Quitar logotipo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Banking & Billing Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[#203C35]">
            Datos bancarios y parámetros de facturación
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Entidad bancaria
              </label>
              <input
                type="text"
                disabled={disabled}
                value={form.bankName}
                onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md disabled:bg-[#F8F8F5]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Cuenta bancaria IBAN
              </label>
              <input
                type="text"
                disabled={disabled}
                value={form.iban}
                onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))}
                placeholder="ES00 0000 0000 00 0000000000"
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md font-mono-tabular disabled:bg-[#F8F8F5]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Ejercicio fiscal activo
              </label>
              <input
                type="number"
                disabled={disabled}
                value={form.currentFiscalYear}
                onChange={(e) =>
                  setForm((f) => ({ ...f, currentFiscalYear: Number(e.target.value) || new Date().getFullYear() }))
                }
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md font-mono-tabular disabled:bg-[#F8F8F5]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Series de facturación (separadas por coma)
              </label>
              <input
                type="text"
                disabled={disabled}
                value={form.invoiceSeriesText}
                onChange={(e) => setForm((f) => ({ ...f, invoiceSeriesText: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md font-mono-tabular disabled:bg-[#F8F8F5]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Tipos de IVA aplicables (%)
              </label>
              <input
                type="text"
                disabled={disabled}
                value={form.vatRatesText}
                onChange={(e) => setForm((f) => ({ ...f, vatRatesText: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md font-mono-tabular disabled:bg-[#F8F8F5]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Retenciones IRPF (%)
              </label>
              <input
                type="text"
                disabled={disabled}
                value={form.retentionRatesText}
                onChange={(e) => setForm((f) => ({ ...f, retentionRatesText: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md font-mono-tabular disabled:bg-[#F8F8F5]"
              />
            </div>
          </div>
        </div>

        {/* Gestoria & Alerts */}
        <div className="bg-white border border-[#ECEEEB] rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[#203C35]">
            Gestoría asignada y avisos preventivos
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Asesor / Gestor responsable
              </label>
              <input
                type="text"
                disabled={disabled}
                value={form.gestorName}
                onChange={(e) => setForm((f) => ({ ...f, gestorName: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md disabled:bg-[#F8F8F5]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Despacho / Asesoría
              </label>
              <input
                type="text"
                disabled={disabled}
                value={form.gestorFirm}
                onChange={(e) => setForm((f) => ({ ...f, gestorFirm: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md disabled:bg-[#F8F8F5]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Email de gestoría
              </label>
              <input
                type="email"
                disabled={disabled}
                value={form.gestorEmail}
                onChange={(e) => setForm((f) => ({ ...f, gestorEmail: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md disabled:bg-[#F8F8F5]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Teléfono gestoría
              </label>
              <input
                type="text"
                disabled={disabled}
                value={form.gestorPhone}
                onChange={(e) => setForm((f) => ({ ...f, gestorPhone: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md font-mono-tabular disabled:bg-[#F8F8F5]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Aviso vencimiento facturas (días antes)
              </label>
              <input
                type="number"
                min={0}
                max={60}
                disabled={disabled}
                value={form.notifyDaysBeforeDue}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notifyDaysBeforeDue: Number(e.target.value) || 0 }))
                }
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md font-mono-tabular disabled:bg-[#F8F8F5]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#252B28]/70 mb-1">
                Aviso vencimiento fiscal (días antes)
              </label>
              <input
                type="number"
                min={0}
                max={60}
                disabled={disabled}
                value={form.notifyFiscalDaysBefore}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notifyFiscalDaysBefore: Number(e.target.value) || 0 }))
                }
                className="w-full px-3 py-2 text-xs border border-[#ECEEEB] rounded-md font-mono-tabular disabled:bg-[#F8F8F5]"
              />
            </div>
          </div>
        </div>
      </div>

      {!disabled && (
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium bg-[#203C35] text-[#F8F8F5] rounded-md hover:bg-[#315348] disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Guardando configuración...' : 'Guardar configuración de empresa'}
          </button>
        </div>
      )}
    </form>
  );
};
