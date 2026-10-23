import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { corsHeaders, db, getActiveProfile, json } from '../_shared/nubox.ts';

// Sends a templated e-mail about one or more installments from secretaria@spoerer.cl (Resend)
// and records it in client_emails. Attachments are resolved server-side from allowed sources only.

const TEMPLATES = ['approval_request', 'oc_request', 'invoice', 'payment_request', 'other'];
const PAYMENT_TABLE_TOKEN = '[TABLA DE PAGOS]';
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Recipient = { name?: string; email: string };
type AttachmentRequest =
  | { source: 'dte'; installmentId: string }
  | { source: 'upload'; path: string; name?: string }
  | { source: 'respaldo'; installmentId: string; url: string; name?: string };

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const oneLine = (value: unknown, max: number) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
const formatDate = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const formatNumber = (value: unknown, decimals = 0) =>
  value === null || value === undefined || value === '' ? '—'
    : new Intl.NumberFormat('es-CL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value));
const safeFileName = (name: string) => name.replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, '_').slice(0, 120) || 'adjunto';

const parseRecipients = (value: unknown, max: number): Recipient[] | null => {
  if (!Array.isArray(value) || value.length > max) return null;
  const list = value.map((r: any) => ({ name: oneLine(r?.name, 100), email: oneLine(r?.email, 200).toLowerCase() }));
  return list.every(r => EMAIL_RE.test(r.email)) ? list : null;
};
const formatRecipient = (r: Recipient) => (r.name ? `${r.name.replace(/[<>"]/g, '')} <${r.email}>` : r.email);

// Plain text → HTML: escaped, blank-line paragraphs, line breaks and clickable links.
const linkify = (escaped: string) =>
  escaped.replace(/\b((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:)])/gi, match => {
    const href = match.startsWith('www.') ? `https://${match}` : match;
    return `<a href="${href}" style="color:#006a61">${match}</a>`;
  });
const textToHtml = (text: string) =>
  text.split(/\n{2,}/).filter(p => p.trim()).map(p => `<p style="margin:0 0 12px">${linkify(escapeHtml(p)).replace(/\n/g, '<br>')}</p>`).join('');

