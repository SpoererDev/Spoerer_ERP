-- Correo SII (casilla de intercambio de DTE) de cada razón social. Opcional; las existentes quedan en null.
alter table public.clients add column if not exists sii_email text;
comment on column public.clients.sii_email is 'Correo de recepción de DTE (intercambio SII) de la razón social. Opcional; se agrega como destinatario al enviar facturas.';
