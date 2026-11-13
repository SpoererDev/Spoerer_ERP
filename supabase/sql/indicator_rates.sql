-- Caché de indicadores económicos (UF y dólar observado) para facturación.
-- Los llena la Edge Function indicator-rates desde la API de la CMF (respaldo: mindicador.cl).
-- Secretos en Vault: cmf_api_key (API key de api.cmfchile.cl) y nubox_worker_token (token interno de pg_cron).

create table if not exists public.indicator_rates (
  currency text not null check (currency in ('UF', 'USD')),
  rate_date date not null,
  value numeric(14, 4) not null check (value > 0),
  source text not null check (source in ('cmf', 'mindicador')),
  fetched_at timestamptz not null default now(),
  primary key (currency, rate_date)
);

comment on table public.indicator_rates is
  'Valores diarios de UF y dólar observado. Escritura exclusiva de la Edge Function indicator-rates.';

alter table public.indicator_rates enable row level security;
revoke all on public.indicator_rates from anon, authenticated;
grant select on public.indicator_rates to authenticated;
drop policy if exists "Usuarios activos leen indicadores" on public.indicator_rates;
create policy "Usuarios activos leen indicadores" on public.indicator_rates
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'Active'));

create or replace function public.indicator_rates_config() returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'cmf_api_key', (select decrypted_secret from vault.decrypted_secrets where name = 'cmf_api_key'),
    'worker_token', (select decrypted_secret from vault.decrypted_secrets where name = 'nubox_worker_token')
  );
$$;
revoke all on function public.indicator_rates_config() from public, anon, authenticated;
grant execute on function public.indicator_rates_config() to service_role;

create or replace function public.invoke_indicator_rates_sync() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://cyxsrwdcqfdwwkihzuli.supabase.co/functions/v1/indicator-rates',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-token',
      (select decrypted_secret from vault.decrypted_secrets where name = 'nubox_worker_token')),
    body := '{"action":"sync"}'::jsonb, timeout_milliseconds := 30000);
end; $$;
revoke all on function public.invoke_indicator_rates_sync() from public, anon, authenticated;

-- Todos los días a las 09:15 y 13:15 hora de Chile aprox. (UTC-3): la CMF publica el dólar observado durante la mañana.
select cron.unschedule('indicator-rates-sync') where exists (select 1 from cron.job where jobname = 'indicator-rates-sync');
select cron.schedule('indicator-rates-sync', '15 12,16 * * *', 'select public.invoke_indicator_rates_sync()');
