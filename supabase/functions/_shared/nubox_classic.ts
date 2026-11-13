// Cliente de la API clásica de Nubox (https://api.nubox.com/Nubox.API).
// El token de sesión vive solo en public.nubox_classic_sessions (service_role) y vence tras 15 min sin uso.
import { db, type DteDocument } from './nubox.ts';

export type ClassicConfig = {
  provider: 'classic' | 'pyme';
  base_url: string | null;
  user: string | null;
  password: string | null;
  rut_empresa: string | null;
  rut_funcionario: string | null;
  sistema: string;
};

type Session = { token: string; numero_serie: string };

// Nubox invalida el token tras 15 minutos de inactividad; se renueva antes por margen.
const SESSION_IDLE_MS = 13 * 60 * 1000;
const TIMEOUT_MS = 30000;

export const cleanRut = (rut: unknown) => String(rut ?? '').replace(/[^0-9kK]/g, '').toUpperCase();

export const rutDv = (body: string) => {
  let sum = 0, factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const dv = 11 - (sum % 11);
  return dv === 11 ? '0' : dv === 10 ? 'K' : String(dv);
};

export const isValidRut = (rut: unknown) => {
  const value = cleanRut(rut);
  return value.length >= 2 && /^\d+$/.test(value.slice(0, -1)) && value.slice(-1) === rutDv(value.slice(0, -1));
};

// "761272373" / "76.127.237-3" -> "76127237-3"
export const rutWithDash = (rut: unknown) => {
  const value = cleanRut(rut);
  return `${value.slice(0, -1)}-${value.slice(-1)}`;
};

export const getClassicConfig = async (): Promise<ClassicConfig | null> => {
  const { data, error } = await db.rpc('nubox_classic_config');
  if (error || !data) {
    if (error) console.error('nubox_classic_config failed', error.message);
    return null;
  }
  return data as ClassicConfig;
};

export const classicEnvironment = (baseUrl: string) => (/\.cert\b/i.test(baseUrl) ? 'uat' : 'production');

// Lista de problemas de configuración (vacía si se puede emitir).
export const classicConfigProblems = (config: ClassicConfig | null) => {
  if (!config) return ['No se pudo leer la configuración de Nubox.'];
  const problems: string[] = [];
  if (!config.base_url) problems.push('Falta nubox_classic_base_url.');
  if (!config.user || !config.password) problems.push('Faltan las credenciales nubox_classic_user / nubox_classic_password.');
  if (!isValidRut(config.rut_empresa)) problems.push('nubox_classic_rut_empresa no es un RUT válido (incluya el dígito verificador).');
  if (!isValidRut(config.rut_funcionario)) problems.push('nubox_classic_rut_funcionario no es un RUT válido (incluya el dígito verificador).');
  return problems;
};

export class NuboxClassicError extends Error {
  constructor(message: string, readonly status?: number, readonly responseText?: string) {
    super(message);
  }
}

const baseUrlOf = (config: ClassicConfig) => config.base_url!.replace(/\/+$/, '');

const basicAuth = (user: string, password: string) => {
  const bytes = new TextEncoder().encode(`${user}:${password}`);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `Basic ${btoa(binary)}`;
};

// Extrae un mensaje legible de las respuestas de error de Nubox (texto plano o JSON tipo { Message }).
export const nuboxMessage = (text: string, status?: number) => {
  const raw = (text ?? '').trim();
  let message = raw;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') message = parsed;
    else if (parsed && typeof parsed === 'object') {
      message = parsed.Message ?? parsed.message ?? parsed.ExceptionMessage ?? parsed.error ?? raw;
      if (parsed.MessageDetail) message += ` ${parsed.MessageDetail}`;
    }
  } catch { /* texto plano */ }
  message = String(message).replace(/\s+/g, ' ').trim().slice(0, 1000);
  return message || (status ? `Nubox respondió HTTP ${status} sin detalle.` : 'Nubox respondió sin detalle.');
};

