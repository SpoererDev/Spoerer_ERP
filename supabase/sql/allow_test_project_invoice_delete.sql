-- Excepción para pruebas de Nubox: el proyecto "Proyecto Prueba" puede borrar cuotas
-- (o el proyecto completo) aunque tengan factura, siempre que sea del ambiente de pruebas
-- (uat), que nunca llega al SII. Las facturas de producción siguen protegidas siempre.
-- Las facturas uat de ese proyecto se eliminan junto con la cuota/proyecto.
-- Los PDF de prueba quedan en el bucket invoices bajo Spoerer/uat/.

create or replace function nubox.is_test_project(p_project_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects
    where id = p_project_id and lower(trim(project_name)) = 'proyecto prueba'
  );
$$;
revoke all on function nubox.is_test_project(uuid) from public, anon, authenticated;

create or replace function nubox.prevent_issued_installment_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if nubox.is_test_project(old.project_id) then
    delete from public.dte_documents where installment_id = old.id and environment = 'uat';
  end if;

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

-- Al borrar el proyecto, sus cuotas se eliminan en cascada cuando el proyecto ya no es
-- visible por nombre, así que las facturas uat se limpian antes, desde el proyecto.
create or replace function nubox.cleanup_test_project_dtes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if lower(trim(old.project_name)) = 'proyecto prueba' then
    delete from public.dte_documents d
    where d.environment = 'uat'
      and (d.project_id = old.id
        or d.installment_id in (select i.id from public.billing_installments i where i.project_id = old.id));
  end if;
  return old;
end; $$;
revoke all on function nubox.cleanup_test_project_dtes() from public, anon, authenticated;

drop trigger if exists cleanup_test_project_dtes on public.projects;
create trigger cleanup_test_project_dtes before delete on public.projects
  for each row execute function nubox.cleanup_test_project_dtes();
