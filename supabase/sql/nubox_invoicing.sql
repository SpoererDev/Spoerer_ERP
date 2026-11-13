-- Facturación electrónica vía Nubox (instalación inicial).
-- Las credenciales se guardan en Vault; ver supabase/README.md.

create schema if not exists nubox;
revoke all on schema nubox from public, anon, authenticated;

create table public.dte_documents (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid references public.billing_installments(id) on delete set null,
  budget_id uuid references public.budgets(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  installment_number text,
  billing_company text not null,
  environment text not null check (environment in ('uat', 'production')),
  document_type text not null check (document_type in ('33', '34')),
  status text not null default 'sending'
    check (status in ('sending', 'queued', 'pending_sii', 'issued', 'rejected', 'error')),
  idempotence_key uuid not null default gen_random_uuid() unique,
  nubox_id bigint,
  folio text,
  emission_status_id integer,
  emission_status_name text,
  track_id bigint,
  emission_date date,
  due_date date,
  currency text,
  planned_amount numeric,
  exchange_rate numeric,
  tax_percent numeric not null,
  net_amount numeric(14, 0) not null,
  exempt_amount numeric(14, 0) not null default 0,
  tax_amount numeric(14, 0) not null default 0,
  total_amount numeric(14, 0) not null,
  description text,
  request_payload jsonb not null,
  last_response jsonb,
  errors jsonb,
  pdf_path text,
  attempts integer not null default 0,
  next_check_at timestamptz not null default now(),
  locked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  issued_at timestamptz
);

comment on table public.dte_documents is
  'Documentos tributarios emitidos vía Nubox. Escritura exclusiva de las Edge Functions nubox-issue/nubox-sync.';

-- Una cuota no puede tener dos facturas en curso o emitidas; las rechazadas permiten reintentar.
create unique index dte_documents_one_active_per_installment
  on public.dte_documents (installment_id)
  where status in ('sending', 'queued', 'pending_sii', 'issued');
create unique index dte_documents_nubox_id_key on public.dte_documents (environment, nubox_id) where nubox_id is not null;
create index dte_documents_pending_idx on public.dte_documents (next_check_at)
  where status in ('sending', 'queued', 'pending_sii') or (status = 'issued' and pdf_path is null);
create index dte_documents_budget_id_idx on public.dte_documents (budget_id);
create index dte_documents_project_id_idx on public.dte_documents (project_id);
create index dte_documents_client_id_idx on public.dte_documents (client_id);
create index dte_documents_created_by_idx on public.dte_documents (created_by);

alter table public.dte_documents enable row level security;
revoke all on public.dte_documents from anon, authenticated;
grant select on public.dte_documents to authenticated;
create policy "Usuarios activos leen documentos tributarios" on public.dte_documents
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'Active'));

-- Evita que la sincronización de presupuestos (que borra y recrea cuotas) elimine cuotas con factura SII.
create function nubox.prevent_issued_installment_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.dte_documents d
    where d.installment_id = old.id and d.status in ('sending', 'queued', 'pending_sii', 'issued')
  ) then
    raise exception 'La cuota % tiene una factura electrónica en el SII y no puede eliminarse.', old.installment_number
      using errcode = 'P0001';
  end if;
  return old;
end; $$;
revoke all on function nubox.prevent_issued_installment_delete() from public, anon, authenticated;
create trigger prevent_issued_installment_delete before delete on public.billing_installments
  for each row execute function nubox.prevent_issued_installment_delete();

-- Bucket privado para los PDF; el frontend usa URLs firmadas.
insert into storage.buckets (id, name, public) values ('invoices', 'invoices', false)
  on conflict (id) do nothing;
create policy "Usuarios activos leen facturas" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'invoices'
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'Active')
  );

-- Secretos en Vault:
--   Ambiente activo: nubox_mode ('uat' o 'production')
--   UAT (pruebas):   nubox_base_url, nubox_token, nubox_api_key_spoerer
--   Producción:      nubox_prod_base_url, nubox_prod_token, nubox_prod_api_key_spoerer
--   Interno:         nubox_worker_token
-- Se cargan manualmente en el SQL Editor (ver README).

create or replace function public.nubox_config() returns jsonb
language sql security definer set search_path = '' as $$
  with mode as (
    select case
      when (select decrypted_secret from vault.decrypted_secrets where name = 'nubox_mode') = 'production'
        then 'production'
      else 'uat'
    end as env
  )
  select jsonb_build_object(
    'mode', mode.env,
    'base_url', (
      select decrypted_secret from vault.decrypted_secrets
      where name = case when mode.env = 'production' then 'nubox_prod_base_url' else 'nubox_base_url' end
    ),
    'token', (
      select decrypted_secret from vault.decrypted_secrets
      where name = case when mode.env = 'production' then 'nubox_prod_token' else 'nubox_token' end
    ),
    'api_keys', jsonb_build_object(
      'Spoerer', (
        select decrypted_secret from vault.decrypted_secrets
        where name = case when mode.env = 'production' then 'nubox_prod_api_key_spoerer' else 'nubox_api_key_spoerer' end
      )
    ),
    'worker_token', (select decrypted_secret from vault.decrypted_secrets where name = 'nubox_worker_token')
  )
  from mode;
$$;
revoke all on function public.nubox_config() from public, anon, authenticated;
grant execute on function public.nubox_config() to service_role;

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

select cron.schedule('nubox-dte-sync', '* * * * *', 'select nubox.invoke_sync()');
