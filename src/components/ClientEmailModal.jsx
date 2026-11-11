import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseService } from '../utils/supabaseService';
import {
  EMAIL_TEMPLATES,
  PAYMENT_TABLE_TOKEN,
  PAYMENT_TABLE_HEADERS,
  buildTemplate,
  buildPaymentRows,
  getDefaultTemplate,
  getIssuedDte,
  paymentRowValues
} from '../utils/clientEmailTemplates';

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const labelClass = 'font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider';
const inputClass = 'w-full border border-outline-variant rounded-lg p-sm focus:border-secondary focus:ring-1 focus:ring-secondary/20 outline-none transition-all font-body-md text-body-md bg-white';

const fileNameFromUrl = (url) => decodeURIComponent((url || '').split('?')[0].split('/').pop() || 'archivo').replace(/^\d+_[a-z0-9]+_/i, '');

// Recipient rows: name + e-mail, editable, with add/remove.
const RecipientList = ({ recipients, onChange, addLabel }) => (
  <div className="space-y-xs">
    {recipients.map((r, idx) => (
      <div key={idx} className="flex gap-xs items-center">
        <input
          className={`${inputClass} md:w-2/5`}
          placeholder="Nombre"
          value={r.name}
          onChange={(e) => onChange(recipients.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))}
        />
        <input
          type="email"
          className={`${inputClass} ${r.email && !EMAIL_RE.test(r.email.trim()) ? 'border-error focus:ring-error/20 focus:border-error' : ''}`}
          placeholder="correo@empresa.cl"
          value={r.email}
          onChange={(e) => onChange(recipients.map((x, i) => (i === idx ? { ...x, email: e.target.value } : x)))}
        />
        <button
          type="button"
          onClick={() => onChange(recipients.filter((_, i) => i !== idx))}
          className="p-1 text-error hover:bg-red-50 rounded transition-all flex-shrink-0"
          title="Quitar"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    ))}
    <button
      type="button"
      onClick={() => onChange([...recipients, { name: '', email: '' }])}
      className="text-secondary text-xs font-semibold flex items-center gap-1 hover:underline"
    >
      <span className="material-symbols-outlined text-[16px]">add</span>
      {addLabel}
    </button>
  </div>
);

