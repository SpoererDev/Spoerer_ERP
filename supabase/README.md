# Notificaciones de presupuestos aprobados

Proyecto: `cyxsrwdcqfdwwkihzuli` (ERP_Spoerer).
Edge Function: `notify-budget-approved`. Remitente: `Spoerer ERP <notificaciones@spoerer.cl>`.

El trigger detecta INSERT aprobado o UPDATE que pasa a Aprobado/Aprovado con proyecto asociado. Lee `notification_settings` (`budget_approved`, `enabled`, `user_ids`) y los perfiles activos (`Active`/`Activo`). Guarda una copia de los datos del presupuesto por destinatario en `budget_notification_deliveries`, con RLS y acceso exclusivo de service_role. No genera mensajes para presupuestos históricos. Una nueva aprobación después de desaprobar genera un evento nuevo.

La función valida el token privado de Vault antes de procesar la cola. JWT está deshabilitado porque las invocaciones de pg_net usan esta autenticación propia. Las RPC de configuración y de adquisición de mensajes sólo admiten service_role. Ninguna credencial se guarda en el frontend ni en este repositorio.

El trigger invoca el worker después de crear la cola y pg_cron reintenta cada cinco minutos. Los envíos individuales usan una clave de idempotencia por evento. Las respuestas 429/5xx y errores de transporte se reintentan con espera creciente, hasta ocho intentos; errores definitivos quedan en `failed`. `sent` significa que Resend aceptó el correo, no confirma entrega al buzón. Se comprueba nuevamente que el usuario esté activo y seleccionado al procesar.

## DNS verificados y envío activo

El 7 de octubre de 2026 se confirmó `spoerer.cl` como verificado en Resend y se activó `budget_notification_enabled` en Vault. Las nuevas aprobaciones generan notificaciones automáticamente.

Añadir los siguientes registros en la zona DNS `spoerer.cl`, TTL Auto (MX prioridad 10):

| Tipo | Nombre | Valor |
| --- | --- | --- |
| TXT | resend._domainkey | p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC9IbgZFTI48xweyhUH7lBOKfCZiGLvc0d/WZ3MicDUhdxEnSabB8626pmvmB9TrDls9ie68N1bwAzYUjMI6ag4h6wndoPDNtobFcVa/xgWLgB86Tkn1C4GfaVHET+rHNeXVCKTs9mCrD7TAPpmnOkepurjPVTcSZ9fUM70JnAEoQIDAQAB |
| MX | send | feedback-smtp.us-east-1.amazonses.com |
| TXT | send | v=spf1 include:amazonses.com ~all |
| CNAME | rsend | send.forge.rmta.net |

Todos los registros anteriores están verificados en Resend.

Para reactivar el envío si se pausa en el futuro, ejecutar en SQL Editor:

```sql
select vault.update_secret(id, 'true')
from vault.secrets where name = 'budget_notification_enabled';
select budget_notifications.invoke_worker();
```

Monitorizar sin exponer destinatarios ni claves:

```sql
select status, count(*) from public.budget_notification_deliveries group by status;
select id, budget_id, attempts, last_error, sent_at from public.budget_notification_deliveries order by created_at desc limit 20;
```

## Limpieza periódica de registros (Retención 90 días)

Se encuentra activo un trabajo diario programado en `pg_cron` (`budget-notification-cleanup-90d`, a las `03:00 UTC` / `00:00 Chile`):
* Ejecuta: `select budget_notifications.cleanup_old_deliveries();`
* **Condición de purga:** Registros de `public.budget_notification_deliveries` con más de 90 días de antigüedad (`created_at < now() - interval '90 days'`) y en estado terminal (`sent`, `failed`, `cancelled`).
* Registros en estado pendiente o en reintento se preservan intactos para no interrumpir el flujo de envíos.
* La función opera con `SECURITY DEFINER`, `search_path = ''` y permisos revocados para `public`, `anon` y `authenticated` (exclusivo para `service_role`).

Para replicar en otro proyecto, adaptar URL en `sql/budget_approval_notifications.sql`, aplicar SQL, crear el secreto `budget_notification_resend_key` en Vault y desplegar la función con el config.toml. El SQL de referencia es para instalación inicial, no se debe ejecutar nuevamente en este proyecto. Las dos migraciones ya se aplicaron mediante MCP.

Pruebas simuladas: `node supabase/functions/notify-budget-approved/worker.test.mjs`. No modifican presupuestos ni envían correos.



# Facturación electrónica vía Nubox — API clásica (activa)

Edge Function: `nubox-classic` (requiere JWT de usuario activo). Código compartido en `functions/_shared/nubox_classic.ts`. SQL: `sql/nubox_classic.sql` (se aplica después de `sql/nubox_invoicing.sql`; reutiliza `dte_documents`, el bucket `invoices` y el trigger que protege cuotas facturadas).

