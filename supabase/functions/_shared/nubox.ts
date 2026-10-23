import { createClient } from 'npm:@supabase/supabase-js@2.110.1';

export const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-worker-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

export type NuboxConfig = {
  base_url: string | null;
  token: string | null;
  api_keys: Record<string, string | null>;
  worker_token: string | null;
};

export type DteDocument = Record<string, any> & {
  id: string;
  status: string;
  attempts: number;
  billing_company: string;
  environment: string;
  idempotence_key: string;
  nubox_id: number | null;
  installment_id: string | null;
  request_payload: unknown;
};

export const getConfig = async (): Promise<NuboxConfig | null> => {
  const { data, error } = await db.rpc('nubox_config');
  if (error || !data) return null;
  return data as NuboxConfig;
};

export const environmentOf = (baseUrl: string) => (/test|uat/i.test(baseUrl) ? 'uat' : 'production');

export const configuredCompanies = (config: NuboxConfig | null) =>
  config?.base_url && config.token
    ? Object.entries(config.api_keys ?? {}).filter(([, key]) => !!key).map(([company]) => company)
    : [];

// Authenticated ERP user with an active profile, or null.
export const getActiveProfile = async (req: Request) => {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data: { user } = { user: null }, error } = await db.auth.getUser(jwt);
  if (error || !user) return null;
  const { data: profile } = await db.from('profiles').select('id,name,status').eq('id', user.id).maybeSingle();
  return profile?.status === 'Active' ? profile : null;
};

const nuboxFetch = (config: NuboxConfig, company: string, path: string, init: RequestInit = {}) =>
  fetch(`${config.base_url!.replace(/\/+$/, '')}${path}`, {
    ...init,
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${config.token}`,
      'X-Api-Key': config.api_keys[company] ?? '',
      ...(init.headers ?? {}),
    },
  });

const backoff = (attempts: number) =>
  new Date(Date.now() + Math.min(30 * 60000, 10000 * 2 ** Math.min(attempts, 8))).toISOString();

const chileDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

const updateDocument = async (doc: DteDocument, updates: Record<string, unknown>) => {
  const { data, error } = await db.from('dte_documents')
    .update({ ...updates, locked_at: null, updated_at: new Date().toISOString() })
    .eq('id', doc.id).select().single();
  if (error) throw new Error(`No se pudo actualizar el documento ${doc.id}: ${error.message}`);
  return data as DteDocument;
};

// Transient failures keep the same idempotence key so a retry never issues a second invoice.
const retryLater = (doc: DteDocument, message: string, extra: Record<string, unknown> = {}) =>
  doc.attempts >= 8 && doc.status === 'sending'
    ? updateDocument(doc, { ...extra, status: 'error', errors: [{ message }] })
    : updateDocument(doc, { ...extra, errors: [{ message }], next_check_at: backoff(doc.attempts) });

export const submitDocument = async (config: NuboxConfig, doc: DteDocument) => {
  let response: Response;
  try {
    response = await nuboxFetch(config, doc.billing_company, '/v1/sales/issuance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-idempotence-id': doc.idempotence_key },
      body: JSON.stringify(doc.request_payload),
    });
  } catch {
    return retryLater(doc, 'Sin conexión con Nubox; se reintentará automáticamente.');
  }
  const body = await response.json().catch(() => null);
  if (response.status === 429 || response.status >= 500) {
    return retryLater(doc, `Nubox respondió HTTP ${response.status}; se reintentará automáticamente.`, { last_response: body });
  }
  const item = Array.isArray(body) ? (body.find((i: any) => i?.sequence === 1) ?? body[0]) : null;
  const errors = item?.errors?.length
    ? item.errors
    : !response.ok
      ? (body?.errors?.length ? body.errors : [{ message: body?.message ?? `Nubox respondió HTTP ${response.status}` }])
      : null;
  if (errors) {
    return updateDocument(doc, { status: 'rejected', errors, last_response: body, nubox_id: item?.id ?? null });
  }
  if (!item?.id) {
    return updateDocument(doc, { status: 'error', errors: [{ message: 'Nubox no devolvió identificador del documento.' }], last_response: body });
  }
  return updateDocument(doc, {
    status: 'queued', nubox_id: item.id, errors: null, last_response: body,
    next_check_at: new Date(Date.now() + 5000).toISOString(),
  });
};

const storePdf = async (config: NuboxConfig, doc: DteDocument) => {
  try {
    const response = await nuboxFetch(config, doc.billing_company, `/v1/sales/${doc.nubox_id}/pdf?template=TEMPLATE_A4`, {
      headers: { Accept: 'application/pdf' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const year = (doc.emission_date ?? new Date().toISOString()).slice(0, 4);
    const path = `${doc.billing_company}/${doc.environment}/${year}/factura_${doc.folio}_${doc.nubox_id}.pdf`;
    const { error } = await db.storage.from('invoices').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
    return updateDocument(doc, { pdf_path: path });
  } catch (err) {
    return updateDocument(doc, {
      errors: [{ message: `Factura emitida, PDF pendiente: ${err instanceof Error ? err.message : err}` }],
      next_check_at: backoff(doc.attempts),
    });
  }
};

export const checkDocument = async (config: NuboxConfig, doc: DteDocument): Promise<DteDocument> => {
  if (doc.status === 'sending') return submitDocument(config, doc);
  if (doc.status === 'issued') return storePdf(config, doc);

  let response: Response;
  try {
    response = await nuboxFetch(config, doc.billing_company, `/v1/sales/${doc.nubox_id}`);
  } catch {
    return retryLater(doc, 'Sin conexión con Nubox al consultar el estado.');
  }
  // Right after issuance the document may not be queryable yet.
  if (!response.ok) return retryLater(doc, `Consulta de estado: HTTP ${response.status}`);
  const sale = await response.json();
  const statusId = sale?.emissionStatus?.id ?? null;
  const common = {
    emission_status_id: statusId,
    emission_status_name: sale?.emissionStatus?.name ?? null,
    track_id: sale?.dataCl?.trackId ?? null,
    last_response: sale,
  };

  if (statusId === 1 && sale.number) {
    const emissionDate = sale.emissionDate ? chileDate(sale.emissionDate) : chileDate(new Date().toISOString());
    // The PDF is fetched on the next check so the ERP can show the folio without waiting for it.
    const issued = await updateDocument(doc, {
      ...common, status: 'issued', folio: String(sale.number), emission_date: emissionDate,
      issued_at: new Date().toISOString(), errors: null, next_check_at: new Date().toISOString(),
    });
    if (doc.installment_id) {
      const { error } = await db.from('billing_installments').update({
        status: 'Facturada',
        invoice_number: String(sale.number),
        actual_invoice_date: emissionDate,
        tax_percent: doc.tax_percent,
        net_amount_clp: Number(doc.net_amount) + Number(doc.exempt_amount),
        tax_amount_clp: doc.tax_amount,
        total_amount_clp: doc.total_amount,
      }).eq('id', doc.installment_id);
      if (error) console.error('installment update failed', doc.id, error.message);
    }
    return issued;
  }
  if (statusId === 3 || statusId === 5) {
    return updateDocument(doc, {
      ...common, status: 'rejected',
      errors: [{ message: sale.emissionStatus.description || sale.emissionStatus.name }],
    });
  }
  return updateDocument(doc, { ...common, status: 'pending_sii', next_check_at: backoff(doc.attempts) });
};