export default function ClientEmailModal({
  installment,
  initialTemplate,
  installments = [],
  projects = [],
  budgets = [],
  clients = [],
  mainClients = [],
  users = [],
  dteDocuments = [],
  clientEmails = [],
  notificationSettings = [],
  onPreviewFile,
  onClose,
  onSent
}) {
  const [activeTab, setActiveTab] = useState('compose'); // 'compose' | 'history'
  const [expandedEmailId, setExpandedEmailId] = useState(null);
  const budget = budgets.find(b => b.id === installment.origin_budget_id) || null;
  const project = projects.find(p => p.id === (installment.project_id || budget?.projectId)) || null;
  const razonSocial = clients.find(c => c.id === (installment.legalEntityId || budget?.legalEntityId)) || null;
  const mainClient = mainClients.find(m => m.id === (razonSocial?.mainClientId || budget?.mainClientId)) || null;
  const contact = razonSocial?.email
    ? { name: razonSocial.name || '', email: razonSocial.email }
    : mainClient?.contactEmail
      ? { name: mainClient.contactName || '', email: mainClient.contactEmail }
      : null;
  const encargadoUser = users.find(u => project?.encargado && u.name === project.encargado) || null;
  const encargado = encargadoUser ? { name: encargadoUser.name, email: encargadoUser.email } : null;

  // Invoiced, unpaid installments of the same project that can be added to a payment request.
  const pendingInstallments = useMemo(
    () => installments
      .filter(i => i.project_id && i.project_id === installment.project_id && i.status === 'Facturada')
      .sort((a, b) => String(a.numQuota).localeCompare(String(b.numQuota), 'es', { numeric: true })),
    [installments, installment.project_id]
  );

  const buildState = (templateId) => {
    const tpl = buildTemplate(templateId, { inst: installment, project, budget, contact, encargado, dte: getIssuedDte(dteDocuments, installment.id) });
    const settingType = EMAIL_TEMPLATES.find(t => t.id === templateId)?.settingType;
    const ccIds = notificationSettings.find(s => s.notificationType === settingType)?.userIds || [];
    const cc = users.filter(u => ccIds.includes(u.id) && u.email).map(u => ({ name: u.name, email: u.email }));
    const invoicePdf = getIssuedDte(dteDocuments, installment.id)?.pdfPath;
    return {
      templateId,
      to: tpl.to.length ? tpl.to : [{ name: '', email: '' }],
      cc,
      subject: tpl.subject,
      body: tpl.body,
      edited: false,
      dteInstallmentIds: templateId === 'invoice' && invoicePdf ? [installment.id] : [],
      paymentInstallmentIds: [installment.id]
    };
  };

  const defaultTpl = initialTemplate || getDefaultTemplate(installment, clientEmails);
  const [form, setForm] = useState(() => buildState(defaultTpl));
  const [respaldoUrls, setRespaldoUrls] = useState(() => {
    const hasDtePdf = Boolean(getIssuedDte(dteDocuments, installment.id)?.pdfPath);
    if (defaultTpl === 'invoice' && !hasDtePdf && installment.invoiceFileUrl) {
      return [installment.invoiceFileUrl];
    }
    return [];
  });
  const [uploads, setUploads] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [sentEmail, setSentEmail] = useState(null);
  const [isUserResized, setIsUserResized] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const observer = new MutationObserver(() => {
      if (el.style.height || el.style.width) {
        setIsUserResized(true);
      }
    });
    observer.observe(el, { attributes: true, attributeFilter: ['style'] });
    return () => observer.disconnect();
  }, []);

  const update = (changes) => setForm(prev => ({ ...prev, ...changes }));

  const handleTemplateChange = (templateId) => {
    if (form.edited && !window.confirm('Se reemplazará el asunto y el mensaje que editaste. ¿Continuar?')) return;
    if (textareaRef.current) {
      textareaRef.current.style.height = '';
      textareaRef.current.style.width = '';
    }
    setIsUserResized(false);
    setForm(buildState(templateId));
    setError('');
  };

  const isPaymentRequest = form.templateId === 'payment_request';
  const emailInstallmentIds = isPaymentRequest
    ? [installment.id, ...form.paymentInstallmentIds.filter(id => id !== installment.id)]
    : [installment.id];
  const emailInstallments = emailInstallmentIds.map(id => installments.find(i => i.id === id) || installment);
  const paymentRows = buildPaymentRows(emailInstallments, { dteDocuments, projects });

  const invoiceOptions = emailInstallments
    .map(inst => ({ inst, dte: getIssuedDte(dteDocuments, inst.id) }))
    .filter(({ dte }) => dte?.pdfPath);
  const respaldoOptions = [
    installment.invoiceFileUrl && { url: installment.invoiceFileUrl, label: 'Factura (PDF cargado)' },
    installment.ocFileUrl && { url: installment.ocFileUrl, label: 'Orden de compra' },
    installment.paymentBackupUrl && { url: installment.paymentBackupUrl, label: 'Comprobante de pago' },
    ...(installment.otherFiles || []).filter(f => f?.url).map(f => ({ url: f.url, label: f.name || fileNameFromUrl(f.url) }))
  ].filter(Boolean);

  const toggle = (list, value) => (list.includes(value) ? list.filter(v => v !== value) : [...list, value]);

  const validate = () => {
    const errors = [];
    const to = form.to.filter(r => r.email.trim());
    if (!to.length) errors.push('Ingrese al menos un destinatario.');
    if ([...to, ...form.cc].some(r => r.email.trim() && !EMAIL_RE.test(r.email.trim()))) errors.push('Revise los correos marcados en rojo.');
    if (!form.subject.trim()) errors.push('Ingrese el asunto.');
    if (!form.body.trim()) errors.push('Ingrese el mensaje.');
    return errors;
  };

  const handleSend = async () => {
    const errors = validate();
    if (errors.length) {
      setError(errors.join(' '));
      return;
    }
    setIsSending(true);
    setError('');
    try {
      const uploaded = await Promise.all(uploads.map(file => supabaseService.uploadEmailAttachment(file)));
      const clean = (list) => list.filter(r => r.email.trim()).map(r => ({ name: r.name.trim(), email: r.email.trim() }));
      const email = await supabaseService.sendClientEmail({
        template: form.templateId,
        installmentIds: emailInstallmentIds,
        to: clean(form.to),
        cc: clean(form.cc),
        subject: form.subject.trim(),
        bodyText: form.body,
        idempotencyKey: crypto.randomUUID(),
        attachments: [
          ...form.dteInstallmentIds.filter(id => emailInstallmentIds.includes(id)).map(id => ({ source: 'dte', installmentId: id })),
          ...respaldoUrls.map(url => ({ source: 'respaldo', installmentId: installment.id, url, name: fileNameFromUrl(url) })),
          ...uploaded.map(u => ({ source: 'upload', path: u.path, name: u.name }))
        ]
      });
      setSentEmail(email);
      onSent?.(email);
    } catch (err) {
      setError(err.message || 'No se pudo enviar el correo.');
    } finally {
      setIsSending(false);
    }
  };

  const projectText = project ? `${project.projectNumber} - ${project.rawProjectName}` : '';
  const [bodyBefore, bodyAfter] = form.body.includes(PAYMENT_TABLE_TOKEN)
    ? [form.body.slice(0, form.body.indexOf(PAYMENT_TABLE_TOKEN)), form.body.slice(form.body.indexOf(PAYMENT_TABLE_TOKEN) + PAYMENT_TABLE_TOKEN.length)]
    : [form.body, null];

  const installmentHistory = useMemo(
    () => (clientEmails || [])
      .filter(e => Array.isArray(e.installmentIds) && e.installmentIds.includes(installment.id))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
    [clientEmails, installment.id]
  );

  const formatDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  };

  // Resolve attachment location dynamically from the database (dte_documents or billing_installments)
  const resolveHistoryAttachment = (att) => {
    if (!att) return null;
    const targetInstId = att.installmentId || installment.id;
    const targetInst = installments.find(i => i.id === targetInstId) || installment;
    const dte = getIssuedDte(dteDocuments, targetInstId);

    if (att.source === 'dte' || (att.source === 'external_invoice' && dte?.pdfPath)) {
      if (dte?.pdfPath) {
        return {
          type: 'dte',
          label: att.name || `Factura_${dte.folio}.pdf`,
          pdfPath: dte.pdfPath,
          title: `Factura electrónica N° ${dte.folio} (Nubox)`
        };
      }
      return { type: 'none', label: att.name || 'Factura DTE' };
    }

    if (att.source === 'respaldo' || att.source === 'external_invoice') {
      let url = null;
      if (att.field === 'invoiceFileUrl' || att.source === 'external_invoice') {
        url = targetInst?.invoiceFileUrl || null;
      } else if (att.field === 'ocFileUrl') {
        url = targetInst?.ocFileUrl || null;
      } else if (att.field === 'paymentBackupUrl') {
        url = targetInst?.paymentBackupUrl || null;
      } else if (att.field === 'otherFiles') {
        const otherList = Array.isArray(targetInst?.otherFiles) ? targetInst.otherFiles : [];
        const matched = otherList.find(f => f?.name === att.name || fileNameFromUrl(f?.url) === att.name) || otherList[0];
        url = matched?.url || null;
      } else {
        // Fallback matching by file name against current DB fields of the installment
        const candidates = [
          targetInst?.invoiceFileUrl,
          targetInst?.ocFileUrl,
          targetInst?.paymentBackupUrl,
          ...(Array.isArray(targetInst?.otherFiles) ? targetInst.otherFiles.map(f => f?.url) : [])
        ].filter(Boolean);
        url = candidates.find(u => fileNameFromUrl(u) === att.name) || (att.source === 'respaldo' ? targetInst?.invoiceFileUrl : null);
      }

      if (url) {
        return {
          type: 'url',
          label: att.name || fileNameFromUrl(url),
          url,
          title: att.name || `Documento - Cuota ${targetInst?.numQuota || ''}`
        };
      }
    }

    return { type: 'none', label: att.name || 'Adjunto' };
  };

  const handleOpenResolvedAttachment = async (resolved) => {
    if (!resolved) return;
    try {
      if (resolved.type === 'dte' && resolved.pdfPath) {
        const signedUrl = await supabaseService.getInvoicePdfUrl(resolved.pdfPath);
        if (onPreviewFile) {
          onPreviewFile({ url: signedUrl, title: resolved.title, name: resolved.label });
        } else {
          window.open(signedUrl, '_blank', 'noopener,noreferrer');
        }
      } else if (resolved.type === 'url' && resolved.url) {
        if (onPreviewFile) {
          onPreviewFile({ url: resolved.url, title: resolved.title, name: resolved.label });
        } else {
          window.open(resolved.url, '_blank', 'noopener,noreferrer');
        }
      }
    } catch (err) {
      console.error('Error abriendo documento desde la base de datos:', err);
      alert('No se pudo abrir el documento adjunto.');
    }
  };

  if (sentEmail) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-primary/40 backdrop-blur-sm p-4">
        <div className="relative bg-white w-full max-w-md rounded-xl shadow-2xl flex flex-col border border-outline-variant animate-scale-up p-lg space-y-md text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mx-auto shadow-sm mb-2">
            <span className="material-symbols-outlined text-[36px]">verified</span>
          </div>
          <h3 className="font-headline-sm text-headline-sm text-primary font-bold">Correo enviado</h3>
          <div className="bg-slate-50 p-md rounded-xl border border-slate-100 text-left space-y-sm text-body-sm">
            <p><span className="font-semibold">Asunto:</span> {sentEmail.subject}</p>
            <p><span className="font-semibold">Para:</span> {sentEmail.to.map(r => r.email).join(', ')}</p>
            {sentEmail.cc.length > 0 && <p><span className="font-semibold">Copia:</span> {sentEmail.cc.map(r => r.email).join(', ')}</p>}
            {sentEmail.attachments.length > 0 && <p><span className="font-semibold">Adjuntos:</span> {sentEmail.attachments.map(a => a.name).join(', ')}</p>}
          </div>
          <div className="flex justify-center">
            <button type="button" onClick={onClose} className="bg-primary text-white px-xl py-sm rounded-lg font-semibold shadow-sm hover:bg-primary-container active:scale-95 transition-all">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-primary/40 backdrop-blur-sm p-4">
      <div className="relative bg-white w-full max-w-5xl max-h-[90vh] overflow-y-auto custom-scrollbar rounded-xl shadow-2xl flex flex-col border border-outline-variant animate-scale-up">
        <div className="px-lg py-md border-b border-outline-variant flex justify-between items-center bg-surface sticky top-0 z-10">
          <div className="text-left min-w-0">
            <h3 className="font-headline-md text-headline-md text-primary font-bold flex items-center gap-xs">
              <span className="material-symbols-outlined text-secondary">mail</span>
              Enviar correo
            </h3>
            <p className="text-xs text-on-surface-variant truncate">Cuota {installment.numQuota}{projectText ? ` · ${projectText}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-surface-container rounded-full text-on-surface-variant transition-all">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-lg pt-sm border-b border-outline-variant/40 bg-surface-container-low/40 flex items-center gap-xs">
          <button
            type="button"
            onClick={() => setActiveTab('compose')}
            className={`px-md py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'compose'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-primary'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">edit_square</span>
            <span>Redactar correo</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-md py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-primary'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">history</span>
            <span>Historial de envíos</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              installmentHistory.length > 0 ? 'bg-secondary-container text-primary' : 'bg-slate-200 text-slate-600'
            }`}>
              {installmentHistory.length}
            </span>
          </button>
        </div>

        {activeTab === 'history' ? (
          <>
            <div className="p-lg space-y-md text-left">
              {installmentHistory.length === 0 ? (
                <div className="py-12 text-center text-on-surface-variant space-y-xs">
                  <span className="material-symbols-outlined text-[36px] text-outline-variant">mark_email_Read</span>
                  <p className="text-body-md font-medium">No hay correos ni envíos registrados para esta cuota.</p>
                </div>
              ) : (
                <div className="space-y-sm">
                  {installmentHistory.map((item) => {
                    const isExternal = item.resendId === 'external' || (item.attachments || []).some(a => a?.source === 'external_invoice');
                    const tplLabel = isExternal
                      ? 'Envío por otro medio'
                      : (EMAIL_TEMPLATES.find(t => t.id === item.template)?.label || item.template);
                    const senderUser = users.find(u => u.id === item.sentBy);
                    const senderName = senderUser?.name || (isExternal ? 'Registro del sistema' : 'Secretaría Spoerer');
                    const isExpanded = expandedEmailId === item.id;
                    const resolvedAttachments = (item.attachments || []).map(resolveHistoryAttachment).filter(Boolean);

                    return (
                      <div key={item.id} className="border border-outline-variant/60 rounded-xl bg-white shadow-2xs overflow-hidden">
                        <div
                          onClick={() => setExpandedEmailId(isExpanded ? null : item.id)}
                          className="p-md flex flex-col sm:flex-row sm:items-center justify-between gap-sm cursor-pointer hover:bg-surface-container-low/50 transition-colors"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                item.status === 'failed'
                                  ? 'bg-red-50 text-red-700 border-red-200'
                                  : isExternal
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}>
                                {item.status === 'failed' ? 'Fallido' : tplLabel}
                              </span>
                              <span className="text-xs font-bold text-primary truncate">{item.subject}</span>
                            </div>
                            <div className="text-[11px] text-on-surface-variant flex flex-wrap items-center gap-x-3 gap-y-0.5">
                              <span>Fecha: <strong>{formatDateTime(item.createdAt)}</strong></span>
                              <span>Por: <strong>{senderName}</strong></span>
                              {item.to && item.to.length > 0 && (
                                <span>Para: <strong>{item.to.map(r => r.email).join(', ')}</strong></span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-xs self-end sm:self-center shrink-0">
                            {resolvedAttachments.length > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-semibold">
                                <span className="material-symbols-outlined text-[14px]">attach_file</span>
                                {resolvedAttachments.length}
                              </span>
                            )}
                            <span className={`material-symbols-outlined text-on-surface-variant transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                              expand_more
                            </span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-md pb-md pt-xs border-t border-outline-variant/30 bg-surface-container-low/30 space-y-sm text-body-sm">
                            {item.cc && item.cc.length > 0 && (
                              <p className="text-xs text-on-surface-variant">
                                <span className="font-semibold">En copia (CC):</span> {item.cc.map(r => r.email).join(', ')}
                              </p>
                            )}
                            {item.error && (
                              <p className="text-xs text-error font-semibold">Error: {item.error}</p>
                            )}
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant block mb-1">Mensaje</span>
                              <div className="p-sm rounded-lg border border-outline-variant/40 bg-white text-xs text-slate-800 whitespace-pre-wrap break-words">
                                {item.bodyText || '—'}
                              </div>
                            </div>
                            {resolvedAttachments.length > 0 && (
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant block mb-1">
                                  Documentos asociados (desde base de datos)
                                </span>
                                <div className="flex flex-wrap gap-xs">
                                  {resolvedAttachments.map((att, idx) => (
                                    att.type !== 'none' ? (
                                      <button
                                        key={idx}
                                        type="button"
                                        onClick={() => handleOpenResolvedAttachment(att)}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 border border-outline-variant text-xs font-semibold text-primary transition-all active:scale-95 shadow-2xs"
                                      >
                                        <span className="material-symbols-outlined text-[16px] text-secondary">
                                          {att.type === 'dte' ? 'verified' : 'description'}
                                        </span>
                                        <span>{att.label}</span>
                                        <span className="material-symbols-outlined text-[14px] text-on-surface-variant">open_in_new</span>
                                      </button>
                                    ) : (
                                      <span
                                        key={idx}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs text-on-surface-variant"
                                      >
                                        <span className="material-symbols-outlined text-[15px]">attach_file</span>
                                        <span>{att.label}</span>
                                      </span>
                                    )
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-lg py-md flex justify-end gap-md border-t border-outline-variant/30 sticky bottom-0 bg-white z-10">
              <button type="button" onClick={onClose} className="bg-primary text-white px-xl py-sm rounded-lg font-semibold shadow-sm hover:bg-primary-container active:scale-95 transition-all">
                Cerrar
              </button>
            </div>
          </>
        ) : (
          <>
        <div className="p-lg space-y-lg text-left">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <div className="space-y-xs">
              <label className={labelClass}>Plantilla</label>
              <select className={inputClass} value={form.templateId} onChange={(e) => handleTemplateChange(e.target.value)}>
                {EMAIL_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-xs">
              <label className={labelClass}>Remitente</label>
              <p className="p-sm text-body-md text-on-surface-variant bg-surface-container-low rounded-lg border border-outline-variant/50">
                Secretaría Spoerer &lt;secretaria@spoerer.cl&gt;
                <span className="block text-[11px]">Se envía copia oculta a secretaria@spoerer.cl</span>
              </p>
            </div>
          </div>

          <div className="space-y-xs">
            <label className={labelClass}>Destinatarios</label>
            {!form.to.some(r => r.email.trim()) && form.templateId !== 'other' && (
              <p className="text-[11px] text-amber-700">
                {form.templateId === 'approval_request'
                  ? 'El proyecto no tiene un encargado con correo registrado. Ingrese el destinatario.'
                  : 'El cliente no tiene un contacto con correo registrado. Ingrese el destinatario.'}
              </p>
            )}
            <RecipientList recipients={form.to} onChange={(to) => update({ to })} addLabel="Agregar destinatario" />
          </div>

          <div className="space-y-xs">
            <label className={labelClass}>En copia</label>
            <RecipientList recipients={form.cc} onChange={(cc) => update({ cc })} addLabel="Agregar contacto en copia" />
          </div>

          <div className="space-y-xs">
            <label className={labelClass}>Asunto</label>
            <input className={inputClass} value={form.subject} onChange={(e) => update({ subject: e.target.value, edited: true })} />
          </div>

          {isPaymentRequest && (
            <div className="space-y-xs">
              <label className={labelClass}>Cuotas pendientes de pago incluidas</label>
              {pendingInstallments.length === 0 ? (
                <p className="text-xs text-on-surface-variant">No hay otras cuotas facturadas pendientes de pago en este proyecto.</p>
              ) : (
                <div className="flex flex-wrap gap-xs">
                  {pendingInstallments.map(i => {
                    const checked = i.id === installment.id || form.paymentInstallmentIds.includes(i.id);
                    const dte = getIssuedDte(dteDocuments, i.id);
                    return (
                      <label key={i.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs cursor-pointer ${checked ? 'border-secondary bg-secondary-container/30' : 'border-outline-variant'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={i.id === installment.id}
                          onChange={() => update({ paymentInstallmentIds: toggle(form.paymentInstallmentIds, i.id) })}
                        />
                        Cuota {i.numQuota}{dte?.folio || i.invoiceNumber ? ` · Factura ${dte?.folio || i.invoiceNumber}` : ''}
                      </label>
                    );
                  })}
                </div>
              )}
              {!form.body.includes(PAYMENT_TABLE_TOKEN) && (
                <p className="text-[11px] text-amber-700">Escriba {PAYMENT_TABLE_TOKEN} en el mensaje donde debe aparecer la tabla de pagos.</p>
              )}
            </div>
          )}

          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-md ${isUserResized ? 'items-start' : 'items-stretch'}`}>
            <div className="grid grid-rows-[auto_1fr] gap-xs">
              <label className={`${labelClass} block`}>Mensaje</label>
              <textarea
                ref={textareaRef}
                className={`${inputClass} h-full min-h-[320px] font-mono text-[13px] leading-relaxed resize-y`}
                value={form.body}
                onChange={(e) => update({ body: e.target.value, edited: true })}
              />
            </div>
            <div className="grid grid-rows-[auto_1fr] gap-xs">
              <label className={`${labelClass} block`}>Vista previa</label>
              <div className="h-full min-h-[320px] border border-outline-variant rounded-lg p-md bg-surface-container-low text-body-sm text-slate-800 whitespace-pre-wrap break-words">
                {bodyBefore}
                {bodyAfter !== null && (
                  <>
                    <table className="border-collapse my-xs whitespace-normal">
                      <thead>
                        <tr>{PAYMENT_TABLE_HEADERS.map(h => <th key={h} className="border border-outline-variant px-2 py-1 bg-white text-left text-[11px]">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {paymentRows.map((row, idx) => (
                          <tr key={idx}>{paymentRowValues(row).map((v, i) => <td key={i} className="border border-outline-variant px-2 py-1 text-[11px]">{v}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                    {bodyAfter}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-xs">
            <label className={labelClass}>Adjuntos</label>
            <div className="space-y-xs">
              {invoiceOptions.map(({ inst, dte }) => (
                <label key={inst.id} className="flex items-center gap-xs text-body-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.dteInstallmentIds.includes(inst.id)}
                    onChange={() => update({ dteInstallmentIds: toggle(form.dteInstallmentIds, inst.id) })}
                  />
                  <span className="material-symbols-outlined text-[18px] text-emerald-600">verified</span>
                  Factura Nubox N° {dte.folio}{dte.environment === 'uat' ? ' (prueba)' : ''} · Cuota {inst.numQuota}
                </label>
              ))}
              {respaldoOptions.map(opt => (
                <label key={opt.url} className="flex items-center gap-xs text-body-sm cursor-pointer">
                  <input type="checkbox" checked={respaldoUrls.includes(opt.url)} onChange={() => setRespaldoUrls(toggle(respaldoUrls, opt.url))} />
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">attach_file</span>
                  {opt.label}
                </label>
              ))}
              {uploads.map((file, idx) => (
                <div key={idx} className="flex items-center gap-xs text-body-sm">
                  <span className="material-symbols-outlined text-[18px] text-emerald-600">draft</span>
                  <span className="truncate">{file.name}</span>
                  <button type="button" onClick={() => setUploads(uploads.filter((_, i) => i !== idx))} className="p-1 text-error hover:bg-red-50 rounded">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              ))}
              <label className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 border border-dashed border-slate-300 rounded-lg cursor-pointer text-body-sm font-semibold text-slate-600 transition-all">
                <span className="material-symbols-outlined text-[18px]">upload</span>
                Adjuntar archivo
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    setUploads([...uploads, ...Array.from(e.target.files || [])]);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>

          {error && (
            <div className="p-sm rounded-lg border border-error/30 bg-red-50 text-error text-body-sm flex items-start gap-xs">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-lg py-md flex justify-end gap-md border-t border-outline-variant/30 sticky bottom-0 bg-white z-10">
          <button type="button" onClick={onClose} disabled={isSending} className="px-lg py-sm font-semibold text-on-surface-variant hover:text-on-surface transition-all">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={isSending}
            className="bg-primary text-white px-xl py-sm rounded-lg font-semibold shadow-sm hover:bg-primary-container active:scale-95 transition-all flex items-center gap-xs disabled:opacity-60"
          >
            <span className={`material-symbols-outlined text-[18px] ${isSending ? 'animate-spin' : ''}`}>{isSending ? 'sync' : 'send'}</span>
            {isSending ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