Flujo (síncrono, sin cola ni cron): el modal arma la factura con la cuota y el CRM → `nubox-classic` (`action: 'issue'`) recalcula montos en pesos desde la base, registra el intento en `dte_documents` (`provider = 'classic'`), autentica si hace falta, llama `POST /factura/documento/{rutEmpresa}/{numeroSerie}/rutFuncionario/1/emitir/ventaExtendido?emitir=...`, lee el folio de la respuesta (`... Folio: 1975`), deja la cuota `Facturada` con ese folio y descarga el PDF (`GET /factura/documento/{rut}/{serie}/{folio}/FAC-EL/pdf`) al bucket `invoices`. Si Nubox rechaza, el documento queda `rejected` con el mensaje literal de Nubox y el modal lo muestra. `action: 'pdf'` reintenta la descarga del PDF.

Token: Nubox lo invalida tras 15 min sin uso. Se guarda solo en `public.nubox_classic_sessions` (RLS sin políticas, solo service_role) y se reutiliza si se usó hace menos de 13 min; si Nubox responde 401/403 o "token inválido" se re-autentica y se reintenta una vez.

Borradores: el modal envía `emitir=false` por defecto (switch "Emitir documento definitivo" para `emitir=true`). Para efectos del ERP un borrador se trata como emitido (`is_draft = true`, badge "Borrador" en la columna Factura). Los borradores se eliminan manualmente en Nubox.

Solo Spoerer emite por la API clásica; FPF y RUT genérico usan el registro manual.

```sql
-- Credenciales API clásica (SQL Editor). Los RUT van con dígito verificador.
select vault.create_secret('https://api.nubox.com/Nubox.API', 'nubox_classic_base_url'); -- certificación: https://api.nubox.com/Nubox.API.cert
select vault.create_secret('<usuario API clásica>', 'nubox_classic_user');
select vault.create_secret('<contraseña API clásica>', 'nubox_classic_password');
select vault.create_secret('76127237-3', 'nubox_classic_rut_empresa');
select vault.create_secret('<RUT funcionario con DV>', 'nubox_classic_rut_funcionario');
select vault.create_secret('SERVIFACTURA', 'nubox_classic_sistema'); -- opcional, es el valor por defecto

-- Proveedor activo: 'classic' (por defecto si no existe) o 'pyme' para reactivar la integración de la API nueva.
select vault.create_secret('classic', 'nubox_provider');
-- select vault.update_secret(id, 'pyme') from vault.secrets where name = 'nubox_provider';
```

Monitorizar:

```sql
select id, installment_number, status, is_draft, folio, errors, response_text, pdf_path
from public.dte_documents where provider = 'classic' order by created_at desc limit 20;
select base_url, numero_serie, last_used_at, created_at from public.nubox_classic_sessions;
```


# Facturación electrónica vía Nubox — API nueva (respaldo)

Integración desactivada mientras `nubox_provider` no sea `'pyme'` (`nubox-issue` rechaza la emisión y `nubox-sync` solo procesa documentos `provider = 'pyme'`). Para reactivarla: cambiar `nubox_provider` a `'pyme'` y cargar los secretos de abajo; el ERP cambia de panel automáticamente.

Edge Functions: `nubox-issue` (emite, requiere JWT de usuario activo) y `nubox-sync` (consulta estado y descarga PDF; la invoca pg_cron cada minuto con un token de Vault y el ERP mientras el modal está abierto). Código compartido en `functions/_shared/nubox.ts`. SQL de instalación: `sql/nubox_invoicing.sql`.

Flujo: el modal arma la factura con datos de la cuota y del CRM → `nubox-issue` recalcula montos desde la base, registra el intento en `dte_documents` (estado `sending`, con su `idempotence_key`) y lo envía a Nubox → la emisión es asíncrona, por lo que `nubox-sync` consulta `GET /v1/sales/{id}` hasta que queda `issued` (cuota pasa a `Facturada` con el folio) o `rejected`. El PDF se guarda en el bucket privado `invoices` y se abre con URL firmada.

Garantías: un índice único impide dos facturas activas por cuota; los reintentos reutilizan el mismo `x-idempotence-id` (Nubox lo recuerda 30 días); un trigger impide borrar cuotas con factura en el SII y la sincronización de presupuestos las conserva.

Sólo las empresas con API key en Vault emiten por Nubox (hoy `Spoerer`). FPF, clientes con RUT genérico 55.555.555-5 o caídas de Nubox usan el registro manual del mismo modal.

## Configurar credenciales y cambiar de ambiente (SQL Editor)

