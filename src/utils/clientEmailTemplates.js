// Plantillas de correos a clientes enviados desde Facturación (Edge Function send-client-email).

export const PAYMENT_TABLE_TOKEN = '[TABLA DE PAGOS]';

export const EMAIL_TEMPLATES = [
  { id: 'approval_request', label: 'Consultar por aprobación', settingType: 'client_email_approval_request' },
  { id: 'oc_request', label: 'Solicitud de OC', settingType: 'client_email_oc_request' },
  { id: 'invoice', label: 'Enviar factura', settingType: 'client_email_invoice' },
  { id: 'payment_request', label: 'Solicitar cobro', settingType: 'client_email_payment_request' },
  { id: 'other', label: 'Otro', settingType: 'client_email_other' }
];

const BANK_DETAILS = [
  'Razón Social: Spoerer Ingenieros Asociados SpA',
  'RUT: 76.127.237-3',
  'Cta. Cte. 02-01651-6',
  'Banco BICE',
  'Enviar comprobante a secretaria@spoerer.cl'
];

const projectLabel = (project) =>
  project ? `${project.projectNumber} - ${project.rawProjectName}` : '';

const formatDate = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');

const formatNumber = (value, decimals = 0) =>
  value === null || value === undefined || value === ''
    ? '—'
    : Number(value).toLocaleString('es-CL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

// The issued Nubox invoice of an installment, if any.
export const getIssuedDte = (dteDocuments, installmentId) =>
  dteDocuments.find(d => d.installmentId === installmentId && d.status === 'issued') || null;

export const hasInvoiceBeenSent = (clientEmails, installmentId) =>
  clientEmails.some(e => e.template === 'invoice' && e.status === 'sent' && e.installmentIds.includes(installmentId));

export const getDefaultTemplate = (inst, clientEmails) => {
  const hasOc = Boolean(inst.oc || inst.ocFileUrl);
  switch (inst.status) {
    case 'Por aprobar':
      return 'approval_request';
    case 'Aprobada':
    case 'Por facturar':
      return hasOc ? 'other' : 'oc_request';
    case 'Facturada':
      return hasInvoiceBeenSent(clientEmails, inst.id) ? 'payment_request' : 'invoice';
    default:
      return 'other';
  }
};

/**
 * Asunto, cuerpo y destinatario sugeridos para una plantilla.
 * ctx: { inst, project, budget, contact: { name, email }, encargado: { name, email }, dte }
 */
export const buildTemplate = (templateId, ctx) => {
  const { inst, project, budget, contact, encargado, dte } = ctx;
  const projectText = projectLabel(project);
  const rawName = project?.rawProjectName || '';
  const contactName = contact?.name || '';

  switch (templateId) {
    case 'approval_request':
      return {
        to: encargado?.email ? [{ name: encargado.name, email: encargado.email }] : [],
        subject: `Consulta aprobación de cuota n° ${inst.numQuota} proyecto ${projectText}`,
        body: [
          `Estimado ${encargado?.name || '[Encargado de proyecto]'}:`,
          '',
          `Quisiera consultar si corresponde la aprobación de la cuota n° ${inst.numQuota} asociada al presupuesto n° ${budget?.quoteId || '—'} del proyecto ${projectText}.`,
          '',
          'Saludos'
        ].join('\n')
      };

    case 'oc_request':
      return {
        to: contact?.email ? [{ name: contactName, email: contact.email }] : [],
        subject: `Solicitud OC proyecto ${projectText}`,
        body: [
          `Estimado ${contactName || '[Contacto cliente]'}:`,
          '',
          `Junto con saludar, envío nuestros datos de facturación para emisión de orden de compra por el proyecto ${rawName}, esta debe ser afecta de IVA y en UF:`,
          '',
          'Razón Social: Spoerer Ingenieros Asociados Spa',
          'Rut 76.127.237-3',
          'Giro: Actividades de consultoría de Gestión – Cod 702000',
          'Dirección: Marchant Pereira 367 Of 501- Providencia',
          'Teléfono: 22 2697795',
          'Contacto: Daniela Cifuentes',
          'Correo: dcifuentes@spoerer.cl',
          '',
          'Para el pago de los documentos solicitamos realizar transferencia a nuestra cuenta bancaria',
          ...BANK_DETAILS,
          '',
          'Saludos'
        ].join('\n')
      };

    case 'invoice': {
      const folio = dte?.folio || inst.invoiceNumber || '[Folio factura]';
      return {
        to: contact?.email ? [{ name: contactName, email: contact.email }] : [],
        subject: `Factura n° ${folio} proyecto ${projectText}`,
        body: [
          'Por intermedio del presente correo, enviamos a ustedes, Factura(s) electrónica(s) correspondiente(s) al(los) siguiente(s) proyecto(s):',
          '',
          `${folio} - ${rawName}`,
          '',
          'Podrá verificar su validez en www.sii.cl',
          'Agradeceremos confirmar la recepción del presente correo.',
          '',
          'Para el pago de los documentos solicitamos realizar transferencia a nuestra cuenta bancaria',
          ...BANK_DETAILS.map(line => `• ${line}`),
          '',
          'Quedo atenta a sus comentarios',
          'Saludos'
        ].join('\n')
      };
    }

    case 'payment_request':
      return {
        to: contact?.email ? [{ name: contactName, email: contact.email }] : [],
        subject: `Consulta pago pendiente proyecto ${projectText}`,
        body: [
          `Junto con saludar, solicito de su ayuda con información de pago de las facturas de ${rawName} que se encuentran pendientes de pago.`,
          '',
          'Los pagos pendientes son los siguientes:',
          '',
          PAYMENT_TABLE_TOKEN,
          '',
          'Saludos'
        ].join('\n')
      };

    default:
      return { to: [], subject: '', body: '' };
  }
};

// Rows for the payment table preview; the Edge Function rebuilds them from the database when sending.
export const buildPaymentRows = (selectedInstallments, { dteDocuments, projects }) =>
  selectedInstallments.map(inst => {
    const dte = getIssuedDte(dteDocuments, inst.id);
    const project = projects.find(p => p.id === inst.project_id);
    const currency = (inst.currency || 'UF').toUpperCase();
    return {
      folio: dte?.folio || inst.invoiceNumber || '—',
      emission: formatDate(dte?.emissionDate || inst.actualInvoiceDate),
      project: projectLabel(project) || '—',
      comment: inst.comment || '—',
      quota: inst.numQuota || '—',
      amountUf: currency === 'CLP' ? '—' : `${formatNumber(inst.uf, 2)} ${currency}`,
      amountClp: inst.total_clp != null ? `$${formatNumber(inst.total_clp)}` : '—'
    };
  });

export const PAYMENT_TABLE_HEADERS = ['Folio factura', 'Fecha emisión', 'Proyecto', 'Comentario', 'N° cuota', 'Monto', 'Monto pesos'];
export const paymentRowValues = (row) => [row.folio, row.emission, row.project, row.comment, row.quota, row.amountUf, row.amountClp];
