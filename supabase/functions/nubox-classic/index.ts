// Emisión de facturas con la API clásica de Nubox.
// Acciones: config (estado de la integración), issue (emitir/borrador + PDF) y pdf (reintentar descarga del PDF).
import { corsHeaders, db, getActiveProfile, json, type DteDocument } from '../_shared/nubox.ts';
import {
  NuboxClassicError, classicConfigProblems, classicEnvironment, classicFetch, cleanRut, getClassicConfig,
  acceptedFolio, fetchClassicPdf, isValidRut, nuboxMessage, rutWithDash, splitGlosa, storeClassicPdf, toBase64,
  updateClassicDocument,
} from '../_shared/nubox_classic.ts';

const INVOICED_STATUSES = ['Facturada', 'Factura emitida', 'Facturado', 'Pagada', 'Pagado', 'Anulada'];
const REFERENCE_TYPES = ['801', 'HES'];
// Por ahora la API clásica solo está habilitada para Spoerer.
const CLASSIC_COMPANIES = ['Spoerer'];

const text = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const todayChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
const isIsoDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const profile = await getActiveProfile(req);
  if (!profile) return json({ error: 'No autorizado' }, 401);
  const config = await getClassicConfig();
  const body = await req.json().catch(() => ({}));
  const problems = classicConfigProblems(config);

  if (body.action === 'config') {
    const provider = config?.provider === 'pyme' ? 'pyme' : 'classic';
    return json({
      provider,
      companies: provider === 'classic' && !problems.length ? CLASSIC_COMPANIES : [],
      environment: config?.base_url ? classicEnvironment(config.base_url) : null,
      configError: problems.length ? problems.join(' ') : null,
    });
  }

  if (config?.provider === 'pyme') return json({ error: 'La emisión con la API clásica de Nubox está desactivada.' }, 400);
  if (problems.length) return json({ error: `Nubox no está configurado: ${problems.join(' ')}` }, 500);

  try {
    if (body.action === 'pdf') {
      const { data: doc } = await db.from('dte_documents').select('*')
        .eq('id', body.documentId ?? '').eq('provider', 'classic').maybeSingle();
      if (!doc) return json({ error: 'Documento no encontrado' }, 404);
      if (doc.status !== 'issued' || !doc.folio) return json({ error: 'El documento no tiene folio emitido.' }, 400);
      return json(await storeClassicPdf(config!, doc as DteDocument));
    }
    if (body.action === 'pdfByFolio') {
      // PDF de cualquier factura ya emitida en Nubox (p. ej. emitida fuera del ERP), para adjuntarlo a la cuota.
      const folio = String(body.folio ?? '').trim();
      if (!/^\d{1,10}$/.test(folio)) return json({ error: 'Ingrese un folio numérico válido.' }, 400);
      const documentType = String(body.documentType) === '34' ? '34' : '33';
      const bytes = await fetchClassicPdf(config!, folio, documentType);
      return json({ folio, documentType, fileName: `factura_${folio}.pdf`, contentBase64: toBase64(bytes) });
    }
    return await issue(body, profile.id);
  } catch (err) {
    console.error('nubox-classic failed', err);
    const message = err instanceof NuboxClassicError ? err.message : `Error inesperado: ${err instanceof Error ? err.message : err}`;
    return json({ error: message }, 502);
  }

  async function issue(body: any, profileId: string) {
    const { data: inst } = await db.from('billing_installments').select('*').eq('id', body.installmentId ?? '').maybeSingle();
    if (!inst) return json({ error: 'Cuota no encontrada' }, 404);
    if (INVOICED_STATUSES.includes(inst.status)) return json({ error: 'La cuota ya está facturada o anulada.' }, 409);
    const { data: budget } = inst.origin_budget_id
      ? await db.from('budgets').select('id,billing_company,legal_entity_id,client_id').eq('id', inst.origin_budget_id).maybeSingle()
      : { data: null };

    const company = inst.billing_company || budget?.billing_company || 'Spoerer';
    if (!CLASSIC_COMPANIES.includes(company)) {
      return json({ error: `La empresa ${company} no está habilitada para emitir con Nubox. Use el registro manual.` }, 400);
    }

    // Los montos se recalculan desde la cuota guardada; el navegador solo aporta el tipo de cambio. Siempre en pesos.
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
    if (!text(r.comunaName, 100)) errors.push('Seleccione la comuna del receptor.');
    if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(r.email).trim())) errors.push('El correo del receptor no es válido.');
    const paymentFormId = Number(body.paymentFormId);
    if (![1, 2].includes(paymentFormId)) errors.push('Forma de pago no válida.');
    const termsDays = Number(body.termsDays ?? 0);
    if (!Number.isInteger(termsDays) || termsDays < 0 || termsDays > 365) errors.push('Los términos de pago deben ser días entre 0 y 365.');
    const today = todayChile();
    if (!isIsoDate(body.dueDate) || body.dueDate < today) errors.push('La fecha de vencimiento debe ser hoy o posterior.');
    const glosa = text(body.description, 1000);
    if (!glosa) errors.push('Falta la descripción de la factura.');
    const ref = body.reference && (body.reference.type || body.reference.number) ? body.reference : null;
    if (ref && (!REFERENCE_TYPES.includes(ref.type) || !text(ref.number, 18) || !isIsoDate(ref.date))) {
      errors.push('Complete tipo, número y fecha de la referencia (OC / HES).');
    }
    if (errors.length) return json({ error: errors.join(' '), errors }, 400);

    const emitir = body.emitir === true;
    const exempt = taxPercent === 0;
    const tipo = exempt ? 34 : 33;
    const tax = exempt ? 0 : Math.round(net * 0.19);
    const total = net + tax;
    const { producto, descripcion } = splitGlosa(glosa);

    const linea = {
      rutContraparte: rutWithDash(rut),
      razonSocialContraparte: text(r.tradeName, 100),
      giroContraparte: text(r.giro, 40),
      comunaContraparte: text(r.comunaName, 100).toUpperCase(),
      direccionContraparte: text(r.address, 200),
      ...(r.email ? { emailContraparte: text(r.email, 100) } : {}),
      ...(r.contactName ? { nombreDeContacto: text(r.contactName, 100) } : {}),
      tipo,
      // Agrupa las líneas de un mismo documento dentro del request; el folio SII lo asigna Nubox (folios automáticos).
      folio: 1,
      secuencia: 1,
      fecha: today,
      fechaPeriodoDesde: today,
      fechaPeriodoHasta: today,
      fechaVencimiento: body.dueDate,
      codigoSucursal: '1',
      formaDePago: String(paymentFormId),
      medioDePago: 'PE', // Pago a Cta. Cte.
      terminosDePagoDias: String(termsDays),
      afecto: exempt ? 'NO' : 'SI',
      producto,
      ...(descripcion ? { descripcion } : {}),
      cantidad: 1,
      valor: net,
      unidadMedida: 'UNID',
      ponderacionDescuento: 0,
      descuentoMonto: '0',
      ...(body.comment ? { observacion: text(body.comment, 500) } : {}),
    };
    const payload = {
      productos: [linea],
      documentoReferenciado: ref
        ? {
          tipo, folio: 1, secuencia: 1,
          tipoDocumentoReferenciado: ref.type,
          folioDocumentoReferenciado: text(ref.number, 18),
          fechaDocumentoReferenciado: ref.date,
        }
        : {},
    };

    const clientId = body.clientId || inst.legal_entity_id || budget?.legal_entity_id || budget?.client_id || null;
    const { data: doc, error: insertError } = await db.from('dte_documents').insert({
      provider: 'classic',
      is_draft: !emitir,
      installment_id: inst.id,
      budget_id: inst.origin_budget_id,
      project_id: inst.project_id,
      client_id: clientId,
      installment_number: inst.installment_number,
      billing_company: company,
      environment: classicEnvironment(config!.base_url!),
      document_type: String(tipo),
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
      created_by: profileId,
      locked_at: new Date().toISOString(),
      attempts: 1,
    }).select().single();
    if (insertError) {
      if (insertError.code === '23505') return json({ error: 'Esta cuota ya tiene una factura en proceso o emitida.' }, 409);
      console.error('insert failed', insertError.message);
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

    const rutEmpresa = rutWithDash(config!.rut_empresa);
    const rutFuncionario = rutWithDash(config!.rut_funcionario);
    let response: Response;
    try {
      ({ response } = await classicFetch(
        config!,
        (s) => `/factura/documento/${rutEmpresa}/${s.numero_serie}/rutFuncionario/1/emitir/ventaExtendido` +
          `?rutFuncionario=${encodeURIComponent(rutFuncionario)}&emitir=${emitir}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      ));
    } catch (err) {
      // Sin respuesta no sabemos si Nubox creó el documento: se marca como error para permitir revisar y reintentar.
      const message = err instanceof NuboxClassicError
        ? err.message
        : `No hubo respuesta de Nubox (${err instanceof Error ? err.message : err}). Revise en Nubox si el documento se creó antes de reintentar.`;
      const failed = await updateClassicDocument(doc.id, { status: 'error', errors: [{ message }] });
      return json({ document: failed, error: message });
    }

    const responseText = await response.text();
    const folio = acceptedFolio(response, responseText);
    if (!folio) {
      const message = nuboxMessage(responseText, response.status);
      const rejected = await updateClassicDocument(doc.id, {
        status: 'rejected', errors: [{ message }], response_text: `HTTP ${response.status}: ${responseText}`.slice(0, 4000),
      });
      return json({ document: rejected, error: `Nubox rechazó el documento: ${message}` });
    }

    const issued = await updateClassicDocument(doc.id, {
      status: 'issued', folio, emission_date: today, issued_at: new Date().toISOString(),
      emission_status_name: emitir ? 'Emitida' : 'Borrador', errors: null,
      response_text: `HTTP ${response.status}: ${responseText}`.slice(0, 4000),
    });
    const { error: instError } = await db.from('billing_installments').update({
      status: 'Facturada',
      invoice_number: folio,
      actual_invoice_date: today,
      tax_percent: taxPercent,
      net_amount_clp: net,
      tax_amount_clp: tax,
      total_amount_clp: total,
    }).eq('id', inst.id);
    if (instError) console.error('installment update failed', inst.id, instError.message);

    return json(await storeClassicPdf(config!, issued));
  }
});