Ambos ambientes (`uat` y `production`) coexisten en Vault y se alternan con el secreto `nubox_mode`:

```sql
-- Ambiente de pruebas (UAT):
select vault.create_secret('https://api.test-nubox.com/nbxpymapi-uat', 'nubox_base_url');
select vault.create_secret('<token partner UAT>', 'nubox_token');
select vault.create_secret('<X-Api-Key Spoerer UAT>', 'nubox_api_key_spoerer');

-- Ambiente de producción (se cargan una sola vez):
select vault.create_secret('<BaseUrl Produccion>', 'nubox_prod_base_url');
select vault.create_secret('<token partner Produccion>', 'nubox_prod_token');
select vault.create_secret('<X-Api-Key Spoerer Produccion>', 'nubox_prod_api_key_spoerer');

-- Switch de ambiente ('uat' o 'production'):
select vault.create_secret('uat', 'nubox_mode');

-- Token interno con el que pg_cron invoca nubox-sync (valor aleatorio, no se comparte):
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'nubox_worker_token');
```

Para cambiar entre pruebas y producción sin tocar las llaves:

```sql
-- Pasar a PRODUCCIÓN:
select vault.update_secret(id, 'production') from vault.secrets where name = 'nubox_mode';

-- Volver a PRUEBAS (UAT):
select vault.update_secret(id, 'uat') from vault.secrets where name = 'nubox_mode';
```

Para habilitar FPF, crear `nubox_api_key_fpf` / `nubox_prod_api_key_fpf` y agregarlos en `public.nubox_config()`.

Monitorizar:

```sql
select status, count(*) from public.dte_documents group by status;
select id, installment_number, status, emission_status_name, folio, errors, attempts from public.dte_documents order by created_at desc limit 20;
```


# Correos a clientes desde Facturación

Edge Function: `send-client-email` (requiere JWT de usuario activo). SQL de instalación: `sql/client_emails.sql` (ya aplicado por MCP).

Flujo: en Facturación, el botón de correo de cada cuota abre `ClientEmailModal`. El usuario elige una plantilla (`src/utils/clientEmailTemplates.js`), revisa destinatarios, copias, asunto, mensaje y adjuntos, y envía. La función valida los datos, arma el HTML (la tabla de `[TABLA DE PAGOS]` se recalcula desde la base), adjunta archivos y envía vía Resend. Cada intento queda en `public.client_emails` con estado `sent` o `failed`.

- Remitente: `Secretaría Spoerer <secretaria@spoerer.cl>`, con copia oculta y `reply_to` a `secretaria@spoerer.cl`. Usa la misma API key de Resend (`budget_notification_resend_key`) mediante `public.client_email_config()`, que solo puede ejecutar service_role.
- Adjuntos permitidos: PDF de la factura Nubox de las cuotas del correo, respaldos de la cuota (bucket `budgets`) o archivos subidos por el usuario al bucket privado `email-attachments/{uid}/`, que se borran tras un envío exitoso. Máximo 25 MB en total.
- Copias por defecto: filas `client_email_*` de `notification_settings`, editables en Configuración de notificaciones.
- Plantilla sugerida: `Por aprobar` → Consultar por aprobación; `Aprobada`/`Por facturar` sin OC → Solicitud de OC (con OC → Otro); `Facturada` → Enviar factura, o Solicitar cobro si ya se envió la factura.

Monitorizar:

```sql
select status, template, count(*) from public.client_emails group by 1, 2;
select created_at, template, subject, status, error from public.client_emails order by created_at desc limit 20;
```


# Indicadores UF / dólar (CMF)

Edge Function: `indicator-rates` (`verify_jwt = false`; valida el token de pg_cron o un usuario activo). SQL: `sql/indicator_rates.sql` (aplicado por MCP).

- `public.indicator_rates` guarda UF y dólar observado por fecha. Lectura para usuarios activos; escritura solo de la función.
- pg_cron `indicator-rates-sync` (09:15 y 13:15 hora Chile aprox.) carga desde la API de la CMF el año anterior, el año actual y la UF ya publicada hasta el día 9 del mes siguiente.
- El ERP (`fetchIndicatorRate` → `supabaseService.getIndicatorRate`) lee la tabla; si falta la fecha llama a la función (`action: 'get'`), que consulta la CMF y, como respaldo, mindicador.cl. El dólar de fines de semana/feriados usa el último día hábil.
- Secretos: `cmf_api_key` (api.cmfchile.cl) y `nubox_worker_token` (reutilizado para pg_cron).

```sql
select currency, count(*), min(rate_date), max(rate_date) from public.indicator_rates group by 1;
select public.invoke_indicator_rates_sync(); -- recarga manual
```
