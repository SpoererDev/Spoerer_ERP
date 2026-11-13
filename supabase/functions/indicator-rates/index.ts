// Caché de UF y dólar observado en public.indicator_rates.
// Acciones:
//   sync  -> (pg_cron, x-worker-token) carga desde la CMF el año anterior, el año actual y los valores futuros publicados de UF.
//   get   -> (usuario activo) devuelve el valor de una fecha; si no está en caché lo consulta a la CMF y, si falla, a mindicador.cl.
import { corsHeaders, db, getActiveProfile, json } from '../_shared/nubox.ts';

type Currency = 'UF' | 'USD';
type Rate = { currency: Currency; rate_date: string; value: number; source: 'cmf' | 'mindicador' };

const CMF_BASE = 'https://api.cmfchile.cl/api-sbifv3/recursos_api';
const TIMEOUT_MS = 8000;
// El dólar no se publica fines de semana ni feriados: se usa el último valor disponible hasta 10 días antes.
const USD_LOOKBACK_DAYS = 10;

const getConfig = async () => {
  const { data, error } = await db.rpc('indicator_rates_config');
  if (error) console.error('indicator_rates_config failed', error.message);
  return (data ?? {}) as { cmf_api_key?: string | null; worker_token?: string | null };
};

const isIsoDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const todayChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// "39.643,59" -> 39643.59
const parseChileanNumber = (value: unknown) => Number(String(value ?? '').replace(/\./g, '').replace(',', '.'));

// Respuesta CMF: { "UFs": [{ "Valor": "39.643,59", "Fecha": "2026-11-13" }] } o { "Dolares": [...] }
const cmfFetch = async (apiKey: string, currency: Currency, path: string): Promise<Rate[]> => {
  const resource = currency === 'UF' ? 'uf' : 'dolar';
  const url = `${CMF_BASE}/${resource}${path}?apikey=${encodeURIComponent(apiKey)}&formato=json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`CMF ${resource}${path}: HTTP ${response.status}`);
  const body = await response.json().catch(() => null);
  const list = body && (body.UFs ?? body.Dolares ?? Object.values(body).find(Array.isArray));
  if (!Array.isArray(list)) throw new Error(`CMF ${resource}${path}: respuesta sin datos`);
  return list
    .map((item: any) => ({ currency, rate_date: String(item?.Fecha ?? ''), value: parseChileanNumber(item?.Valor), source: 'cmf' as const }))
    .filter((r) => isIsoDate(r.rate_date) && r.value > 0);
};

const mindicadorFetch = async (currency: Currency, date: string): Promise<Rate[]> => {
  const [y, m, d] = date.split('-');
  const resource = currency === 'UF' ? 'uf' : 'dolar';
  const response = await fetch(`https://mindicador.cl/api/${resource}/${d}-${m}-${y}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`mindicador ${resource}: HTTP ${response.status}`);
  const body = await response.json();
  return (body?.serie ?? [])
    .map((item: any) => ({
      currency,
      rate_date: new Date(item.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }),
      value: Number(item.valor),
      source: 'mindicador' as const,
    }))
    .filter((r: Rate) => isIsoDate(r.rate_date) && r.value > 0);
};

const saveRates = async (rates: Rate[]) => {
  if (!rates.length) return 0;
  const unique = [...new Map(rates.map((r) => [`${r.currency}|${r.rate_date}`, r])).values()];
  const { error } = await db.from('indicator_rates')
    .upsert(unique.map((r) => ({ ...r, fetched_at: new Date().toISOString() })), { onConflict: 'currency,rate_date' });
  if (error) throw new Error(`No se pudieron guardar los indicadores: ${error.message}`);
  return unique.length;
};

// Valor guardado para la fecha (UF exacta; dólar: último día hábil dentro de la ventana).
const readCached = async (currency: Currency, date: string) => {
  let query = db.from('indicator_rates').select('currency,rate_date,value,source').eq('currency', currency);
  query = currency === 'UF'
    ? query.eq('rate_date', date)
    : query.lte('rate_date', date).gte('rate_date', addDays(date, -USD_LOOKBACK_DAYS));
  const { data } = await query.order('rate_date', { ascending: false }).limit(1);
  return data?.[0] ?? null;
};

const sync = async (apiKey: string) => {
  const today = todayChile();
  const [year, month, day] = today.split('-');
  const previousYear = String(Number(year) - 1);
  const tasks: Array<[Currency, string]> = [
    ['UF', `/${previousYear}`],
    ['UF', `/${year}`],
    ['UF', `/posteriores/${year}/${month}/dias/${day}`], // valores ya publicados hasta el día 9 del mes siguiente
    ['USD', `/${previousYear}`],
    ['USD', `/${year}`],
  ];
  const results = await Promise.allSettled(tasks.map(([currency, path]) => cmfFetch(apiKey, currency, path)));
  const rates = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const errors = results.flatMap((r, i) => (r.status === 'rejected' ? [`${tasks[i][0]}${tasks[i][1]}: ${r.reason?.message ?? r.reason}`] : []));
  const saved = await saveRates(rates);
  if (errors.length) console.error('indicator sync errors', errors);
  return { saved, errors };
};

const fetchOnDemand = async (apiKey: string | null | undefined, currency: Currency, date: string) => {
  const [y, m, d] = date.split('-');
  const errors: string[] = [];
  if (apiKey) {
    try {
      // UF: el día exacto. Dólar: el mes completo, para cubrir fines de semana y feriados.
      const rates = currency === 'UF'
        ? await cmfFetch(apiKey, currency, `/${y}/${m}/dias/${d}`)
        : await cmfFetch(apiKey, currency, `/${y}/${m}`);
      await saveRates(rates);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  let cached = await readCached(currency, date);
  if (!cached) {
    try {
      await saveRates(await mindicadorFetch(currency, date));
      cached = await readCached(currency, date);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { cached, errors };
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const config = await getConfig();
  const body = await req.json().catch(() => ({}));
  const workerToken = req.headers.get('x-worker-token');
  const isWorker = !!workerToken && !!config.worker_token && workerToken === config.worker_token;
  if (!isWorker && !(await getActiveProfile(req))) return json({ error: 'No autorizado' }, 401);

  try {
    if (body.action === 'sync') {
      if (!config.cmf_api_key) return json({ error: 'Falta el secreto cmf_api_key en Vault.' }, 500);
      return json(await sync(config.cmf_api_key));
    }

    const currency: Currency = body.currency === 'USD' ? 'USD' : 'UF';
    const date = isIsoDate(body.date) ? body.date : todayChile();
    const hit = await readCached(currency, date);
    if (hit) return json({ ...hit, cached: true });

    const { cached, errors } = await fetchOnDemand(config.cmf_api_key, currency, date);
    if (cached) return json({ ...cached, cached: false });
    return json({ error: `No hay valor de ${currency === 'UF' ? 'la UF' : 'del dólar'} para el ${date.split('-').reverse().join('/')}.`, details: errors }, 404);
  } catch (err) {
    console.error('indicator-rates failed', err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
