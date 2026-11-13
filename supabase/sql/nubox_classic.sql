-- Facturación electrónica vía la API clásica de Nubox (Nubox.API).
-- Se aplica después de nubox_invoicing.sql. Las credenciales se guardan en Vault; ver supabase/README.md.
--
-- Secretos en Vault:
--   nubox_provider                 'classic' (por defecto) o 'pyme' (reactiva la integración de la API nueva)
--   nubox_classic_base_url         https://api.nubox.com/Nubox.API  (o https://api.nubox.com/Nubox.API.cert)
--   nubox_classic_user             usuario de la API clásica
--   nubox_classic_password         contraseña de la API clásica
--   nubox_classic_rut_empresa      RUT de Spoerer con DV (ej. 76127237-3)
--   nubox_classic_rut_funcionario  RUT del funcionario emisor con DV
--   nubox_classic_sistema          sistema de Nubox a usar (por defecto SERVIFACTURA)

-- Proveedor y datos de emisión por documento.
alter table public.dte_documents
  add column if not exists provider text not null default 'pyme' check (provider in ('pyme', 'classic')),
  add column if not exists is_draft boolean not null default false,
  add column if not exists response_text text;

comment on column public.dte_documents.provider is 'API de Nubox usada: pyme (API nueva) o classic (Nubox.API).';
comment on column public.dte_documents.is_draft is 'true si se envió con emitir=false (queda como borrador en Nubox).';

-- Sesión de la API clásica: el token vence tras 15 minutos sin uso. Solo la usa service_role (RLS sin políticas).
create table if not exists public.nubox_classic_sessions (
  base_url text primary key,
  token text not null,
  numero_serie text not null,
  rut_empresa text,
  api_user text,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.nubox_classic_sessions enable row level security;
revoke all on public.nubox_classic_sessions from public, anon, authenticated;
comment on table public.nubox_classic_sessions is
  'Token vigente de la API clásica de Nubox. Lectura y escritura exclusiva de la Edge Function nubox-classic.';

create or replace function public.nubox_classic_config() returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'provider', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'nubox_provider'), 'classic'),
    'base_url', (select decrypted_secret from vault.decrypted_secrets where name = 'nubox_classic_base_url'),
    'user', (select decrypted_secret from vault.decrypted_secrets where name = 'nubox_classic_user'),
    'password', (select decrypted_secret from vault.decrypted_secrets where name = 'nubox_classic_password'),
    'rut_empresa', (select decrypted_secret from vault.decrypted_secrets where name = 'nubox_classic_rut_empresa'),
    'rut_funcionario', (select decrypted_secret from vault.decrypted_secrets where name = 'nubox_classic_rut_funcionario'),
    'sistema', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'nubox_classic_sistema'), 'SERVIFACTURA')
  );
$$;
revoke all on function public.nubox_classic_config() from public, anon, authenticated;
grant execute on function public.nubox_classic_config() to service_role;

-- La sincronización por cron (nubox-sync) solo procesa documentos de la API nueva.
create or replace function public.claim_dte_documents(target_id uuid default null) returns setof public.dte_documents
language sql security definer set search_path = '' as $$
  with active_mode as (
    select case
      when (select decrypted_secret from vault.decrypted_secrets where name = 'nubox_mode') = 'production'
        then 'production'
      else 'uat'
    end as env
  )
  update public.dte_documents set locked_at = now(), attempts = attempts + 1
  where id in (
    select d.id from public.dte_documents d, active_mode m
    where d.environment = m.env
      and d.provider = 'pyme'
      and (d.status in ('sending', 'queued', 'pending_sii') or (d.status = 'issued' and d.pdf_path is null))
      and (d.locked_at is null or d.locked_at < now() - interval '2 minutes')
      and (case when target_id is null then d.next_check_at <= now() else d.id = target_id end)
    order by d.next_check_at for update of d skip locked limit 20
  ) returning *;
$$;
revoke all on function public.claim_dte_documents(uuid) from public, anon, authenticated;
grant execute on function public.claim_dte_documents(uuid) to service_role;

create or replace function nubox.invoke_sync() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_env text;
begin
  v_env := case
    when (select decrypted_secret from vault.decrypted_secrets where name = 'nubox_mode') = 'production'
      then 'production'
    else 'uat'
  end;

  if exists (
    select 1 from public.dte_documents
    where environment = v_env
      and provider = 'pyme'
      and (status in ('sending', 'queued', 'pending_sii') or (status = 'issued' and pdf_path is null))
      and next_check_at <= now()
  ) then
    perform net.http_post(
      url := 'https://cyxsrwdcqfdwwkihzuli.supabase.co/functions/v1/nubox-sync',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-token',
        (select decrypted_secret from vault.decrypted_secrets where name = 'nubox_worker_token')),
      body := '{}'::jsonb, timeout_milliseconds := 1000);
  end if;
end; $$;
revoke all on function nubox.invoke_sync() from public, anon, authenticated;

-- Usuario de Nubox dueño del token (si cambian las credenciales en Vault se fuerza una nueva autenticación).
alter table public.nubox_classic_sessions add column if not exists api_user text;
