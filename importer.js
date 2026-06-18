// js/importer.js
import { saveOrder, getExistingOrderIds } from './firebase.js';

// ── CSV COLUMN MAP ────────────────────────────────────────────────
// Maps CSV headers to internal field names
const COL = {
  'id':                     'customerId',
  'centro':                 'center',
  'edificio y sala':        'buildingRoom',
  'id de pedido':           'orderId',
  'customer':               'customerName',
  'empresa':                'company',
  'email':                  'email',
  'teléfono catering':      'phone',
  'fecha entrega / hora':   'deliveryAt',
  'cantidad personas':      'pax',
  'tipo de catering':       'cateringType',
  'estado pedido':          'orderStatus',
  'estado':                 'statusCode',
  'comentario usuario':     'userComment',
  'comentario interno':     'internalComment',
  'hora de montaje':        'setupTime',
  'hora de inicio':         'startTime',
  'hora de desmontaje':     'teardownTime',
  'imagen entrega':         'hasDeliveryPhoto',
  'imagen recogida':        'hasPickupPhoto',
  'fecha de creación':      'createdAt',
  'tarde?':                 'isLate',
  'cuanto de tarde':        'lateMinutes',
  'centro de coste':        'costCenter',
  'departamento':           'department',
  'precio alimentos':       'priceFood',
  'precio bebidas':         'priceDrinks',
  'precio transporte':      'priceTransport',
  'precio camareros':       'priceStaff',
  'precio total sin iva':   'priceTotal',
};

