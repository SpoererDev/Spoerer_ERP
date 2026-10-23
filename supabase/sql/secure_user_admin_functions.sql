-- Endurece las funciones de administración de usuarios.
--
-- Antes: create_user_admin / update_user / delete_user / handle_new_user se podían
-- ejecutar con el rol anon vía /rest/v1/rpc/... sin sesión y sin search_path fijo.
--
-- Ahora:
--   * La lógica privilegiada (SECURITY DEFINER) vive en el esquema `private`, que no
--     está expuesto por la API REST, y exige que auth.uid() sea un perfil Admin activo.
--   * Las funciones de `public` que llama el frontend son wrappers SECURITY INVOKER,
--     ejecutables solo por `authenticated`. El frontend no cambia.
--   * handle_new_user queda solo como trigger: nadie puede llamarlo por RPC.
--   * Todas usan search_path = '' y referencias totalmente calificadas.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Lanza 42501 si el usuario de la sesión no es un Admin activo.
create or replace function private.assert_active_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'Admin'
      and status = 'Active'
  ) then
    raise exception 'No autorizado: se requiere un usuario Admin activo'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function private.create_user_admin(new_email text, new_password text, new_name text, new_role text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_user_id uuid;
begin
  perform private.assert_active_admin();

  new_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_sso_user,
    is_anonymous,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    phone_change,
    phone_change_token,
    reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    new_email,
    extensions.crypt(new_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('role', new_role, 'provider', 'email', 'providers', array_to_json(array['email'])::jsonb),
    jsonb_build_object('name', new_name, 'role', new_role, 'email_verified', true),
    false,
    false,
    now(),
    now(),
    '',
    '',
    '',
    '',
    '',
    '',
    ''
  );

  return new_user_id;
end;
$$;

create or replace function private.update_user(user_id uuid, new_name text, new_email text, new_role text, new_status text, new_password text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_active_admin();

  update public.profiles
  set name = new_name,
      email = new_email,
      role = new_role,
      status = new_status
  where id = user_id;

  update auth.users
  set email = new_email,
      raw_user_meta_data = jsonb_build_object('name', new_name, 'role', new_role),
      raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', new_role),
      updated_at = now()
  where id = user_id;

  if new_password is not null and new_password <> '' then
    update auth.users
    set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf'))
    where id = user_id;
  end if;
end;
$$;

-- Un usuario con elementos asignados no se borra (se pierde la trazabilidad):
-- en ese caso debe inactivarse. dte_documents haría SET NULL y
-- budget_notification_deliveries CASCADE, y projects.encargado guarda el nombre
-- como texto, así que se revisa todo explícitamente en vez de confiar en las FKs.
create or replace function private.delete_user(user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_name text;
  assigned text[] := '{}';
  n bigint;
begin
  perform private.assert_active_admin();

  if user_id = auth.uid() then
    raise exception 'No puedes eliminar tu propia cuenta de usuario.'
      using errcode = '42501';
  end if;

  select name into target_name from public.profiles where id = user_id;

  select count(*) into n from public.budgets where created_by = user_id;
  if n > 0 then assigned := assigned || format('%s presupuesto(s)', n); end if;

  select count(*) into n from public.projects where target_name is not null and encargado = target_name;
  if n > 0 then assigned := assigned || format('%s proyecto(s) como encargado', n); end if;

  select count(*) into n from public.dte_documents where created_by = user_id;
  if n > 0 then assigned := assigned || format('%s documento(s) tributario(s)', n); end if;

  select count(*) into n from public.budget_notification_deliveries where budget_notification_deliveries.user_id = delete_user.user_id;
  if n > 0 then assigned := assigned || format('%s notificación(es) enviada(s)', n); end if;

  select count(*) into n from public.backup_logs where created_by = user_id;
  if n > 0 then assigned := assigned || format('%s respaldo(s)', n); end if;

  select count(*) into n from public.notification_settings where user_id::text = any(user_ids::text[]);
  if n > 0 then assigned := assigned || 'configuración de notificaciones'::text; end if;

  if cardinality(assigned) > 0 then
    raise exception 'No se puede eliminar este usuario porque tiene elementos asignados (%). Para mantener la trazabilidad, inactívalo en su lugar.',
      array_to_string(assigned, ', ')
      using errcode = '23503';
  end if;

  delete from public.profiles where id = user_id;
  delete from auth.users where id = user_id;
end;
$$;

revoke all on function private.assert_active_admin() from public, anon;
revoke all on function private.create_user_admin(text, text, text, text) from public, anon;
revoke all on function private.update_user(uuid, text, text, text, text, text) from public, anon;
revoke all on function private.delete_user(uuid) from public, anon;
grant execute on function private.assert_active_admin() to authenticated;
grant execute on function private.create_user_admin(text, text, text, text) to authenticated;
grant execute on function private.update_user(uuid, text, text, text, text, text) to authenticated;
grant execute on function private.delete_user(uuid) to authenticated;

-- Wrappers públicos (mismas firmas que usa el frontend vía supabase.rpc).
create or replace function public.create_user_admin(new_email text, new_password text, new_name text, new_role text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_user_admin(new_email, new_password, new_name, new_role);
$$;

create or replace function public.update_user(user_id uuid, new_name text, new_email text, new_role text, new_status text, new_password text default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.update_user(user_id, new_name, new_email, new_role, new_status, new_password);
$$;

create or replace function public.delete_user(user_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.delete_user(user_id);
$$;

revoke all on function public.create_user_admin(text, text, text, text) from public, anon;
revoke all on function public.update_user(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.delete_user(uuid) from public, anon;
grant execute on function public.create_user_admin(text, text, text, text) to authenticated;
grant execute on function public.update_user(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.delete_user(uuid) to authenticated;

-- Trigger on_auth_user_created: los triggers no requieren EXECUTE del rol que inserta,
-- así que se revoca a todos los roles de la API.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', 'Usuario Nuevo'),
    coalesce(new.raw_app_meta_data->>'role', new.raw_user_meta_data->>'role', 'Sales'),
    'Active'
  );
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
