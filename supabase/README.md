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



# Facturación electrónica vía Nubox

Edge Functions: `nubox-issue` (emite, requiere JWT de usuario activo) y `nubox-sync` (consulta estado y descarga PDF; la invoca pg_cron cada minuto con un token de Vault y el ERP mientras el modal está abierto). Código compartido en `functions/_shared/nubox.ts`. SQL de instalación: `sql/nubox_invoicing.sql`.

Flujo: el modal arma la factura con datos de la cuota y del CRM → `nubox-issue` recalcula montos desde la base, registra el intento en `dte_documents` (estado `sending`, con su `idempotence_key`) y lo envía a Nubox → la emisión es asíncrona, por lo que `nubox-sync` consulta `GET /v1/sales/{id}` hasta que queda `issued` (cuota pasa a `Facturada` con el folio) o `rejected`. El PDF se guarda en el bucket privado `invoices` y se abre con URL firmada.

Garantías: un índice único impide dos facturas activas por cuota; los reintentos reutilizan el mismo `x-idempotence-id` (Nubox lo recuerda 30 días); un trigger impide borrar cuotas con factura en el SII y la sincronización de presupuestos las conserva.

Sólo las empresas con API key en Vault emiten por Nubox (hoy `Spoerer`). FPF, clientes con RUT genérico 55.555.555-5 o caídas de Nubox usan el registro manual del mismo modal.

## Configurar credenciales (SQL Editor)

```sql
select vault.create_secret('<BaseUrl>', 'nubox_base_url');          -- UAT: https://api.test-nubox.com/nbxpymapi-uat
select vault.create_secret('<token partner>', 'nubox_token');
select vault.create_secret('<X-Api-Key Spoerer>', 'nubox_api_key_spoerer');
-- Token interno con el que pg_cron invoca nubox-sync (valor aleatorio, no se comparte):
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'nubox_worker_token');
```

Si la URL contiene `test`/`uat`, el ERP muestra el aviso de ambiente de pruebas. Para pasar a producción, actualizar los tres secretos con `vault.update_secret`. Para habilitar FPF, crear `nubox_api_key_fpf` y agregarlo en `public.nubox_config()`.

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
