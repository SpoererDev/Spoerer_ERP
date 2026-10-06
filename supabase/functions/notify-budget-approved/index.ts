import { createClient } from 'npm:@supabase/supabase-js@2.110.1';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const escape = (value: unknown) => String(value ?? '—').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const token = req.headers.get('x-notification-token');
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: config, error: configError } = await db.rpc('budget_notification_config');
  if (configError) return Response.json({ error: 'Configuration unavailable' }, { status: 503 });
  if (!config?.hook_token || token !== config.hook_token) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!config.enabled) return Response.json({ error: 'Sending paused until DNS verification' }, { status: 503 });
  if (!config.resend_key) return Response.json({ error: 'Resend not configured' }, { status: 503 });
  const { data: deliveries, error } = await db.rpc('claim_budget_notifications');
  if (error) return Response.json({ error: 'Queue unavailable' }, { status: 503 });
  let sent = 0;
  for (const delivery of deliveries ?? []) {
    try {
      // Honour disabled notifications and removed recipients, including on retries.
      const { data: setting, error: settingError } = await db.from('notification_settings').select('enabled,user_ids').eq('notification_type', 'budget_approved').maybeSingle();
      const { data: profile, error: profileError } = await db.from('profiles').select('status').eq('id', delivery.user_id).maybeSingle();
      if (settingError || profileError) throw new Error('Recipient configuration unavailable');
      if (!setting?.enabled || !setting.user_ids?.includes(delivery.user_id) || !['Active', 'Activo'].includes(profile?.status ?? '')) {
        const { error: cancelError } = await db.from('budget_notification_deliveries').update({ status: 'cancelled', locked_at: null }).eq('id', delivery.id);
        if (cancelError) throw new Error('Queue update failed');
        continue;
      }
      const p = delivery.payload;
      const amount = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(Number(p.amount ?? 0));
      const rows = [['Presupuesto', p.number], ['Descripción', p.title], ['Cliente', p.client], ['Proyecto', p.project], ['Monto', `${amount} ${p.currency}`], ['Empresa facturadora', p.company], ['Aprobación', new Date(p.approved_at).toLocaleString('es-CL', { timeZone: 'America/Santiago' })]];
      const text = `Se aprobó un nuevo presupuesto.\n\n${rows.map(([label, value]) => `${label}: ${value ?? '—'}`).join('\n')}\n\nAbrir ERP: https://erp.spoerer.cl/`;
      const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Presupuesto aprobado</title></head><body style="font-family:Arial,sans-serif;color:#1e293b"><h1>Nuevo presupuesto aprobado</h1><p>Se aprobó el siguiente presupuesto:</p><table>${rows.map(([label, value]) => `<tr><th scope="row" style="text-align:left;padding:8px">${escape(label)}</th><td style="padding:8px">${escape(value)}</td></tr>`).join('')}</table><p><a href="https://erp.spoerer.cl/">Abrir ERP Spoerer</a></p></body></html>`;
      // Each recipient gets an individual message; payload and idempotency key stay fixed on retries.
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${config.resend_key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `budget-approval/${delivery.id}` },
        body: JSON.stringify({ from: config.from, to: [delivery.recipient], subject: `Presupuesto aprobado: ${String(p.number ?? '').replace(/[\r\n]/g, '')}`, html, text }),
      });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        const { error: updateError } = await db.from('budget_notification_deliveries').update({ status: retryable && delivery.attempts < 8 ? 'pending' : 'failed', last_error: `Resend HTTP ${response.status}`, locked_at: null, next_attempt_at: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** delivery.attempts)).toISOString() }).eq('id', delivery.id);
        if (updateError) throw new Error('Queue update failed');
        continue;
      }
      const result = await response.json();
      if (!result.id) throw new Error('Missing provider message ID');
      const { error: updateError } = await db.from('budget_notification_deliveries').update({ status: 'sent', resend_id: result.id, sent_at: new Date().toISOString(), locked_at: null, last_error: null }).eq('id', delivery.id);
      if (updateError) throw new Error('Queue update failed');
      sent++;
    } catch {
      // Stop automatic retries before the provider's 24-hour idempotency window expires.
      const { error: updateError } = await db.from('budget_notification_deliveries').update({ status: delivery.attempts < 8 ? 'pending' : 'failed', locked_at: null, last_error: 'Transport or queue error', next_attempt_at: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** delivery.attempts)).toISOString() }).eq('id', delivery.id);
      if (updateError) console.error('Failed to update notification queue');
    }
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  return Response.json({ processed: deliveries?.length ?? 0, sent });
});
