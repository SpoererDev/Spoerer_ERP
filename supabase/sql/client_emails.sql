-- Correos a clientes desde Facturación (Edge Function send-client-email).
-- Remitente secretaria@spoerer.cl vía Resend; reutiliza la API key de Vault budget_notification_resend_key.

create table public.client_emails (
  id uuid primary key default gen_random_uuid(),
  template text not null
    check (template in ('approval_request', 'oc_request', 'invoice', 'payment_request', 'other')),
  installment_ids uuid[] not null default '{}',
  project_id uuid references public.projects(id) on delete set null,
  budget_id uuid references public.budgets(id) on delete set null,
  subject text not null,
  to_recipients jsonb not null,
  cc jsonb not null default '[]',
  body_text text not null,
  attachments jsonb not null default '[]',
  status text not null check (status in ('sent', 'failed')),
  resend_id text,
  error text,
  sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.client_emails is
  'Historial de correos enviados a clientes desde Facturación. Escritura exclusiva de la Edge Function send-client-email.';

create index client_emails_installment_ids_idx on public.client_emails using gin (installment_ids);
create index client_emails_project_id_idx on public.client_emails (project_id);
create index client_emails_budget_id_idx on public.client_emails (budget_id);
create index client_emails_sent_by_idx on public.client_emails (sent_by);

alter table public.client_emails enable row level security;
revoke all on public.client_emails from anon, authenticated;
grant select on public.client_emails to authenticated;
create policy "Usuarios activos leen correos a clientes" on public.client_emails
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'Active'));

-- Adjuntos subidos desde el modal: cada usuario escribe en su carpeta; sólo la Edge Function los lee.
insert into storage.buckets (id, name, public, file_size_limit)
values ('email-attachments', 'email-attachments', false, 15728640)
  on conflict (id) do nothing;
create policy "Usuarios activos suben adjuntos de correo" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'email-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'Active')
  );

-- Copias por defecto de cada plantilla (se configuran en Configuración de notificaciones).
insert into public.notification_settings (notification_type, title, description, enabled, user_ids) values
  ('client_email_approval_request', 'Correo: Consultar por aprobación', 'Usuarios en copia por defecto al consultar la aprobación de una cuota.', true, '{}'),
  ('client_email_oc_request', 'Correo: Solicitud de OC', 'Usuarios en copia por defecto al solicitar la orden de compra al cliente.', true, '{}'),
  ('client_email_invoice', 'Correo: Enviar factura', 'Usuarios en copia por defecto al enviar la factura emitida al cliente.', true, '{}'),
  ('client_email_payment_request', 'Correo: Solicitar cobro', 'Usuarios en copia por defecto al consultar por pagos pendientes.', true, '{}'),
  ('client_email_other', 'Correo: Otro', 'Usuarios en copia por defecto para correos libres.', true, '{}')
on conflict (notification_type) do nothing;

create function public.client_email_config() returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'resend_key', (select decrypted_secret from vault.decrypted_secrets where name = 'budget_notification_resend_key'),
    'from', 'Secretaría Spoerer <secretaria@spoerer.cl>',
    'mailbox', 'secretaria@spoerer.cl'
  );
$$;
revoke all on function public.client_email_config() from public, anon, authenticated;
grant execute on function public.client_email_config() to service_role;

-- Registrar que la factura de una cuota fue enviada por otro medio (sin enviar correo por Resend).
create or replace function public.register_external_invoice_send(p_installment_id uuid)
returns public.client_emails
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_inst record;
  v_row public.client_emails;
begin
  if v_user_id is null or not exists (
    select 1 from public.profiles p where p.id = v_user_id and p.status = 'Active'
  ) then
    raise exception 'No autorizado';
  end if;

  select id, project_id, origin_budget_id, installment_number, invoice_number
    into v_inst
    from public.billing_installments
   where id = p_installment_id;

  if not found then
    raise exception 'Cuota no encontrada';
  end if;

  insert into public.client_emails (
    template,
    installment_ids,
    project_id,
    budget_id,
    subject,
    to_recipients,
    cc,
    body_text,
    attachments,
    status,
    resend_id,
    sent_by
  ) values (
    'invoice',
    array[v_inst.id],
    v_inst.project_id,
    v_inst.origin_budget_id,
    case
      when v_inst.invoice_number is not null and v_inst.invoice_number <> ''
        then 'Envío por otro medio · Factura N° ' || v_inst.invoice_number
      else 'Envío de factura por otro medio'
    end,
    '[]'::jsonb,
    '[]'::jsonb,
    'Se registró que la factura asociada a la cuota fue enviada al cliente por otro medio.',
    jsonb_build_array(
      jsonb_build_object(
        'name', case
          when v_inst.invoice_number is not null and v_inst.invoice_number <> ''
            then 'Factura_' || v_inst.invoice_number || '.pdf'
          else 'Factura cuota ' || coalesce(v_inst.installment_number, '')
        end,
        'source', 'external_invoice',
        'installmentId', v_inst.id
      )
    ),
    'sent',
    'external',
    v_user_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.register_external_invoice_send(uuid) from public, anon;
grant execute on function public.register_external_invoice_send(uuid) to authenticated;
