import { configuredCompanies, corsHeaders, db, environmentOf, getActiveProfile, getConfig, json, submitDocument } from '../_shared/nubox.ts';

const INVOICED_STATUSES = ['Facturada', 'Factura emitida', 'Facturado', 'Pagada', 'Pagado', 'Anulada'];
const REFERENCE_TYPES = ['801', 'HES'];

const cleanRut = (rut: string) => String(rut ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
const isValidRut = (rut: string) => {
  const value = cleanRut(rut);
  if (value.length < 2) return false;
  const body = value.slice(0, -1);
  let sum = 0, factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const dv = 11 - (sum % 11);
  return value.slice(-1) === (dv === 11 ? '0' : dv === 10 ? 'K' : String(dv));
};
const text = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const todayChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
const isIsoDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const profile = await getActiveProfile(req);
  if (!profile) return json({ error: 'No autorizado' }, 401);
  const config = await getConfig();
  const body = await req.json().catch(() => ({}));

  if (body.action === 'config') {
    return json({
      companies: configuredCompanies(config),
      environment: config?.base_url ? environmentOf(config.base_url) : null,
    });
  }

  // Integración de respaldo: solo emite si nubox_provider = 'pyme' (la activa por defecto es la API clásica).
  const { data: classic } = await db.rpc('nubox_classic_config');
  if ((classic?.provider ?? 'classic') !== 'pyme') {
    return json({ error: 'La emisión con la API nueva de Nubox está desactivada (nubox_provider).' }, 400);
  }

  const { data: inst } = await db.from('billing_installments').select('*').eq('id', body.installmentId ?? '').maybeSingle();
  if (!inst) return json({ error: 'Cuota no encontrada' }, 404);
  if (INVOICED_STATUSES.includes(inst.status)) return json({ error: 'La cuota ya está facturada o anulada.' }, 409);
  const { data: budget } = inst.origin_budget_id
    ? await db.from('budgets').select('id,billing_company,legal_entity_id,client_id').eq('id', inst.origin_budget_id).maybeSingle()
    : { data: null };

  const company = inst.billing_company || budget?.billing_company || 'Spoerer';
  if (!config || !configuredCompanies(config).includes(company)) {
    return json({ error: `La empresa ${company} no está habilitada para emitir con Nubox. Use el registro manual.` }, 400);
  }

  // Amounts are always recomputed from the stored installment; the browser only supplies the exchange rate.
  const currency = (inst.currency || 'UF').toUpperCase();
  const rawPlanned = Number(inst.planned_amount_uf) || 0;
  const planned = rawPlanned === 0 && inst.net_amount_clp != null ? Number(inst.net_amount_clp) : rawPlanned;
  const rate = currency === 'CLP' ? 1 : Number(body.exchangeRate);
  const taxPercent = Number(body.taxPercent);
  const errors: string[] = [];
  if (!(rate > 0)) errors.push(`Ingrese un valor ${currency === 'USD' ? 'del dólar' : 'de la UF'} válido.`);
  if (taxPercent !== 19 && taxPercent !== 0) errors.push('Nubox sólo admite IVA 19% (factura afecta) o 0% (factura exenta).');
  const net = Math.round(planned * rate);
  if (!(net > 0)) errors.push('El monto neto debe ser mayor a cero.');

  const r = body.receptor ?? {};
  const rut = cleanRut(r.rut);
  if (!isValidRut(rut)) errors.push('El RUT del receptor no es válido.');
  if (rut === '555555555') errors.push('El RUT genérico de extranjeros no se puede facturar por Nubox. Use el registro manual.');
  if (!text(r.tradeName, 100)) errors.push('Falta la razón social del receptor.');
  if (!text(r.giro, 40)) errors.push('Falta el giro del receptor.');
  if (!text(r.address, 200)) errors.push('Falta la dirección del receptor.');
  if (!/^\d{5}$/.test(String(r.comunaCode ?? ''))) errors.push('Seleccione la comuna del receptor.');
  if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(r.email).trim())) errors.push('El correo del receptor no es válido.');
  if (![1, 2].includes(Number(body.paymentFormId))) errors.push('Forma de pago no válida.');
  if (!isIsoDate(body.dueDate) || body.dueDate < todayChile()) errors.push('La fecha de vencimiento debe ser hoy o posterior.');
  const glosa = text(body.description, 1000);
  if (!glosa) errors.push('Falta la descripción de la factura.');
  const references = Array.isArray(body.references) ? body.references.slice(0, 3) : [];
  for (const ref of references) {
    if (!REFERENCE_TYPES.includes(ref?.type) || !text(ref?.number, 18) || !isIsoDate(ref?.date)) {
      errors.push('Complete tipo, número y fecha de cada referencia (OC / HES).');
      break;
    }
  }
  if (errors.length) return json({ error: errors.join(' '), errors }, 400);

  const exempt = taxPercent === 0;
  const tax = exempt ? 0 : Math.round(net * 0.19);
  const total = net + tax;
  const rutValue = `${rut.slice(0, -1)}-${rut.slice(-1)}`;
  const comunaCode = String(r.comunaCode);

  const payload = [{
    sequence: 1,
    type: { legalCode: exempt ? '34' : '33' },
    client: {
      tradeName: text(r.tradeName, 100),
      identification: { type: 1, value: rutValue },
      ...(r.email ? { email: text(r.email, 100) } : {}),
      ...(r.contactName ? { contactName: text(r.contactName, 100) } : {}),
      ...(r.phone ? { phone: text(r.phone, 30) } : {}),
      mainActivity: text(r.giro, 40),
      address: text(r.address, 200),
      ...(r.city ? { city: text(r.city, 50) } : {}),
      territorialDivisionLegalCode: comunaCode.slice(0, 2),
      territorialDivisionL2LegalCode: comunaCode,
    },
    dueDate: body.dueDate,
    saleType: { id: 1 },
    paymentForm: { id: Number(body.paymentFormId) },
    totalNetAmount: exempt ? 0 : net,
    totalExemptAmount: exempt ? net : 0,
    totalTaxVatAmount: tax,
    totalAmount: total,
    ...(body.comment ? { comment: text(body.comment, 500) } : {}),
    globalTaxes: [],
    details: [{
      order: 1,
      quantity: 1,
      productDescription: text(glosa, 80),
      productDescriptionExtended: glosa,
      subjectToTax: !exempt,
      price: net,
      totalTaxAmount: tax,
      totalDiscountSurchargeAmount: 0,
      totalAmount: total,
      uom: { code: 'UNID' },
      taxes: exempt ? [] : [{ legalCode: '14', amount: tax }],
      discountsAndSurcharges: [],
    }],
    references: references.map((ref: any) => ({
      legalCode: ref.type,
      documentNumber: text(ref.number, 18),
      documentEmissionDate: `${ref.date}T00:00:00.000-03:00`,
    })),
  }];

  const clientId = body.clientId || inst.legal_entity_id || budget?.legal_entity_id || budget?.client_id || null;
  const { data: doc, error: insertError } = await db.from('dte_documents').insert({
    installment_id: inst.id,
    budget_id: inst.origin_budget_id,
    project_id: inst.project_id,
    client_id: clientId,
    installment_number: inst.installment_number,
    billing_company: company,
    environment: environmentOf(config.base_url!),
    document_type: exempt ? '34' : '33',
    due_date: body.dueDate,
    currency,
    planned_amount: planned,
    exchange_rate: rate,
    tax_percent: taxPercent,
    net_amount: exempt ? 0 : net,
    exempt_amount: exempt ? net : 0,
    tax_amount: tax,
    total_amount: total,
    description: glosa,
    request_payload: payload,
    created_by: profile.id,
    locked_at: new Date().toISOString(),
    attempts: 1,
  }).select().single();
  if (insertError) {
    if (insertError.code === '23505') return json({ error: 'Esta cuota ya tiene una factura en proceso o emitida.' }, 409);
    return json({ error: 'No se pudo registrar el documento.' }, 500);
  }

  if (body.updateClient && clientId) {
    const { error: clientError } = await db.from('clients').update({
      giro: text(r.giro, 200),
      address: text(r.address, 200),
      comuna: text(r.comunaName, 100) || undefined,
      ciudad: text(r.city, 100) || undefined,
      ...(r.email ? { contact_email: text(r.email, 100) } : {}),
    }).eq('id', clientId);
    if (clientError) console.error('client update failed', clientId, clientError.message);
  }

  try {
    const submitted = await submitDocument(config, doc);
    return json({ document: submitted });
  } catch (err) {
    console.error('submit failed', doc.id, err);
    return json({ document: doc, warning: 'El documento quedó en cola y se reintentará automáticamente.' });
  }
});