// ── PARSE CSV ─────────────────────────────────────────────────────
export function parseCSV(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV vacío o sin datos');

  // Detect separator
  const sep = lines[0].includes(';') ? ';' : ',';

  const rawHeaders = lines[0].split(sep).map(h => h.replace(/"/g, '').trim().toLowerCase());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i], sep);
    if (cells.every(c => !c.trim())) continue; // skip empty rows

    const raw = {};
    rawHeaders.forEach((h, idx) => {
      raw[h] = cells[idx]?.replace(/"/g, '').trim() ?? '';
    });

    const order = mapRow(raw);
    if (order) rows.push(order);
  }

  return rows;
}

function splitCSVLine(line, sep) {
  const result = [];
  let current = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === sep && !inQuote) { result.push(current); current = ''; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

// ── MAP ROW TO SCHEMA ─────────────────────────────────────────────
function mapRow(raw) {
  // Find orderId — mandatory
  const orderId = raw['id de pedido'] || raw['orderId'] || '';
  if (!orderId) return null;

  // Parse delivery date
  const deliveryRaw = raw['fecha entrega / hora'] || raw['fecha entrega'] || '';
  const deliveryAt  = parseSpanishDate(deliveryRaw);

  // Parse building / room
  const buildingRoom = raw['edificio y sala'] || '';
  const { building, floor, room } = parseBuildingRoom(buildingRoom);

  // Parse pax
  const pax = parseInt(raw['cantidad personas'] || '0', 10) || 0;

  // Parse prices
  const priceFood      = parseFloat((raw['precio alimentos']    || '0').replace(',', '.')) || 0;
  const priceDrinks    = parseFloat((raw['precio bebidas']      || '0').replace(',', '.')) || 0;
  const priceTransport = parseFloat((raw['precio transporte']   || '0').replace(',', '.')) || 0;
  const priceStaff     = parseFloat((raw['precio camareros']    || '0').replace(',', '.')) || 0;
  const priceTotal     = parseFloat((raw['precio total sin iva']|| '0').replace(',', '.')) || 0;

  // Parse photos (non-empty string = has photo)
  const hasDeliveryPhoto = !!(raw['imagen entrega'] && raw['imagen entrega'] !== '--' && raw['imagen entrega'].trim());
  const hasPickupPhoto   = !!(raw['imagen recogida'] && raw['imagen recogida'] !== '--' && raw['imagen recogida'].trim());

  // Parse late
  const isLate = (raw['tarde?'] || '').toLowerCase() === 'sí' || (raw['tarde?'] || '').toLowerCase() === 'si';
  const lateMinutes = parseInt(raw['cuanto de tarde'] || '0', 10) || 0;

  // Normalize status
  const orderStatus = normalizeStatus(raw['estado pedido'] || '');

  // Parse created at
  const createdAt = parseSpanishDate(raw['fecha de creación'] || '');

  return {
    orderId:          orderId.trim(),
    customerId:       raw['id'] || '',
    center:           raw['centro'] || '',
    buildingRoom,
    building,
    floor,
    room,
    customerName:     raw['customer'] || '',
    company:          raw['empresa'] || '',
    email:            raw['email'] || '',
    phone:            raw['teléfono catering'] || raw['telefono catering'] || '',
    deliveryAt:       deliveryAt ? { seconds: deliveryAt.getTime() / 1000 } : null,
    deliveryAtISO:    deliveryAt ? deliveryAt.toISOString() : null,
    setupTime:        raw['hora de montaje'] || '',
    startTime:        raw['hora de inicio'] || '',
    teardownTime:     raw['hora de desmontaje'] || '',
    pax,
    cateringType:     raw['tipo de catering'] || '',
    cateringCategory: categorizeCatering(raw['tipo de catering'] || ''),
    orderStatus,
    statusCode:       raw['estado'] || '',
    userComment:      raw['comentario usuario'] || '',
    internalComment:  raw['comentario interno'] || '',
    hasDeliveryPhoto,
    hasPickupPhoto,
    isLate,
    lateMinutes,
    costCenter:       raw['centro de coste'] || '',
    department:       raw['departamento'] || '',
    priceFood,
    priceDrinks,
    priceTransport,
    priceStaff,
    priceTotal,
    isManual:         false,
    source:           'csv',
    createdAt:        createdAt ? { seconds: createdAt.getTime() / 1000 } : null,
  };
}

// ── PARSERS ───────────────────────────────────────────────────────
function parseSpanishDate(str) {
  if (!str || str === '--') return null;
  // Format: DD/MM/YYYY HH:MM:SS or DD/MM/YYYY HH:MM
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, d, mo, y, h, mi, s] = m;
  return new Date(+y, +mo - 1, +d, +h, +mi, +(s||0));
}

function parseBuildingRoom(str) {
  if (!str) return { building: '', floor: '', room: '' };
  // e.g. "Planta 0 - Sala LA PENILLA" or "Edificio 1 - Planta 5 - Sala 504"
  const parts = str.split('-').map(s => s.trim());
  let building = '', floor = '', room = '';
  parts.forEach(p => {
    if (/planta/i.test(p)) floor = p;
    else if (/sala/i.test(p)) room = p.replace(/sala\s*/i, '').trim();
    else building = p;
  });
  return { building, floor, room };
}

function normalizeStatus(raw) {
  const r = raw.toLowerCase();
  if (r.includes('cancel')) return 'CANCELADO';
  if (r.includes('entregado') || r.includes('completado')) return 'ENTREGADO';
  if (r.includes('empresa') || r.includes('pago')) return 'CONFIRMADO';
  if (r.includes('pendiente')) return 'PENDIENTE';
  return raw || 'PENDIENTE';
}

function categorizeCatering(type) {
  const t = type.toLowerCase();
  if (t.includes('desayuno') || t.includes('coffee break') || t.includes('break')) return 'coffee';
  if (t.includes('comida') || t.includes('lunch') || t.includes('finger') || t.includes('carta')) return 'lunch';
  if (t.includes('cóctel') || t.includes('coctel')) return 'other';
  return 'other';
}

// ── IMPORT FLOW ───────────────────────────────────────────────────
export async function processImport(text, onProgress) {
  const orders = parseCSV(text);
  if (orders.length === 0) throw new Error('No se encontraron pedidos válidos en el CSV');

  const existingIds = await getExistingOrderIds();
  const newOrders      = orders.filter(o => !existingIds.has(o.orderId));
  const updatedOrders  = orders.filter(o => existingIds.has(o.orderId));

  return { orders, newOrders, updatedOrders, existingIds };
}

export async function confirmImport(orders, newOrderIds, onProgress) {
  let done = 0;
  for (const order of orders) {
    const isNew = newOrderIds.has(order.orderId);
    await saveOrder({ ...order, isNew });
    done++;
    onProgress(Math.round((done / orders.length) * 100), done, orders.length);
  }
}
