-- Opción "Encargado del proyecto" en la configuración de notificaciones.
-- Si include_project_manager = true, el usuario cuyo nombre coincide con projects.encargado
-- también recibe la notificación (aprobación de presupuesto) o va en copia (correos a clientes).
alter table public.notification_settings
  add column if not exists include_project_manager boolean not null default false;

create or replace function budget_notifications.enqueue_approval() returns trigger language plpgsql security definer set search_path='' as $$
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
 select new.id,r.id,r.email,snapshot from (
  select distinct on (lower(trim(p.email))) p.id, lower(trim(p.email)) as email
  from public.notification_settings n
  join public.profiles p on (
    p.id=any(n.user_ids)
    or (n.include_project_manager and exists(
      select 1 from public.projects pr
      where pr.id=new.project_id and nullif(trim(pr.encargado),'') is not null
        and lower(trim(pr.encargado))=lower(trim(p.name))))
  )
  where n.notification_type='budget_approved' and n.enabled=true and p.status in ('Active','Activo')
  and p.email is not null and trim(p.email)<>''
 ) r;
 begin
 perform budget_notifications.invoke_worker();
 exception when others then
 raise warning 'Budget notification queued; worker invocation failed';
 end;
 return new;
end; $$;
revoke all on function budget_notifications.enqueue_approval() from public,anon,authenticated;
