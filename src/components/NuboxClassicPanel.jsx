import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseService } from '../utils/supabaseService';
import { fetchIndicatorRate, buildInvoiceDescription } from '../utils/billingHelpers';
import { COMUNAS_CHILE, findComunaByName } from '../utils/comunasChile';
import { formatRut } from '../utils/validation';

// Emisión con la API clásica de Nubox: la llamada es síncrona (sin cola ni polling).
const REFERENCE_LABELS = { '801': 'Orden de Compra', HES: 'Hoja de Entrada de Servicio' };

const toIsoDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
};
const formatDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '-');
const formatCLP = (amount) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.round(amount || 0));

const labelClass = 'font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider block';
const inputClass = 'w-full border border-outline-variant rounded-lg p-sm focus:border-secondary focus:ring-1 focus:ring-secondary/20 outline-none transition-all font-body-md text-body-md bg-white';
const readOnlyClass = 'w-full border border-outline-variant/60 rounded-lg p-sm font-body-md text-body-md bg-slate-50 text-on-surface-variant';
const footerClass = 'pt-lg flex justify-end gap-md border-t border-outline-variant/30 sticky bottom-0 bg-white z-10';
const cancelButtonClass = 'px-lg py-sm font-semibold text-on-surface-variant hover:text-on-surface transition-all';
const primaryButtonClass = 'bg-primary text-white px-xl py-sm rounded-lg font-semibold shadow-sm hover:bg-primary-container active:scale-95 transition-all flex items-center gap-xs disabled:opacity-60';

const DateInput = ({ value, onChange, disabled, min }) => (
  <div className="relative flex items-center">
    <input type="text" readOnly value={formatDate(value)} placeholder="dd/mm/yyyy" className={`${inputClass} pr-10`} />
    <input
      type="date"
      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      value={value}
      min={min}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[20px]">calendar_month</span>
  </div>
);

