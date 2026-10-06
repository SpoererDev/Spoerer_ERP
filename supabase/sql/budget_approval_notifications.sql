create schema if not exists budget_notifications;
revoke all on schema budget_notifications from public, anon, authenticated;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create table public.budget_notification_deliveries (
 id uuid primary key default gen_random_uuid(),
 budget_id uuid not null references public.budgets(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 recipient text not null,
 payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','cancelled')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 locked_at timestamptz,
 sent_at timestamptz,
 resend_id text,
 last_error text,
 created_at timestamptz not null default now()
);
alter table public.budget_notification_deliveries enable row level security;
revoke all on public.budget_notification_deliveries from anon, authenticated;
grant all on public.budget_notification_deliveries to service_role;
create index budget_notification_pending_idx on public.budget_notification_deliveries(next_attempt_at) where status in ('pending','processing');
create policy service_role_only on public.budget_notification_deliveries for all to service_role using (true) with check (true);
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'budget_notification_hook_token');
select vault.create_secret('false','budget_notification_enabled');
create function public.budget_notification_config() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object(
 'hook_token',(select decrypted_secret from vault.decrypted_secrets where name='budget_notification_hook_token'),
 'resend_key',(select decrypted_secret from vault.decrypted_secrets where name='budget_notification_resend_key'),
 'enabled',coalesce((select decrypted_secret='true' from vault.decrypted_secrets where name='budget_notification_enabled'),false),
 'from','Spoerer ERP <notificaciones@spoerer.cl>');
$$;
revoke all on function public.budget_notification_config() from public,anon,authenticated;
grant execute on function public.budget_notification_config() to service_role;
create function public.claim_budget_notifications() returns setof public.budget_notification_deliveries language sql security definer set search_path='' as $$
 update public.budget_notification_deliveries set status='processing',locked_at=now(),attempts=attempts+1
 where id in (
 select id from public.budget_notification_deliveries
 where (status='pending' and next_attempt_at<=now()) or (status='processing' and locked_at<now()-interval '5 minutes')
 order by created_at for update skip locked limit 10
 ) returning *;
$$;
revoke all on function public.claim_budget_notifications() from public,anon,authenticated;
grant execute on function public.claim_budget_notifications() to service_role;
create function budget_notifications.invoke_worker() returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.budget_notification_deliveries where status in ('pending','processing')) then
 perform net.http_post(
 url:='https://cyxsrwdcqfdwwkihzuli.supabase.co/functions/v1/notify-budget-approved',
 headers:=jsonb_build_object('Content-Type','application/json','x-notification-token',
 (select decrypted_secret from vault.decrypted_secrets where name='budget_notification_hook_token')),
 body:='{}'::jsonb,timeout_milliseconds:=1000);
 end if;
end; $$;
revoke all on function budget_notifications.invoke_worker() from public,anon,authenticated;
create function budget_notifications.enqueue_approval() returns trigger language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
 if new.status not in ('Aprobado','Aprovado') or new.project_id is null then return new; end if;
 if TG_OP='UPDATE' then
 if old.status in ('Aprobado','Aprovado') and old.project_id is not null then return new; end if;
 end if;
 select jsonb_build_object('number',new.budget_number,'title',new.title,'amount',new.total_amount,
 'currency',coalesce(new.currency,'UF'),'company',new.billing_company,
 'project',concat_ws(' - ',p.project_number,p.project_name),
 'client',coalesce(m.name,c.company_name),'approved_at',now()) into snapshot
 from public.projects p left join public.main_clients m on m.id=coalesce(new.main_client_id,p.main_client_id)
 left join public.clients c on c.id=coalesce(new.legal_entity_id,new.client_id,p.client_id)
 where p.id=new.project_id;
 insert into public.budget_notification_deliveries(budget_id,user_id,recipient,payload)
 select new.id,p.id,lower(trim(p.email)),snapshot from public.notification_settings n
 join public.profiles p on p.id=any(n.user_ids)
 where n.notification_type='budget_approved' and n.enabled=true and p.status in ('Active','Activo')
 and p.email is not null and trim(p.email)<>'';
 begin
 perform budget_notifications.invoke_worker();
 exception when others then
 raise warning 'Budget notification queued; worker invocation failed';
 end;
 return new;
end; $$;
revoke all on function budget_notifications.enqueue_approval() from public,anon,authenticated;
create trigger enqueue_budget_approved_notification after insert or update of status,project_id on public.budgets
 for each row execute function budget_notifications.enqueue_approval();
select cron.schedule('budget-approved-email-retry','*/5 * * * *','select budget_notifications.invoke_worker()');