type PaymentRow = { folio: string; emission: string; project: string; comment: string; quota: string; amountUf: string; amountClp: string };
const PAYMENT_HEADERS = ['Folio factura', 'Fecha emisión', 'Proyecto', 'Comentario', 'N° cuota', 'Monto', 'Monto pesos'];
const paymentRowValues = (r: PaymentRow) => [r.folio, r.emission, r.project, r.comment, r.quota, r.amountUf, r.amountClp];
const paymentTableHtml = (rows: PaymentRow[]) => {
  const cell = 'border:1px solid #c5c6cd;padding:6px 10px;text-align:left;font-size:13px';
  return `<table style="border-collapse:collapse;margin:0 0 12px"><thead><tr>${PAYMENT_HEADERS.map(h => `<th style="${cell};background:#eff4ff">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${
    rows.map(r => `<tr>${paymentRowValues(r).map(v => `<td style="${cell}">${escapeHtml(v)}</td>`).join('')}</tr>`).join('')
  }</tbody></table>`;
};
const paymentTableText = (rows: PaymentRow[]) =>
  rows.map(r => PAYMENT_HEADERS.map((h, i) => `${h}: ${paymentRowValues(r)[i]}`).join(' | ')).join('\n');

const budgetsPathFromUrl = (url: string) => {
  const marker = '/storage/v1/object/public/budgets/';
  const index = url.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length).split('?')[0]);
};

const download = async (bucket: string, path: string) => {
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`No se pudo leer el adjunto ${path.split('/').pop()}`);
  return new Uint8Array(await data.arrayBuffer());
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const profile = await getActiveProfile(req);
  if (!profile) return json({ error: 'No autorizado' }, 401);
  const body = await req.json().catch(() => ({}));

  const template = String(body.template ?? '');
  const installmentIds: string[] = Array.isArray(body.installmentIds) ? body.installmentIds.map(String) : [];
  const to = parseRecipients(body.to, 10);
  const cc = parseRecipients(body.cc ?? [], 10);
  const subject = oneLine(body.subject, 250);
  const bodyText = String(body.bodyText ?? '').replace(/\r\n/g, '\n').slice(0, 20000);
  const attachmentRequests: AttachmentRequest[] = Array.isArray(body.attachments) ? body.attachments.slice(0, 10) : [];
  const idempotencyKey = UUID_RE.test(String(body.idempotencyKey ?? '')) ? String(body.idempotencyKey) : crypto.randomUUID();

  const errors: string[] = [];
  if (!TEMPLATES.includes(template)) errors.push('Plantilla no válida.');
  if (!installmentIds.length || installmentIds.length > 30 || !installmentIds.every(id => UUID_RE.test(id))) errors.push('Cuotas no válidas.');
  if (!to?.length) errors.push('Ingrese al menos un destinatario con correo válido.');
  if (!cc) errors.push('Hay correos en copia no válidos.');
  if (!subject) errors.push('Ingrese el asunto.');
  if (!bodyText.trim()) errors.push('Ingrese el mensaje.');
  if (errors.length) return json({ error: errors.join(' ') }, 400);

  const { data: installments, error: instError } = await db.from('billing_installments')
    .select('id,project_id,origin_budget_id,installment_number,invoice_number,actual_invoice_date,comment,planned_amount_uf,currency,net_amount_clp,total_amount_clp,invoice_file_url,oc_file_url,payment_backup_url,other_files')
    .in('id', installmentIds);
  if (instError || !installments || installments.length !== new Set(installmentIds).size) return json({ error: 'Cuota no encontrada.' }, 404);
  const primary = installments.find(i => i.id === installmentIds[0])!;

  const { data: dtes } = await db.from('dte_documents')
    .select('installment_id,folio,emission_date,pdf_path,status')
    .in('installment_id', installmentIds).eq('status', 'issued');
  const dteFor = (id: string) => (dtes ?? []).find(d => d.installment_id === id) ?? null;

  // Payment table is built from stored data so the client always sees the recorded amounts.
  let paymentRows: PaymentRow[] = [];
  if (bodyText.includes(PAYMENT_TABLE_TOKEN)) {
    const projectIds = [...new Set(installments.map(i => i.project_id).filter(Boolean))];
    const { data: projects } = projectIds.length
      ? await db.from('projects').select('id,project_number,project_name').in('id', projectIds)
      : { data: [] };
    paymentRows = installmentIds.map(id => {
      const inst = installments.find(i => i.id === id)!;
      const dte = dteFor(id);
      const project = (projects ?? []).find(p => p.id === inst.project_id);
      const currency = (inst.currency || 'UF').toUpperCase();
      return {
        folio: dte?.folio || inst.invoice_number || '—',
        emission: formatDate(dte?.emission_date || inst.actual_invoice_date),
        project: project ? `${project.project_number} - ${project.project_name}` : '—',
        comment: inst.comment || '—',
        quota: inst.installment_number || '—',
        amountUf: currency === 'CLP' ? '—' : `${formatNumber(inst.planned_amount_uf, 2)} ${currency}`,
        amountClp: inst.total_amount_clp != null ? `$${formatNumber(inst.total_amount_clp)}` : '—',
      };
    });
  }

  // Resolve attachments only from the requested installments' documents or the user's own uploads.
  const attachments: { filename: string; content: string }[] = [];
  const attachmentLog: { name: string; source: string }[] = [];
  let totalBytes = 0;
  try {
    for (const request of attachmentRequests) {
      let bytes: Uint8Array;
      let filename: string;
      if (request?.source === 'dte' && installmentIds.includes(request.installmentId)) {
        const dte = dteFor(request.installmentId);
        if (!dte?.pdf_path) throw new Error('La factura aún no tiene PDF disponible.');
        bytes = await download('invoices', dte.pdf_path);
        filename = `Factura_${dte.folio}.pdf`;
      } else if (request?.source === 'upload' && typeof request.path === 'string'
        && request.path.startsWith(`${profile.id}/`) && !request.path.includes('..')) {
        bytes = await download('email-attachments', request.path);
        filename = request.name || request.path.split('/').pop()!;
      } else if (request?.source === 'respaldo' && installmentIds.includes(request.installmentId)) {
        const inst = installments.find(i => i.id === request.installmentId)!;
        const allowed = [inst.invoice_file_url, inst.oc_file_url, inst.payment_backup_url, ...((inst.other_files ?? []) as any[]).map(f => f?.url)];
        const path = allowed.includes(request.url) ? budgetsPathFromUrl(request.url) : null;
        if (!path) throw new Error('Adjunto no permitido.');
        bytes = await download('budgets', path);
        filename = request.name || path.split('/').pop()!;
      } else {
        throw new Error('Adjunto no permitido.');
      }
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_ATTACHMENT_BYTES) throw new Error('Los adjuntos superan 25 MB en total.');
      attachments.push({ filename: safeFileName(filename), content: encodeBase64(bytes) });
      attachmentLog.push({ name: safeFileName(filename), source: request.source });
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'No se pudieron preparar los adjuntos.' }, 400);
  }

  const { data: config, error: configError } = await db.rpc('client_email_config');
  if (configError || !config?.resend_key) return json({ error: 'El envío de correos no está configurado.' }, 503);

  const [beforeTable, afterTable] = bodyText.includes(PAYMENT_TABLE_TOKEN)
    ? [bodyText.slice(0, bodyText.indexOf(PAYMENT_TABLE_TOKEN)), bodyText.slice(bodyText.indexOf(PAYMENT_TABLE_TOKEN) + PAYMENT_TABLE_TOKEN.length)]
    : [bodyText, null];
  const htmlBody = afterTable === null
    ? textToHtml(beforeTable)
    : `${textToHtml(beforeTable)}${paymentTableHtml(paymentRows)}${textToHtml(afterTable)}`;
  const text = afterTable === null ? bodyText : `${beforeTable}${paymentTableText(paymentRows)}${afterTable}`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1e293b">${htmlBody}</body></html>`;

  let resendId: string | null = null;
  let sendError: string | null = null;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${config.resend_key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `client-email/${idempotencyKey}` },
      body: JSON.stringify({
        from: config.from,
        to: to!.map(formatRecipient),
        cc: cc!.length ? cc!.map(formatRecipient) : undefined,
        bcc: [config.mailbox],
        reply_to: config.mailbox,
        subject,
        html,
        text,
        attachments: attachments.length ? attachments : undefined,
      }),
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.id) resendId = result.id;
    else sendError = result?.message ? `Resend: ${result.message}` : `Resend respondió HTTP ${response.status}`;
  } catch {
    sendError = 'Sin conexión con el servicio de correo.';
  }

  const { data: logged, error: logError } = await db.from('client_emails').insert({
    template,
    installment_ids: installmentIds,
    project_id: primary.project_id,
    budget_id: primary.origin_budget_id,
    subject,
    to_recipients: to,
    cc,
    body_text: bodyText,
    attachments: attachmentLog,
    status: resendId ? 'sent' : 'failed',
    resend_id: resendId,
    error: sendError,
    sent_by: profile.id,
  }).select().single();
  if (logError) console.error('client_emails insert failed', logError.message);

  // Uploaded files are only needed for this message.
  const uploadPaths = attachmentRequests.filter(a => a?.source === 'upload').map(a => (a as { path: string }).path);
  if (resendId && uploadPaths.length) await db.storage.from('email-attachments').remove(uploadPaths);

  if (!resendId) return json({ error: sendError, email: logged }, 502);
  return json({ email: logged });
});