export default function NuboxClassicPanel({
  installment,
  budget,
  project,
  razonSocial,
  totalQuotas,
  defaultTaxPercent,
  environment,
  existingDocument,
  onDocumentChange,
  onSendInvoiceEmail,
  onClose
}) {
  const currency = (installment.currency || 'UF').toUpperCase();
  const plannedAmount = parseFloat(installment.uf) || 0;

  const [doc, setDoc] = useState(existingDocument || null);
  const [step, setStep] = useState(existingDocument?.status === 'issued' ? 'done' : 'form');

  // Receptor (prefilled from CRM)
  const [giro, setGiro] = useState(razonSocial?.giro || '');
  const [address, setAddress] = useState(razonSocial?.address || '');
  const [comunaCode, setComunaCode] = useState(findComunaByName(razonSocial?.comuna)?.code || '');
  const [city, setCity] = useState(razonSocial?.ciudad || '');
  const [email, setEmail] = useState(razonSocial?.email || '');
  const [contactName, setContactName] = useState(razonSocial?.name || '');
  const [updateClient, setUpdateClient] = useState(true);

  // Document
  const [rate, setRate] = useState('');
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  const [rateError, setRateError] = useState(false);
  const [taxPercent, setTaxPercent] = useState(Number(defaultTaxPercent) === 0 ? '0' : '19');
  const [paymentFormId, setPaymentFormId] = useState('2');
  const [termsDays, setTermsDays] = useState('30');
  const [dueDate, setDueDate] = useState(addDays(30));
  const [description, setDescription] = useState('');
  const [descriptionEdited, setDescriptionEdited] = useState(false);
  const [reference, setReference] = useState(installment.oc ? { type: '801', number: installment.oc, date: '' } : null);
  const [comment, setComment] = useState('');
  // Por defecto se genera un borrador en Nubox (emitir=false); la emisión definitiva es opt-in.
  const [emitir, setEmitir] = useState(false);

  const [validationErrors, setValidationErrors] = useState([]);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [isRetryingPdf, setIsRetryingPdf] = useState(false);

  const onDocumentChangeRef = useRef(onDocumentChange);
  onDocumentChangeRef.current = onDocumentChange;

  const today = toIsoDate(new Date());
  const parsedRate = currency === 'CLP' ? 1 : parseFloat(rate) || 0;
  const net = Math.round(plannedAmount * parsedRate);
  const isExempt = taxPercent === '0';
  const tax = isExempt ? 0 : Math.round(net * 0.19);
  const total = net + tax;
  const comunaName = COMUNAS_CHILE.find(c => c.code === comunaCode)?.name || '';
  const sortedComunas = useMemo(() => [...COMUNAS_CHILE].sort((a, b) => a.name.localeCompare(b.name, 'es')), []);
  const taxMismatch = defaultTaxPercent !== undefined && defaultTaxPercent !== null && ![0, 19].includes(Number(defaultTaxPercent));

  // Each lookup gets an id; cancelling bumps it so a late response can't overwrite a manual value.
  const rateRequestRef = useRef(0);

  const cancelRateLookup = () => {
    rateRequestRef.current += 1;
    setIsFetchingRate(false);
  };

  const loadRate = async () => {
    if (currency === 'CLP') return;
    const requestId = ++rateRequestRef.current;
    setIsFetchingRate(true);
    setRateError(false);
    try {
      const value = await fetchIndicatorRate(today, currency);
      if (requestId === rateRequestRef.current) setRate(String(value));
    } catch (err) {
      console.error(`Error fetching ${currency} rate:`, err);
      if (requestId === rateRequestRef.current) setRateError(true);
    } finally {
      if (requestId === rateRequestRef.current) setIsFetchingRate(false);
    }
  };

  useEffect(() => {
    if (step === 'form') loadRate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the default description in sync with the amount until the user edits it.
  useEffect(() => {
    if (descriptionEdited) return;
    setDescription(buildInvoiceDescription({
      numQuota: installment.numQuota,
      totalQuotas,
      projectName: project?.rawProjectName || '',
      budgetNumber: budget?.quoteId || '',
      plannedAmount,
      currency,
      netClp: net
    }));
  }, [descriptionEdited, installment.numQuota, totalQuotas, project, budget, plannedAmount, currency, net]);

  useEffect(() => {
    if (!doc?.pdfPath) {
      setPdfUrl('');
      return;
    }
    supabaseService.getInvoicePdfUrl(doc.pdfPath).then(setPdfUrl).catch(err => console.error('Error obteniendo PDF:', err));
  }, [doc?.pdfPath]);

  const handleTermsChange = (value) => {
    setTermsDays(value);
    const days = parseInt(value, 10);
    if (Number.isInteger(days) && days >= 0 && days <= 365) setDueDate(addDays(days));
  };

  const validate = () => {
    const errors = [];
    if (!razonSocial?.rut) errors.push('El cliente no tiene RUT registrado.');
    if (!giro.trim()) errors.push('Ingrese el giro del receptor.');
    if (!address.trim()) errors.push('Ingrese la dirección del receptor.');
    if (!comunaCode) errors.push('Seleccione la comuna del receptor.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push('El correo del receptor no es válido.');
    if (currency !== 'CLP' && !(parsedRate > 0)) errors.push(`Ingrese el valor ${currency === 'USD' ? 'del dólar' : 'de la UF'} del día.`);
    if (!(net > 0)) errors.push('El monto neto debe ser mayor a cero.');
    const days = Number(termsDays);
    if (!Number.isInteger(days) || days < 0 || days > 365) errors.push('Los términos de pago deben ser días entre 0 y 365.');
    if (!dueDate || dueDate < today) errors.push('La fecha de vencimiento debe ser hoy o posterior.');
    if (!description.trim()) errors.push('Ingrese la descripción de la factura.');
    if (reference && (!reference.number.trim() || !reference.date)) errors.push('Complete número y fecha de la referencia.');
    return errors;
  };

  const handleReview = (e) => {
    e.preventDefault();
    const errors = validate();
    setValidationErrors(errors);
    if (errors.length === 0) setStep('confirm');
  };

  const handleIssue = async () => {
    setIsSubmitting(true);
    setSubmitError('');
    setStep('processing');
    try {
      const { document: result, error, warning } = await supabaseService.issueNuboxClassicInvoice({
        installmentId: installment.id,
        clientId: razonSocial.id,
        exchangeRate: parsedRate,
        taxPercent: Number(taxPercent),
        paymentFormId: Number(paymentFormId),
        termsDays: Number(termsDays),
        dueDate,
        description: description.trim(),
        comment: comment.trim(),
        reference: reference ? { ...reference, number: reference.number.trim() } : null,
        updateClient,
        emitir,
        receptor: {
          tradeName: razonSocial.company,
          rut: razonSocial.rut,
          giro: giro.trim(),
          address: address.trim(),
          comunaName,
          city: city.trim(),
          email: email.trim(),
          contactName: contactName.trim()
        }
      });
      if (result) {
        setDoc(result);
        onDocumentChangeRef.current(result, { clientUpdated: updateClient });
      }
      if (error) {
        setSubmitError(error);
        setStep('form');
      } else {
        if (warning) setSubmitError(warning);
        setStep(result?.status === 'issued' ? 'done' : 'form');
      }
    } catch (err) {
      setSubmitError(err.message);
      setStep('form');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetryPdf = async () => {
    setIsRetryingPdf(true);
    setSubmitError('');
    try {
      const { document: fresh, warning } = await supabaseService.retryNuboxClassicPdf(doc.id);
      setDoc(fresh);
      onDocumentChangeRef.current(fresh);
      if (warning) setSubmitError(warning);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setIsRetryingPdf(false);
    }
  };

  const environmentBanner = environment === 'uat' && (
    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold px-3 py-2 rounded-lg">
      <span className="material-symbols-outlined text-[18px]">science</span>
      Ambiente de certificación Nubox: los documentos no tienen validez tributaria.
    </div>
  );

  // --- PROCESSING ---
  if (step === 'processing') {
    return (
      <div className="p-lg space-y-lg text-left">
        {environmentBanner}
        <div className="text-center space-y-sm py-lg">
          <span className="material-symbols-outlined text-[48px] text-secondary animate-spin">progress_activity</span>
          <h3 className="font-headline-sm text-headline-sm text-primary font-bold">
            {emitir ? 'Emitiendo factura...' : 'Generando borrador...'}
          </h3>
          <p className="text-body-md text-on-surface-variant">Enviando el documento a Nubox y obteniendo el PDF.</p>
        </div>
      </div>
    );
  }

  // --- DONE ---
  if (step === 'done' && doc) {
    const pdfError = !doc.pdfPath && doc.errors?.length ? doc.errors.map(e => e.message).join(' ') : '';
    return (
      <div className="p-lg space-y-md text-left">
        {environmentBanner}
        <div className="flex items-center gap-md">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-sm shrink-0 ${doc.isDraft ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
            <span className="material-symbols-outlined text-[28px]">{doc.isDraft ? 'edit_document' : 'verified'}</span>
          </div>
          <div>
            <h3 className="font-headline-sm text-headline-sm text-primary font-bold flex items-center gap-sm flex-wrap">
              Factura {doc.documentType === '34' ? 'exenta ' : ''}N° {doc.folio} {doc.isDraft ? 'generada' : 'emitida'}
              {doc.isDraft && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Borrador</span>
              )}
            </h3>
            <p className="text-body-md text-on-surface-variant">
              {formatDate(doc.emissionDate)} · Total {formatCLP(doc.totalAmount)} · Vence {formatDate(doc.dueDate)}
            </p>
          </div>
        </div>
        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-md text-sm text-red-800">{submitError}</div>
        )}
        {pdfUrl ? (
          <iframe title={`Factura ${doc.folio}`} src={pdfUrl} className="w-full h-[55vh] rounded-xl border border-outline-variant" />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 h-40 rounded-xl border border-dashed border-outline-variant text-on-surface-variant text-sm px-md text-center">
            <span className="material-symbols-outlined text-[24px]">picture_as_pdf</span>
            {doc.pdfPath ? 'Cargando PDF...' : (pdfError || 'El PDF aún no está disponible.')}
          </div>
        )}
        <div className={footerClass}>
          {!doc.pdfPath && (
            <button type="button" onClick={handleRetryPdf} className={cancelButtonClass + ' flex items-center gap-xs'} disabled={isRetryingPdf}>
              <span className={`material-symbols-outlined text-[18px] ${isRetryingPdf ? 'animate-spin' : ''}`}>sync</span>
              Reintentar PDF
            </button>
          )}
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className={cancelButtonClass + ' flex items-center gap-xs'}>
              <span className="material-symbols-outlined text-[18px]">open_in_new</span>
              Abrir PDF
            </a>
          )}
          {onSendInvoiceEmail && (
            <button
              type="button"
              onClick={() => onSendInvoiceEmail(doc)}
              className="bg-secondary text-white px-lg py-sm rounded-lg font-semibold shadow-sm hover:brightness-110 active:scale-95 transition-all flex items-center gap-xs"
            >
              <span className="material-symbols-outlined text-[18px]">mail</span>
              Enviar factura
            </button>
          )}
          <button type="button" onClick={onClose} className={primaryButtonClass}>Cerrar</button>
        </div>
      </div>
    );
  }

  // --- CONFIRM ---
  if (step === 'confirm') {
    const docLabel = isExempt ? 'Factura exenta electrónica (34)' : 'Factura electrónica (33)';
    return (
      <div className="p-lg space-y-md text-left">
        {environmentBanner}
        {emitir ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-md flex gap-sm text-red-900 text-sm">
            <span className="material-symbols-outlined text-[22px]">gavel</span>
            <p>
              Va a <b>emitir en forma definitiva</b> una <b>{docLabel}</b> ante el SII.
              Una vez emitida no se puede eliminar; sólo puede anularse con una nota de crédito.
            </p>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-md flex gap-sm text-amber-900 text-sm">
            <span className="material-symbols-outlined text-[22px]">edit_document</span>
            <p>
              Se generará una <b>{docLabel}</b> como <b>borrador</b> en Nubox (no se envía al SII).
              La cuota quedará como facturada con el folio asignado; el borrador se elimina directamente en Nubox.
            </p>
          </div>
        )}
        <div className="bg-slate-50 p-md rounded-xl border border-slate-100 space-y-sm text-body-md">
          <p className="flex justify-between gap-md"><span className="text-on-surface-variant">Receptor</span><span className="font-bold text-primary text-right">{razonSocial.company} ({formatRut(razonSocial.rut)})</span></p>
          <p className="flex justify-between gap-md"><span className="text-on-surface-variant">Dirección</span><span className="text-right">{address}, {comunaName}</span></p>
          {contactName.trim() && (
            <p className="flex justify-between gap-md"><span className="text-on-surface-variant">Contacto</span><span className="text-right">{contactName}</span></p>
          )}
          <p className="flex justify-between gap-md"><span className="text-on-surface-variant">Detalle</span><span className="text-right max-w-[60%]">{description}</span></p>
          {reference && (
            <p className="flex justify-between gap-md"><span className="text-on-surface-variant">{REFERENCE_LABELS[reference.type]}</span><span>N° {reference.number} del {formatDate(reference.date)}</span></p>
          )}
          <p className="flex justify-between gap-md">
            <span className="text-on-surface-variant">Forma de pago</span>
            <span>{paymentFormId === '1' ? 'Contado' : 'Crédito'} · {termsDays} días · vence {formatDate(dueDate)}</span>
          </p>
          <p className="flex justify-between gap-md">
            <span className="text-on-surface-variant">Modo</span>
            <span className={`font-bold ${emitir ? 'text-red-700' : 'text-amber-700'}`}>{emitir ? 'Emisión definitiva' : 'Borrador'}</span>
          </p>
          <div className="border-t border-slate-200 pt-sm space-y-1 font-mono">
            <p className="flex justify-between"><span className="font-sans text-on-surface-variant">{isExempt ? 'Exento' : 'Neto'}</span><span>{formatCLP(net)}</span></p>
            <p className="flex justify-between"><span className="font-sans text-on-surface-variant">IVA {isExempt ? '(exento)' : '19%'}</span><span>{formatCLP(tax)}</span></p>
            <p className="flex justify-between font-bold text-primary"><span className="font-sans">Total</span><span>{formatCLP(total)}</span></p>
          </div>
        </div>
        <div className={footerClass}>
          <button type="button" onClick={() => setStep('form')} className={cancelButtonClass} disabled={isSubmitting}>Volver</button>
          <button type="button" onClick={handleIssue} className={primaryButtonClass} disabled={isSubmitting}>
            <span className="material-symbols-outlined text-[18px]">{emitir ? 'send' : 'edit_document'}</span>
            {emitir ? 'Emitir factura en el SII' : 'Generar borrador'}
          </button>
        </div>
      </div>
    );
  }

  // --- FORM ---
  const failedDoc = doc && ['rejected', 'error'].includes(doc.status) ? doc : null;
  return (
    <form onSubmit={handleReview} className="p-lg space-y-lg text-left">
      {environmentBanner}

      {submitError ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-md text-sm text-red-800 space-y-1">
          <p className="font-bold flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">error</span>
            No se pudo generar la factura
          </p>
          <p>{submitError}</p>
        </div>
      ) : failedDoc && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-md text-sm text-red-800 space-y-1">
          <p className="font-bold flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">error</span>
            El intento anterior fue rechazado. Corrija los datos y vuelva a intentarlo.
          </p>
          {failedDoc.errors.map((e, i) => <p key={i}>{e.message}</p>)}
        </div>
      )}
      {validationErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-md text-sm text-red-800 space-y-1">
          {validationErrors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      {/* Receptor */}
      <section className="space-y-sm">
        <h4 className="text-xs font-bold text-primary uppercase tracking-wider border-b border-outline-variant/40 pb-1">Receptor</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          <div className="space-y-xs">
            <label className={labelClass}>Razón Social</label>
            <input className={readOnlyClass} value={razonSocial?.company || ''} readOnly />
          </div>
          <div className="space-y-xs">
            <label className={labelClass}>RUT</label>
            <input className={readOnlyClass} value={formatRut(razonSocial?.rut || '')} readOnly />
          </div>
          <div className="space-y-xs md:col-span-2">
            <label className={labelClass}>Giro</label>
            <input className={inputClass} value={giro} onChange={(e) => setGiro(e.target.value)} maxLength={200} />
            {giro.length > 40 && <p className="text-[10px] text-slate-500">Nubox admite 40 caracteres; se enviará: "{giro.trim().slice(0, 40)}"</p>}
          </div>
          <div className="space-y-xs md:col-span-2">
            <label className={labelClass}>Dirección</label>
            <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-xs">
            <label className={labelClass}>Comuna</label>
            <select className={`${inputClass} ${!comunaCode ? 'border-error' : ''}`} value={comunaCode} onChange={(e) => setComunaCode(e.target.value)}>
              <option value="">Seleccione...</option>
              {sortedComunas.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            {!comunaCode && razonSocial?.comuna && (
              <p className="text-[10px] text-amber-700">No se reconoció "{razonSocial.comuna}" en el catálogo del SII.</p>
            )}
          </div>
          <div className="space-y-xs">
            <label className={labelClass}>Ciudad</label>
            <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} maxLength={50} />
          </div>
          <div className="space-y-xs">
            <label className={labelClass}>Contacto</label>
            <input className={inputClass} value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-xs">
            <label className={labelClass}>Correo receptor (Nubox)</label>
            <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} maxLength={100} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer">
          <input type="checkbox" checked={updateClient} onChange={(e) => setUpdateClient(e.target.checked)} className="rounded border-outline-variant text-secondary focus:ring-secondary" />
          Guardar giro, dirección, comuna, ciudad y correo en la ficha del cliente (CRM)
        </label>
      </section>

      {/* Documento */}
      <section className="space-y-sm">
        <h4 className="text-xs font-bold text-primary uppercase tracking-wider border-b border-outline-variant/40 pb-1">Documento</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          <div className="space-y-xs">
            <label className={labelClass}>Tipo de factura</label>
            <select className={inputClass} value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)}>
              <option value="19">Factura electrónica (33) · IVA 19%</option>
              <option value="0">Factura exenta electrónica (34)</option>
            </select>
            {taxMismatch && (
              <p className="text-[10px] text-amber-700">La cuota tiene IVA {defaultTaxPercent}%; Nubox sólo admite 19% o exenta.</p>
            )}
          </div>
          {currency !== 'CLP' ? (
            <div className="space-y-xs">
              <label className={labelClass}>Valor {currency === 'USD' ? 'Dólar' : 'UF'} hoy ({formatDate(today)})</label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  className={`${inputClass} pr-10`}
                  value={rate}
                  onChange={(e) => {
                    if (isFetchingRate) cancelRateLookup();
                    setRate(e.target.value);
                  }}
                />
                <button
                  type="button"
                  onClick={isFetchingRate ? cancelRateLookup : loadRate}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-outline hover:text-primary"
                  title={isFetchingRate ? 'Detener búsqueda e ingresar el valor manualmente' : 'Recargar valor del día'}
                >
                  <span className={`material-symbols-outlined text-[18px] ${isFetchingRate ? 'animate-spin' : ''}`}>sync</span>
                </button>
              </div>
              {rateError && <p className="text-[10px] text-amber-600">No se pudo cargar el valor automáticamente. Ingréselo manualmente.</p>}
              <p className="text-[10px] text-slate-500">La factura se emite siempre en pesos chilenos (CLP).</p>
            </div>
          ) : (
            <div className="space-y-xs">
              <label className={labelClass}>Moneda</label>
              <input className={readOnlyClass} value="Pesos chilenos (CLP)" readOnly />
            </div>
          )}
          <div className="space-y-xs">
            <label className={labelClass}>Forma de pago</label>
            <select className={inputClass} value={paymentFormId} onChange={(e) => setPaymentFormId(e.target.value)}>
              <option value="2">Crédito</option>
              <option value="1">Contado</option>
            </select>
          </div>
          <div className="space-y-xs">
            <label className={labelClass}>Términos (días)</label>
            <input type="number" min="0" max="365" step="1" className={inputClass} value={termsDays} onChange={(e) => handleTermsChange(e.target.value)} />
          </div>
          <div className="space-y-xs">
            <label className={labelClass}>Fecha de vencimiento</label>
            <DateInput value={dueDate} onChange={setDueDate} min={today} />
          </div>
          <div className="space-y-xs">
            <label className={labelClass}>Medio de pago</label>
            <input className={readOnlyClass} value="Pago a Cta. Cte." readOnly />
          </div>
          <div className="space-y-xs md:col-span-2">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Descripción (detalle)</label>
              {descriptionEdited && (
                <button type="button" onClick={() => setDescriptionEdited(false)} className="text-[10px] text-secondary font-semibold hover:underline">
                  Restaurar texto sugerido
                </button>
              )}
            </div>
            <textarea
              rows="3"
              className={inputClass}
              value={description}
              maxLength={1000}
              onChange={(e) => { setDescription(e.target.value); setDescriptionEdited(true); }}
            />
          </div>
        </div>

        {/* Referencia */}
        <div className="space-y-xs">
          <div className="flex items-center justify-between">
            <label className={labelClass}>Referencia (OC / HES)</label>
            {!reference && (
              <button type="button" onClick={() => setReference({ type: '801', number: '', date: '' })} className="text-xs text-secondary font-semibold flex items-center gap-1 hover:underline">
                <span className="material-symbols-outlined text-[16px]">add</span>Agregar
              </button>
            )}
          </div>
          {reference ? (
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-sm items-center">
              <select className={inputClass} value={reference.type} onChange={(e) => setReference(r => ({ ...r, type: e.target.value }))}>
                <option value="801">Orden de Compra</option>
                <option value="HES">HES</option>
              </select>
              <input className={inputClass} placeholder="Número" value={reference.number} maxLength={18} onChange={(e) => setReference(r => ({ ...r, number: e.target.value }))} />
              <DateInput value={reference.date} onChange={(v) => setReference(r => ({ ...r, date: v }))} />
              <button type="button" onClick={() => setReference(null)} className="p-1 text-on-surface-variant hover:text-error" title="Quitar referencia">
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          ) : (
            <p className="text-xs text-on-surface-variant">Sin referencia.</p>
          )}
        </div>

        <div className="space-y-xs">
          <label className={labelClass}>Observación en la factura (opcional)</label>
          <input className={inputClass} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
        </div>
      </section>

      {/* Totales */}
      <div className="bg-slate-50/50 border border-slate-200/60 p-md rounded-xl text-body-sm space-y-1.5 font-mono">
        <p className="flex justify-between"><span className="font-sans text-on-surface-variant">{isExempt ? 'Monto exento' : 'Neto'}</span><span>{formatCLP(net)}</span></p>
        <p className="flex justify-between"><span className="font-sans text-on-surface-variant">IVA {isExempt ? '(exento)' : '19%'}</span><span>{formatCLP(tax)}</span></p>
        <p className="flex justify-between border-t border-slate-200/60 pt-1.5 font-bold text-primary"><span className="font-sans">Total</span><span>{formatCLP(total)}</span></p>
      </div>

      {/* Modo de emisión */}
      <label className={`flex items-start gap-sm p-md rounded-xl border cursor-pointer transition-all ${emitir ? 'bg-red-50 border-red-200' : 'bg-surface-container-low border-outline-variant/40'}`}>
        <input
          type="checkbox"
          checked={emitir}
          onChange={(e) => setEmitir(e.target.checked)}
          className="mt-0.5 rounded border-outline-variant text-secondary focus:ring-secondary"
        />
        <span className="text-sm">
          <span className="font-bold text-primary block">Emitir documento definitivo (SII)</span>
          <span className={emitir ? 'text-red-800' : 'text-on-surface-variant'}>
            {emitir
              ? 'La factura se enviará al SII y no podrá eliminarse; sólo anularse con nota de crédito.'
              : 'Desactivado: se genera un borrador en Nubox (emitir=false), que puede eliminarse desde Nubox.'}
          </span>
        </span>
      </label>

      <div className={footerClass}>
        <button type="button" onClick={onClose} className={cancelButtonClass}>Cancelar</button>
        <button type="submit" className={primaryButtonClass} disabled={isFetchingRate}>
          <span className="material-symbols-outlined text-[18px]">fact_check</span>
          {emitir ? 'Revisar y emitir' : 'Revisar borrador'}
        </button>
      </div>
    </form>
  );
}
