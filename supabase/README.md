# Notificaciones de presupuestos aprobados

Proyecto: `cyxsrwdcqfdwwkihzuli` (ERP_Spoerer).
Edge Function: `notify-budget-approved`. Remitente: `Spoerer ERP <notificaciones@spoerer.cl>`.

El trigger detecta INSERT aprobado o UPDATE que pasa a Aprobado/Aprovado con proyecto asociado. Lee `notification_settings` (`budget_approved`, `enabled`, `user_ids`) y los perfiles activos (`Active`/`Activo`). Guarda una copia de los datos del presupuesto por destinatario en `budget_notification_deliveries`, con RLS y acceso exclusivo de service_role. No genera mensajes para presupuestos históricos. Una nueva aprobación después de desaprobar genera un evento nuevo.

La función valida el token privado de Vault antes de procesar la cola. JWT está deshabilitado porque las invocaciones de pg_net usan esta autenticación propia. Las RPC de configuración y de adquisición de mensajes sólo admiten service_role. Ninguna credencial se guarda en el frontend ni en este repositorio.

El trigger invoca el worker después de crear la cola y pg_cron reintenta cada cinco minutos. Los envíos individuales usan una clave de idempotencia por evento. Las respuestas 429/5xx y errores de transporte se reintentan con espera creciente, hasta ocho intentos; errores definitivos quedan en `failed`. `sent` significa que Resend aceptó el correo, no confirma entrega al buzón. Se comprueba nuevamente que el usuario esté activo y seleccionado al procesar.

## Pendiente: DNS y activación

Añadir los siguientes registros en la zona DNS `spoerer.cl`, TTL Auto (MX prioridad 10):

| Tipo | Nombre | Valor |
| --- | --- | --- |
| TXT | resend._domainkey | p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC9IbgZFTI48xweyhUH7lBOKfCZiGLvc0d/WZ3MicDUhdxEnSabB8626pmvmB9TrDls9ie68N1bwAzYUjMI6ag4h6wndoPDNtobFcVa/xgWLgB86Tkn1C4GfaVHET+rHNeXVCKTs9mCrD7TAPpmnOkepurjPVTcSZ9fUM70JnAEoQIDAQAB |
| MX | send | feedback-smtp.us-east-1.amazonses.com |
| TXT | send | v=spf1 include:amazonses.com ~all |
| CNAME | rsend | send.forge.rmta.net |

Resend inició la verificación del dominio. Esperar estado `verified` antes de activar. El envío está pausado en Vault; las nuevas aprobaciones quedan pendientes mientras tanto.

Después de verificar, ejecutar en SQL Editor:

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

Para replicar en otro proyecto, adaptar URL en `sql/budget_approval_notifications.sql`, aplicar SQL, crear el secreto `budget_notification_resend_key` en Vault y desplegar la función con el config.toml. El SQL de referencia es para instalación inicial, no se debe ejecutar nuevamente en este proyecto. Las dos migraciones ya se aplicaron mediante MCP.

Pruebas simuladas: `node supabase/functions/notify-budget-approved/worker.test.mjs`. No modifican presupuestos ni envían correos.

