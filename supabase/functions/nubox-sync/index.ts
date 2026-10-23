import { checkDocument, corsHeaders, db, getActiveProfile, getConfig, json, type DteDocument } from '../_shared/nubox.ts';

// Polls Nubox for queued documents. Called every minute by pg_cron (x-worker-token)
// and by the ERP while the emission modal is open (user JWT + documentId).
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const config = await getConfig();
  if (!config?.base_url || !config.token) return json({ error: 'Nubox no configurado' }, 503);
  const workerToken = req.headers.get('x-worker-token');
  const isWorker = !!workerToken && workerToken === config.worker_token;
  if (!isWorker && !(await getActiveProfile(req))) return json({ error: 'No autorizado' }, 401);

  const body = await req.json().catch(() => ({}));
  const documentId = !isWorker && typeof body.documentId === 'string' ? body.documentId : null;
  const { data: claimed, error } = await db.rpc('claim_dte_documents', { target_id: documentId });
  if (error) return json({ error: 'Cola no disponible' }, 503);

  const results: DteDocument[] = [];
  for (const doc of (claimed ?? []) as DteDocument[]) {
    try {
      results.push(await checkDocument(config, doc));
    } catch (err) {
      console.error('sync failed', doc.id, err);
    }
  }

  if (documentId) {
    // Another worker may hold the lock; return the latest stored state either way.
    const { data: current } = await db.from('dte_documents').select('*').eq('id', documentId).maybeSingle();
    return json({ document: results.find(d => d.id === documentId) ?? current });
  }
  return json({ processed: results.length });
});
