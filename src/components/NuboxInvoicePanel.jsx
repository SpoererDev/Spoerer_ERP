import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseService } from '../utils/supabaseService';
import { fetchIndicatorRate, buildInvoiceDescription } from '../utils/billingHelpers';
import { COMUNAS_CHILE, findComunaByName } from '../utils/comunasChile';
import { formatRut } from '../utils/validation';

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 60; // ~2 minutes while the modal stays open; pg_cron keeps checking afterwards
const PENDING_STATUSES = ['sending', 'queued', 'pending_sii'];
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

export default function NuboxInvoicePanel({
  installment,
  budget,
  project,
  razonSocial,
  totalQuotas,
  defaultTaxPercent,
  environment,
  existingDocument,
  onDocumentChange,
  onClose
}) {
  const currency = (installment.currency || 'UF').toUpperCase();
  const plannedAmount = parseFloat(installment.uf) || 0;

  const [doc, setDoc] = useState(existingDocument || null);
  const [step, setStep] = useState(() => {
    if (existingDocument?.status === 'issued') return 'done';
    if (PENDING_STATUSES.includes(existingDocument?.status)) return 'processing';
    return 'form';
  });

  // Receptor (prefilled from CRM)
  const [giro, setGiro] = useState(razonSocial?.giro || '');
  const [address, setAddress] = useState(razonSocial?.address || '');
  const [comunaCode, setComunaCode] = useState(findComunaByName(razonSocial?.comuna)?.code || '');
  const [city, setCity] = useState(razonSocial?.ciudad || '');
  const [email, setEmail] = useState(razonSocial?.email || '');
  const [updateClient, setUpdateClient] = useState(true);

  // Document
  const [rate, setRate] = useState('');
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  const [rateError, setRateError] = useState(false);
  const [taxPercent, setTaxPercent] = useState(Number(defaultTaxPercent) === 0 ? '0' : '19');
  const [paymentFormId, setPaymentFormId] = useState('2');
  const [dueDate, setDueDate] = useState(addDays(30));
  const [description, setDescription] = useState('');
  const [descriptionEdited, setDescriptionEdited] = useState(false);
  const [references, setReferences] = useState(installment.oc ? [{ type: '801', number: installment.oc, date: '' }] : []);
  const [comment, setComment] = useState('');

  const [validationErrors, setValidationErrors] = useState([]);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [pdfUrl, setPdfUrl] = useState('');

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

  // Poll Nubox while the document is being processed, and once more until the PDF is stored.
  const needsPolling = doc && (step === 'processing' || (step === 'done' && !doc.pdfPath));
  useEffect(() => {
    if (!needsPolling || pollCount >= MAX_POLLS) return;
    const timer = setTimeout(async () => {
      try {
        const fresh = await supabaseService.syncNuboxDocument(doc.id);
        if (fresh) {
          setDoc(fresh);
          if (fresh.status !== doc.status || fresh.pdfPath !== doc.pdfPath) onDocumentChangeRef.current(fresh);
          if (fresh.status === 'issued') setStep('done');
          else if (!PENDING_STATUSES.includes(fresh.status)) setStep('form');
        }
      } catch (err) {
        console.error('Error consultando estado en Nubox:', err);
      }
      setPollCount(c => c + 1);
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [needsPolling, pollCount, doc]);

  useEffect(() => {
    if (!doc?.pdfPath) return;
    supabaseService.getInvoicePdfUrl(doc.pdfPath).then(setPdfUrl).catch(err => console.error('Error obteniendo PDF:', err));
  }, [doc?.pdfPath]);

  const validate = () => {
    const errors = [];
    if (!razonSocial?.rut) errors.push('El cliente no tiene RUT registrado.');
    if (!giro.trim()) errors.push('Ingrese el giro del receptor.');
    if (!address.trim()) errors.push('Ingrese la dirección del receptor.');
    if (!comunaCode) errors.push('Seleccione la comuna del receptor.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push('El correo del receptor no es válido.');
    if (currency !== 'CLP' && !(parsedRate > 0)) errors.push(`Ingrese el valor ${currency === 'USD' ? 'del dólar' : 'de la UF'} del día.`);
    if (!(net > 0)) errors.push('El monto neto debe ser mayor a cero.');
    if (!dueDate || dueDate < today) errors.push('La fecha de vencimiento debe ser hoy o posterior.');
    if (!description.trim()) errors.push('Ingrese la descripción de la factura.');
    if (references.some(r => !r.number.trim() || !r.date)) errors.push('Complete número y fecha de cada referencia.');
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
    try {
      const { document: issued, warning } = await supabaseService.issueNuboxInvoice({
        installmentId: installment.id,
        clientId: razonSocial.id,
        exchangeRate: parsedRate,
        taxPercent: Number(taxPercent),
        paymentFormId: Number(paymentFormId),
        dueDate,
        description: description.trim(),
        comment: comment.trim(),
        references: references.map(r => ({ ...r, number: r.number.trim() })),
        updateClient,
        receptor: {
          tradeName: razonSocial.company,
          rut: razonSocial.rut,
          giro: giro.trim(),
          address: address.trim(),
          comunaCode,
          comunaName,
          city: city.trim(),
          email: email.trim(),
          contactName: razonSocial.name || '',
          phone: razonSocial.phone || ''
        }
      });
      setDoc(issued);
      setPollCount(0);
      onDocumentChangeRef.current(issued, { clientUpdated: updateClient });
      if (warning) setSubmitError(warning);
      setStep(issued.status === 'issued' ? 'done' : PENDING_STATUSES.includes(issued.status) ? 'processing' : 'form');
    } catch (err) {
      setSubmitError(err.message);
      setStep('form');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateReference = (idx, field, value) =>
    setReferences(prev => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));

  const environmentBanner = environment === 'uat' && (
    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold px-3 py-2 rounded-lg">
      <span className="material-symbols-outlined text-[18px]">science</span>
      Ambiente de pruebas Nubox: los documentos no tienen validez tributaria.
    </div>
  );

  // --- PROCESSING ---
  if (step === 'processing') {
    const timedOut = pollCount >= MAX_POLLS;
    return (
      <div className="p-lg space-y-lg text-left">
        {environmentBanner}
        <div className="text-center space-y-sm py-lg">
          <span className={`material-symbols-outlined text-[48px] text-secondary ${timedOut ? '' : 'animate-spin'}`}>
            {timedOut ? 'schedule' : 'progress_activity'}
          </span>
          <h3 className="font-headline-sm text-headline-sm text-primary font-bold">
            {timedOut ? 'La factura sigue en proceso' : 'Generando factura...'}
          </h3>
          <p className="text-body-md text-on-surface-variant">
            {doc?.emissionStatusName ? `Estado Nubox: ${doc.emissionStatusName}` : 'Enviando documento a Nubox y al SII.'}
          </p>
          <p className="text-xs text-on-surface-variant max-w-md mx-auto">
            Puede cerrar esta ventana: el ERP seguirá consultando a Nubox y la cuota quedará facturada automáticamente cuando el SII la acepte.
          </p>
          {doc?.errors?.length > 0 && (
            <p className="text-xs text-amber-700">{doc.errors.map(e => e.message).join(' ')}</p>
          )}
        </div>
        <div className={footerClass}>
          {timedOut && (
            <button type="button" onClick={() => setPollCount(0)} className={cancelButtonClass}>Consultar de nuevo</button>
          )}
          <button type="button" onClick={onClose} className={primaryButtonClass}>Cerrar</button>
        </div>
      </div>
    );
  }

  // --- DONE ---
  if (step === 'done' && doc) {
    return (
      <div className="p-lg space-y-md text-left">
        {environmentBanner}
        <div className="flex items-center gap-md">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shadow-sm shrink-0">
            <span className="material-symbols-outlined text-[28px]">verified</span>
          </div>
          <div>
            <h3 className="font-headline-sm text-headline-sm text-primary font-bold">
              Factura {doc.documentType === '34' ? 'exenta ' : ''}N° {doc.folio} emitida
            </h3>
            <p className="text-body-md text-on-surface-variant">
              {formatDate(doc.emissionDate)} · Total {formatCLP(doc.totalAmount)} · Vence {formatDate(doc.dueDate)}
            </p>
          </div>
        </div>
        {pdfUrl ? (
          <iframe title={`Factura ${doc.folio}`} src={pdfUrl} className="w-full h-[55vh] rounded-xl border border-outline-variant" />
        ) : (
          <div className="flex items-center justify-center gap-2 h-40 rounded-xl border border-dashed border-outline-variant text-on-surface-variant text-sm">
            <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
            Obteniendo PDF desde Nubox...
          </div>
        )}
        <div className={footerClass}>
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className={cancelButtonClass + ' flex items-center gap-xs'}>
              <span className="material-symbols-outlined text-[18px]">open_in_new</span>
              Abrir PDF
            </a>
          )}
          <button type="button" onClick={onClose} className={primaryButtonClass}>Cerrar</button>
        </div>
      </div>
    );
  }

  // --- CONFIRM ---
  if (step === 'confirm') {
    return (
      <div className="p-lg space-y-md text-left">
        {environmentBanner}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-md flex gap-sm text-amber-900 text-sm">
          <span className="material-symbols-outlined text-[22px]">gavel</span>
          <p>
            Va a emitir una <b>{isExempt ? 'Factura exenta electrónica (34)' : 'Factura electrónica (33)'}</b> ante el SII.
            Una vez emitida no se puede eliminar; sólo puede anularse con una nota de crédito.
          </p>
        </div>
        <div className="bg-slate-50 p-md rounded-xl border border-slate-100 space-y-sm text-body-md">
          <p className="flex justify-between gap-md"><span className="text-on-surface-variant">Receptor</span><span className="font-bold text-primary text-right">{razonSocial.company} ({formatRut(razonSocial.rut)})</span></p>
          <p className="flex justify-between gap-md"><span className="text-on-surface-variant">Dirección</span><span className="text-right">{address}, {comunaName}</span></p>
          <p className="flex justify-between gap-md"><span className="text-on-surface-variant">Detalle</span><span className="text-right max-w-[60%]">{description}</span></p>
          {references.map((r, i) => (
            <p key={i} className="flex justify-between gap-md"><span className="text-on-surface-variant">{REFERENCE_LABELS[r.type]}</span><span>N° {r.number} del {formatDate(r.date)}</span></p>
          ))}
          <p className="flex justify-between gap-md"><span className="text-on-surface-variant">Forma de pago</span><span>{paymentFormId === '1' ? 'Contado' : 'Crédito'} · vence {formatDate(dueDate)}</span></p>
          <div className="border-t border-slate-200 pt-sm space-y-1 font-mono">
            <p className="flex justify-between"><span className="font-sans text-on-surface-variant">{isExempt ? 'Exento' : 'Neto'}</span><span>{formatCLP(net)}</span></p>
            <p className="flex justify-between"><span className="font-sans text-on-surface-variant">IVA {isExempt ? '(exento)' : '19%'}</span><span>{formatCLP(tax)}</span></p>
            <p className="flex justify-between font-bold text-primary"><span className="font-sans">Total</span><span>{formatCLP(total)}</span></p>
          </div>
        </div>
        <div className={footerClass}>
          <button type="button" onClick={() => setStep('form')} className={cancelButtonClass} disabled={isSubmitting}>Volver</button>
          <button type="button" onClick={handleIssue} className={primaryButtonClass} disabled={isSubmitting}>
            <span className={`material-symbols-outlined text-[18px] ${isSubmitting ? 'animate-spin' : ''}`}>{isSubmitting ? 'sync' : 'send'}</span>
            {isSubmitting ? 'Enviando...' : 'Emitir factura en el SII'}
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

      {failedDoc && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-md text-sm text-red-800 space-y-1">
          <p className="font-bold flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px]">error</span>
            El intento anterior fue rechazado{failedDoc.emissionStatusName ? ` (${failedDoc.emissionStatusName})` : ''}. Corrija los datos y vuelva a emitir.
          </p>
          {failedDoc.errors.map((e, i) => (
            <p key={i}>{e.field ? <b>{e.field}: </b> : null}{e.message}</p>
          ))}
        </div>
      )}
      {(submitError || validationErrors.length > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-md text-sm text-red-800 space-y-1">
          {submitError && <p>{submitError}</p>}
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
          <div className="space-y-xs md:col-span-2">
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
            <label className={labelClass}>Fecha de vencimiento</label>
            <DateInput value={dueDate} onChange={setDueDate} min={today} />
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

        {/* Referencias */}
        <div className="space-y-xs">
          <div className="flex items-center justify-between">
            <label className={labelClass}>Referencias (OC / HES)</label>
            {references.length < 3 && (
              <button type="button" onClick={() => setReferences(prev => [...prev, { type: '801', number: '', date: '' }])} className="text-xs text-secondary font-semibold flex items-center gap-1 hover:underline">
                <span className="material-symbols-outlined text-[16px]">add</span>Agregar
              </button>
            )}
          </div>
          {references.length === 0 && <p className="text-xs text-on-surface-variant">Sin referencias.</p>}
          {references.map((ref, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-sm items-center">
              <select className={inputClass} value={ref.type} onChange={(e) => updateReference(idx, 'type', e.target.value)}>
                <option value="801">Orden de Compra</option>
                <option value="HES">HES</option>
              </select>
              <input className={inputClass} placeholder="Número" value={ref.number} maxLength={18} onChange={(e) => updateReference(idx, 'number', e.target.value)} />
              <DateInput value={ref.date} onChange={(v) => updateReference(idx, 'date', v)} />
              <button type="button" onClick={() => setReferences(prev => prev.filter((_, i) => i !== idx))} className="p-1 text-on-surface-variant hover:text-error" title="Quitar referencia">
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          ))}
        </div>

        <div className="space-y-xs">
          <label className={labelClass}>Comentario en la factura (opcional)</label>
          <input className={inputClass} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
        </div>
      </section>

      {/* Totales */}
      <div className="bg-slate-50/50 border border-slate-200/60 p-md rounded-xl text-body-sm space-y-1.5 font-mono">
        <p className="flex justify-between"><span className="font-sans text-on-surface-variant">{isExempt ? 'Monto exento' : 'Neto'}</span><span>{formatCLP(net)}</span></p>
        <p className="flex justify-between"><span className="font-sans text-on-surface-variant">IVA {isExempt ? '(exento)' : '19%'}</span><span>{formatCLP(tax)}</span></p>
        <p className="flex justify-between border-t border-slate-200/60 pt-1.5 font-bold text-primary"><span className="font-sans">Total</span><span>{formatCLP(total)}</span></p>
      </div>

      <div className={footerClass}>
        <button type="button" onClick={onClose} className={cancelButtonClass}>Cancelar</button>
        <button type="submit" className={primaryButtonClass} disabled={isFetchingRate}>
          <span className="material-symbols-outlined text-[18px]">fact_check</span>
          Revisar y emitir
        </button>
      </div>
    </form>
  );
}