const authenticate = async (config: ClassicConfig): Promise<Session> => {
  let response: Response;
  try {
    response = await fetch(`${baseUrlOf(config)}/autenticar`, {
      method: 'POST',
      headers: { Authorization: basicAuth(config.user!, config.password!) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new NuboxClassicError(`No hubo respuesta de Nubox al autenticar (${err instanceof Error ? err.message : err}).`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new NuboxClassicError(`Autenticación con Nubox rechazada: ${nuboxMessage(text, response.status)}`, response.status, text);
  }
  const token = response.headers.get('Token');
  if (!token) throw new NuboxClassicError('Nubox no devolvió el token de sesión al autenticar.', response.status, text);

  let sistemas: Array<{ Sistema?: string; NumeroDeSerie?: number | string; Rut?: number | string }> = [];
  try { sistemas = JSON.parse(text)?.Sistemas ?? []; } catch { /* sin body */ }
  const empresaBody = cleanRut(config.rut_empresa).slice(0, -1);
  const nombre = (config.sistema || 'SERVIFACTURA').toUpperCase();
  const byName = sistemas.filter((s) => String(s.Sistema ?? '').toUpperCase() === nombre);
  const sistema = byName.find((s) => String(s.Rut ?? '') === empresaBody) ?? byName[0];
  if (!sistema || sistema.NumeroDeSerie == null) {
    throw new NuboxClassicError(`La cuenta de Nubox no tiene el sistema ${nombre} habilitado.`, response.status, text);
  }
  if (sistema.Rut != null && String(sistema.Rut) !== empresaBody) {
    throw new NuboxClassicError(
      `El sistema ${nombre} de Nubox pertenece al RUT ${sistema.Rut}-${rutDv(String(sistema.Rut))}, distinto del RUT configurado ${rutWithDash(config.rut_empresa)}.`,
    );
  }

  const session = { token, numero_serie: String(sistema.NumeroDeSerie) };
  const now = new Date().toISOString();
  const { error } = await db.from('nubox_classic_sessions').upsert({
    base_url: baseUrlOf(config), ...session, rut_empresa: rutWithDash(config.rut_empresa), api_user: config.user,
    last_used_at: now, created_at: now,
  });
  if (error) console.error('session save failed', error.message);
  return session;
};

export const getSession = async (config: ClassicConfig, force = false): Promise<Session> => {
  if (!force) {
    const { data } = await db.from('nubox_classic_sessions')
      .select('token,numero_serie,last_used_at,api_user').eq('base_url', baseUrlOf(config)).maybeSingle();
    // Si cambiaron las credenciales en Vault, el token guardado pertenece a otro usuario: se re-autentica.
    if (data && data.api_user === config.user && Date.now() - new Date(data.last_used_at).getTime() < SESSION_IDLE_MS) {
      return { token: data.token, numero_serie: data.numero_serie };
    }
  }
  return authenticate(config);
};

const touchSession = async (config: ClassicConfig, token: string) => {
  const { error } = await db.from('nubox_classic_sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('base_url', baseUrlOf(config)).eq('token', token);
  if (error) console.error('session touch failed', error.message);
};

// Nubox responde con HTTP de error incluso cuando carga un borrador ("... no se encuentra firmado. Folio: N"):
// una respuesta con folio nunca se trata como token vencido, para no emitir dos veces.
const looksLikeExpiredToken = async (response: Response) => {
  if (response.ok) return false;
  const text = await response.clone().text().catch(() => '');
  if (parseFolio(text)) return false;
  if (response.status === 401 || response.status === 403) return true;
  return /token/i.test(text) && /(inv[aá]lid|expir|venc|autoriz)/i.test(text);
};

// Llama a la API con el token vigente; si Nubox lo rechaza por vencido, re-autentica y reintenta una vez.
export const classicFetch = async (
  config: ClassicConfig,
  buildPath: (session: Session) => string,
  init: RequestInit = {},
): Promise<{ response: Response; session: Session }> => {
  const run = async (session: Session) => {
    const response = await fetch(`${baseUrlOf(config)}${buildPath(session)}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { ...(init.headers ?? {}), Token: session.token },
    });
    return response;
  };
  let session = await getSession(config);
  let response = await run(session);
  if (await looksLikeExpiredToken(response)) {
    session = await getSession(config, true);
    response = await run(session);
  }
  if (response.status !== 401 && response.status !== 403) await touchSession(config, session.token);
  return { response, session };
};

// "El DTE se cargo correctamente ... Folio: 1975" -> "1975"
// Con emitir=true Nubox responde JSON: { "Folio": 1977, "MontoTotal": 4917, "UrlBoleta": "...", ... }.
export function parseFolio(text: string) {
  try {
    const folio = JSON.parse(text)?.Folio;
    if (folio != null && /^\d+$/.test(String(folio)) && Number(folio) > 0) return String(folio);
  } catch { /* texto plano */ }
  return text.match(/"?Folio"?\s*:\s*"?(\d+)/i)?.[1] ?? null;
}

// Folio de una emisión aceptada. Con emitir=false Nubox responde HTTP de error y el texto
// "El DTE se cargo correctamente pero no se encuentra firmado electrónicamente. Folio: N": es un borrador válido.
export const acceptedFolio = (response: Response, text: string) => {
  const folio = parseFolio(text);
  if (!folio) return null;
  // Borrador (emitir=false): HTTP de error con "El DTE se cargo correctamente ... Folio: N".
  return response.ok || /cargo correctamente/i.test(text) ? folio : null;
};

// Divide la glosa en "producto" (≤80, se imprime en la primera línea) y "descripcion" (resto).
export const splitGlosa = (glosa: string, max = 80) => {
  if (glosa.length <= max) return { producto: glosa, descripcion: '' };
  const head = glosa.slice(0, max);
  // Corta preferentemente al final de una oración, luego en " - " y por último en un espacio.
  const cut = [head.lastIndexOf('. '), head.lastIndexOf(' - '), head.lastIndexOf(' ')].find((i) => i > 20) ?? -1;
  const at = cut > 0 ? cut : max;
  return {
    producto: glosa.slice(0, at).replace(/[\s.-]+$/, ''),
    descripcion: glosa.slice(at).replace(/^[\s.-]+/, ''),
  };
};

export const pdfDocumentType = (documentType: string) => (documentType === '34' ? 'FAC-EE' : 'FAC-EL');

const updateDocument = async (id: string, updates: Record<string, unknown>) => {
  const { data, error } = await db.from('dte_documents')
    .update({ ...updates, locked_at: null, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw new Error(`No se pudo actualizar el documento ${id}: ${error.message}`);
  return data as DteDocument;
};

// Descarga el PDF desde Nubox y lo guarda en el bucket privado "invoices".
export const storeClassicPdf = async (config: ClassicConfig, doc: DteDocument): Promise<{ document: DteDocument; warning?: string }> => {
  try {
    const rut = rutWithDash(config.rut_empresa);
    const { response } = await classicFetch(
      config,
      (s) => `/factura/documento/${rut}/${s.numero_serie}/${doc.folio}/${pdfDocumentType(doc.document_type)}/pdf`,
      { headers: { Accept: 'application/pdf' } },
    );
    const contentType = response.headers.get('Content-Type') ?? '';
    if (!response.ok || !contentType.includes('pdf')) {
      throw new Error(nuboxMessage(await response.text(), response.status));
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const year = String(doc.emission_date ?? new Date().toISOString()).slice(0, 4);
    const suffix = doc.is_draft ? 'borrador' : 'classic';
    const path = `${doc.billing_company}/${doc.environment}/${year}/factura_${doc.folio}_${suffix}_${doc.id.slice(0, 8)}.pdf`;
    const { error } = await db.storage.from('invoices').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
    return { document: await updateDocument(doc.id, { pdf_path: path, errors: null }) };
  } catch (err) {
    const warning = `Factura generada (folio ${doc.folio}), pero no se pudo obtener el PDF: ${err instanceof Error ? err.message : err}`;
    return { document: await updateDocument(doc.id, { errors: [{ message: warning }] }), warning };
  }
};

export { updateDocument as updateClassicDocument };
