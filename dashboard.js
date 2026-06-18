// js/dashboard.js
import { getOrders, getConfig } from './firebase.js';

// ── DATE HELPERS ──────────────────────────────────────────────────
function startOfDay(d)   { const r = new Date(d); r.setHours(0,0,0,0); return r; }
function endOfDay(d)     { const r = new Date(d); r.setHours(23,59,59,999); return r; }
function startOfWeek(d)  { const r = new Date(d); const day = r.getDay(); r.setDate(r.getDate() - (day === 0 ? 6 : day - 1)); r.setHours(0,0,0,0); return r; }
function endOfWeek(d)    { const r = startOfWeek(d); r.setDate(r.getDate() + 6); r.setHours(23,59,59,999); return r; }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d)   { return new Date(d.getFullYear(), d.getMonth()+1, 0, 23, 59, 59, 999); }

export function toDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return new Date(ts);
}

function fmtTime(ts) {
  const d = toDate(ts);
  if (!d) return '--';
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(ts) {
  const d = toDate(ts);
  if (!d) return '--';
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

function fmtDateShort(ts) {
  const d = toDate(ts);
  if (!d) return '--';
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtMoney(n) {
  return n ? n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '€' : '—';
}

// ── CATEGORIZE TYPE ───────────────────────────────────────────────
function typeClass(order) {
  return order.cateringCategory || 'other';
}

function typePill(order) {
  const cls = typeClass(order);
  return `<span class="pill pill-${cls}">${order.cateringType || 'Otros'}</span>`;
}

function statusPill(order) {
  const s = order.orderStatus || '';
  if (s === 'CANCELADO') return `<span class="pill pill-cancel">Cancelado</span>`;
  if (s === 'ENTREGADO') return `<span class="pill pill-ok">Entregado</span>`;
  if (s === 'CONFIRMADO') return `<span class="pill pill-ok">Confirmado</span>`;
  return `<span class="pill pill-pending">Pendiente</span>`;
}

// ── ALERTS ENGINE ─────────────────────────────────────────────────
function buildAlerts(orders, config) {
  const alerts = [];
  const active = orders.filter(o => o.orderStatus !== 'CANCELADO');

  // New records alert
  const newOnes = active.filter(o => o.isNew);
  if (newOnes.length > 0) {
    alerts.push({
      type: 'new',
      msg: `${newOnes.length} pedido${newOnes.length > 1 ? 's' : ''} nuevo${newOnes.length > 1 ? 's' : ''} en esta importación`
    });
  }

  // Individual high pax
  active.forEach(o => {
    if (o.pax >= config.paxAlertHigh) {
      alerts.push({ type: 'red', msg: `Carga alta · ${o.customerName} (${fmtTime(o.deliveryAt)}) — ${o.pax} pax · valorar refuerzo de producción` });
    } else if (o.pax >= config.paxAlertIndividual) {
      alerts.push({ type: 'amber', msg: `Volumen elevado · ${o.customerName} (${fmtTime(o.deliveryAt)}) — ${o.pax} pax` });
    }
  });

  // Day total pax
  const totalPax = active.reduce((s, o) => s + (o.pax || 0), 0);
  if (totalPax >= config.paxAlertDayTotal) {
    alerts.push({ type: 'red', msg: `Producción total del día: ${totalPax} pax — carga elevada acumulada` });
  }

  // Overlaps: same room + overlapping time
  const byRoom = {};
  active.forEach(o => {
    const key = `${o.building}|${o.room}`.toLowerCase();
    if (!byRoom[key]) byRoom[key] = [];
    byRoom[key].push(o);
  });
  Object.entries(byRoom).forEach(([key, group]) => {
    if (group.length < 2) return;
    // Check pairwise
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        const aStart = toDate(a.deliveryAt), bStart = toDate(b.deliveryAt);
        if (aStart && bStart && Math.abs(aStart - bStart) < 60 * 60 * 1000) {
          const roomLabel = `${a.building} · ${a.room}`.trim();
          alerts.push({ type: 'red', msg: `Solapamiento · ${fmtTime(a.deliveryAt)} — 2 servicios en ${roomLabel} al mismo tiempo` });
          return;
        }
      }
    }
  });

  return alerts;
}

// ── RENDER ALERTS ─────────────────────────────────────────────────
function renderAlerts(alerts) {
  if (!alerts.length) return '';
  const iconMap = {
    red:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    amber: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    new:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
  };
  return `<div class="alerts">${alerts.map(a =>
    `<div class="alert alert-${a.type === 'new' ? 'new' : a.type === 'red' ? 'red' : 'amber'}">
      ${iconMap[a.type] || iconMap.amber}
      <span>${a.msg}</span>
    </div>`
  ).join('')}</div>`;
}

// ── RENDER KPIs ───────────────────────────────────────────────────
function renderKPIs(orders, config) {
  const active     = orders.filter(o => o.orderStatus !== 'CANCELADO');
  const cancelled  = orders.filter(o => o.orderStatus === 'CANCELADO');
  const totalPax   = active.reduce((s, o) => s + (o.pax || 0), 0);
  const totalPrice = active.reduce((s, o) => s + (o.priceTotal || 0), 0);
  const withComment= active.filter(o => o.userComment || o.internalComment);

  const paxClass = totalPax >= config.paxAlertDayTotal ? 'alert' : totalPax >= config.paxAlertDayTotal * 0.75 ? 'warn' : '';

  return `<div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Servicios</div>
      <div class="kpi-value">${active.length}</div>
      <div class="kpi-sub">${cancelled.length > 0 ? cancelled.length + ' cancelado' + (cancelled.length > 1 ? 's' : '') : 'ninguno cancelado'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total pax</div>
      <div class="kpi-value ${paxClass}">${totalPax}</div>
      <div class="kpi-sub">${active.length ? Math.round(totalPax / active.length) + ' media por servicio' : '—'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Importe sin IVA</div>
      <div class="kpi-value">${fmtMoney(totalPrice)}</div>
      <div class="kpi-sub">servicios activos</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Con comentario</div>
      <div class="kpi-value ${withComment.length > 0 ? 'warn' : ''}">${withComment.length}</div>
      <div class="kpi-sub">${withComment.length > 0 ? 'revisar antes de entregar' : 'sin incidencias'}</div>
    </div>
  </div>`;
}

// ── RENDER TIMELINE ───────────────────────────────────────────────
function renderTimeline(orders) {
  const active = orders.filter(o => o.orderStatus !== 'CANCELADO' && toDate(o.deliveryAt));
  if (!active.length) return '';

  // Find hour range
  const hours = active.map(o => toDate(o.deliveryAt).getHours());
  const minH = Math.max(0, Math.min(...hours) - 0);
  const maxH = Math.min(23, Math.max(...hours) + 2);
  const span = maxH - minH || 1;

  // Detect overlapping rooms
  const overlapIds = new Set();
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      const sameRoom = a.room && b.room && a.room.toLowerCase() === b.room.toLowerCase() && a.building?.toLowerCase() === b.building?.toLowerCase();
      if (sameRoom) {
        const aT = toDate(a.deliveryAt), bT = toDate(b.deliveryAt);
        if (Math.abs(aT - bT) < 60 * 60 * 1000) { overlapIds.add(a.orderId); overlapIds.add(b.orderId); }
      }
    }
  }

  const rows = active.map(o => {
    const d    = toDate(o.deliveryAt);
    const hPos = ((d.getHours() + d.getMinutes() / 60) - minH) / span * 100;
    const cls  = [typeClass(o), overlapIds.has(o.orderId) ? 'overlap' : ''].filter(Boolean).join(' ');
    const label = `${o.customerName} · ${o.room || o.buildingRoom} · ${o.pax} pax`;

    return `<div class="tl-row">
      <span class="tl-time">${fmtTime(o.deliveryAt)}</span>
      <div class="tl-track">
        <div class="tl-bar ${cls}" style="left:${hPos.toFixed(1)}%; width:${Math.max(15, 60 - hPos * 0.3)}%" title="${label}">
          ${label}
        </div>
      </div>
    </div>`;
  }).join('');

  // Hour axis
  const axisTicks = [];
  for (let h = minH; h <= maxH; h++) {
    axisTicks.push(`<span class="tl-hour">${String(h).padStart(2,'0')}:00</span>`);
  }

  return `<p class="section-label">Línea de tiempo</p>
  <div class="timeline-wrap">
    <div class="tl-rows">${rows}</div>
    <div class="tl-axis">${axisTicks.join('')}</div>
  </div>`;
}

// ── RENDER ORDER CARD ─────────────────────────────────────────────
function renderOrderCard(o, showNew = true) {
  const isCancelled = o.orderStatus === 'CANCELADO';
  const hasComment  = !!(o.userComment || o.internalComment);
  const classes = ['order-card'];
  if (isCancelled) classes.push('cancelled');
  if (hasComment)  classes.push('has-comment');
  if (o.isNew && showNew) classes.push('is-new');

  // Pax pill
  let paxPill = '';
  if (!isCancelled && o.pax) {
    if (o.pax >= 50) paxPill = `<span class="pill pill-pax-red">${o.pax} pax</span>`;
    else if (o.pax >= 30) paxPill = `<span class="pill pill-pax-amber">${o.pax} pax</span>`;
  }

  // New badge
  const newBadge = (o.isNew && showNew) ? `<span class="pill pill-new">Nuevo</span>` : '';

  // Location
  const loc = [o.building, o.floor, o.room ? `Sala ${o.room}` : ''].filter(Boolean).join(' · ') || o.buildingRoom || '—';

  // Teardown time
  const teardown = o.teardownTime ? ` – ${o.teardownTime}` : '';

  // Price detail
  const prices = [];
  if (o.priceFood)      prices.push(`Alim. ${fmtMoney(o.priceFood)}`);
  if (o.priceDrinks)    prices.push(`Beb. ${fmtMoney(o.priceDrinks)}`);
  if (o.priceTransport) prices.push(`Transp. ${fmtMoney(o.priceTransport)}`);
  if (o.priceStaff)     prices.push(`Cam. ${fmtMoney(o.priceStaff)}`);
  const priceDetail = prices.length ? `<span class="meta-item" title="${prices.join(' | ')}">${fmtMoney(o.priceTotal)}</span>` : '';

  return `<div class="${classes.join(' ')}">
    <div class="order-top">
      <div class="order-who">
        <span class="order-name">${o.customerName || '—'}</span>
        <span class="order-loc">${loc}</span>
      </div>
      <div class="order-pills">
        ${newBadge}
        ${typePill(o)}
        ${paxPill}
        ${statusPill(o)}
        ${o.isLate ? `<span class="pill pill-pax-red">⚑ ${o.lateMinutes ? o.lateMinutes + ' min' : 'Tarde'}</span>` : ''}
      </div>
    </div>
    <div class="order-meta">
      ${o.deliveryAt ? `<span class="meta-item">🕐 ${fmtTime(o.deliveryAt)}${teardown}</span>` : ''}
      ${o.pax && !paxPill ? `<span class="meta-item">👥 ${o.pax} pax</span>` : ''}
      ${priceDetail}
      ${o.company ? `<span class="meta-item" style="color:var(--text-tertiary)">${o.company}</span>` : ''}
      <span class="photo-dot"><span class="dot ${o.hasDeliveryPhoto ? 'dot-yes' : 'dot-no'}"></span> foto entrega</span>
      <span class="photo-dot"><span class="dot ${o.hasPickupPhoto ? 'dot-yes' : 'dot-no'}"></span> foto recogida</span>
    </div>
    ${o.userComment ? `<div class="comment-box">💬 ${o.userComment}</div>` : ''}
    ${o.internalComment ? `<div class="comment-internal">📋 ${o.internalComment}</div>` : ''}
  </div>`;
}

// ── TODAY VIEW ────────────────────────────────────────────────────
async function renderToday(container) {
  const now   = new Date();
  const from  = startOfDay(now);
  const to    = endOfDay(now);
  const [orders, config] = await Promise.all([getOrders({ from, to }), getConfig()]);

  if (!orders.length) {
    container.innerHTML = `<div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-tertiary)"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      <p>Sin pedidos para hoy</p>
    </div>`;
    return;
  }

  const alerts = buildAlerts(orders, config);
  container.innerHTML =
    renderKPIs(orders, config) +
    renderAlerts(alerts) +
    renderTimeline(orders) +
    `<p class="section-label">Pedidos</p>
    <div class="orders">${orders.map(o => renderOrderCard(o)).join('')}</div>`;
}

// ── WEEK VIEW ─────────────────────────────────────────────────────
async function renderWeek(container) {
  const now   = new Date();
  const from  = startOfWeek(now);
  const to    = endOfWeek(now);
  const [orders, config] = await Promise.all([getOrders({ from, to }), getConfig()]);

  if (!orders.length) {
    container.innerHTML = `<div class="empty-state"><p>Sin pedidos esta semana</p></div>`;
    return;
  }

  // Group by day
  const byDay = {};
  orders.forEach(o => {
    const d = toDate(o.deliveryAt);
    if (!d) return;
    const key = d.toISOString().slice(0, 10);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(o);
  });

  // Week KPIs
  const active    = orders.filter(o => o.orderStatus !== 'CANCELADO');
  const totalPax  = active.reduce((s, o) => s + (o.pax||0), 0);
  const totalPrice= active.reduce((s, o) => s + (o.priceTotal||0), 0);

  let html = `<div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-label">Servicios semana</div><div class="kpi-value">${active.length}</div></div>
    <div class="kpi-card"><div class="kpi-label">Total pax</div><div class="kpi-value">${totalPax}</div></div>
    <div class="kpi-card"><div class="kpi-label">Importe sin IVA</div><div class="kpi-value">${fmtMoney(totalPrice)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Días con servicio</div><div class="kpi-value">${Object.keys(byDay).length}</div></div>
  </div><div class="period-grid">`;

  Object.keys(byDay).sort().forEach(key => {
    const dayOrders = byDay[key];
    const dayActive = dayOrders.filter(o => o.orderStatus !== 'CANCELADO');
    const dayPax    = dayActive.reduce((s, o) => s + (o.pax||0), 0);
    const dayPrice  = dayActive.reduce((s, o) => s + (o.priceTotal||0), 0);
    const label     = fmtDateShort(new Date(key + 'T12:00:00'));
    const isToday   = key === now.toISOString().slice(0,10);

    html += `<div class="period-day">
      <div class="period-day-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
        <span class="period-day-title">${label}${isToday ? ' <span style="color:var(--text-tertiary);font-weight:400;font-size:12px">· hoy</span>' : ''}</span>
        <span class="period-day-meta">
          <span>${dayActive.length} servicios</span>
          <span>${dayPax} pax</span>
          <span>${fmtMoney(dayPrice)}</span>
        </span>
      </div>
      <div class="period-day-body ${isToday ? '' : 'collapsed'}">
        ${dayOrders.map(o => renderOrderCard(o, false)).join('')}
      </div>
    </div>`;
  });

  html += '</div>';
  container.innerHTML = html;
}

// ── MONTH VIEW ────────────────────────────────────────────────────
async function renderMonth(container) {
  const now  = new Date();
  const from = startOfMonth(now);
  const to   = endOfMonth(now);
  const [orders, config] = await Promise.all([getOrders({ from, to }), getConfig()]);

  if (!orders.length) {
    container.innerHTML = `<div class="empty-state"><p>Sin pedidos este mes</p></div>`;
    return;
  }

  const active    = orders.filter(o => o.orderStatus !== 'CANCELADO');
  const totalPax  = active.reduce((s, o) => s + (o.pax||0), 0);
  const totalPrice= active.reduce((s, o) => s + (o.priceTotal||0), 0);
  const cancelled = orders.filter(o => o.orderStatus === 'CANCELADO');

  // Group by day
  const byDay = {};
  orders.forEach(o => {
    const d = toDate(o.deliveryAt);
    if (!d) return;
    const key = d.toISOString().slice(0, 10);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(o);
  });

  let html = `<div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-label">Servicios mes</div><div class="kpi-value">${active.length}</div><div class="kpi-sub">${cancelled.length} cancelados</div></div>
    <div class="kpi-card"><div class="kpi-label">Total pax</div><div class="kpi-value">${totalPax}</div></div>
    <div class="kpi-card"><div class="kpi-label">Importe sin IVA</div><div class="kpi-value">${fmtMoney(totalPrice)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Días con servicio</div><div class="kpi-value">${Object.keys(byDay).length}</div></div>
  </div><div class="period-grid">`;

  Object.keys(byDay).sort().forEach(key => {
    const dayOrders = byDay[key];
    const dayActive = dayOrders.filter(o => o.orderStatus !== 'CANCELADO');
    const dayPax    = dayActive.reduce((s, o) => s + (o.pax||0), 0);
    const dayPrice  = dayActive.reduce((s, o) => s + (o.priceTotal||0), 0);
    const label     = fmtDateShort(new Date(key + 'T12:00:00'));

    html += `<div class="period-day">
      <div class="period-day-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
        <span class="period-day-title">${label}</span>
        <span class="period-day-meta">
          <span>${dayActive.length} servicios</span>
          <span>${dayPax} pax</span>
          <span>${fmtMoney(dayPrice)}</span>
        </span>
      </div>
      <div class="period-day-body collapsed">
        ${dayOrders.map(o => renderOrderCard(o, false)).join('')}
      </div>
    </div>`;
  });

  html += '</div>';
  container.innerHTML = html;
}

// ── CUMULATIVE VIEW ───────────────────────────────────────────────
async function renderCumulative(container) {
  const [orders, config] = await Promise.all([getOrders(), getConfig()]);
  const active = orders.filter(o => o.orderStatus !== 'CANCELADO');

  if (!active.length) {
    container.innerHTML = `<div class="empty-state"><p>Sin datos acumulados</p></div>`;
    return;
  }

  const totalPax   = active.reduce((s, o) => s + (o.pax||0), 0);
  const totalPrice = active.reduce((s, o) => s + (o.priceTotal||0), 0);
  const totalFood  = active.reduce((s, o) => s + (o.priceFood||0), 0);
  const totalDrink = active.reduce((s, o) => s + (o.priceDrinks||0), 0);
  const totalTrans = active.reduce((s, o) => s + (o.priceTransport||0), 0);
  const totalStaff = active.reduce((s, o) => s + (o.priceStaff||0), 0);

  // By type
  const byType = {};
  active.forEach(o => {
    const t = o.cateringType || 'Otros';
    if (!byType[t]) byType[t] = { count: 0, pax: 0, price: 0 };
    byType[t].count++;
    byType[t].pax   += o.pax || 0;
    byType[t].price += o.priceTotal || 0;
  });

  // By company (top 10)
  const byCompany = {};
  active.forEach(o => {
    const c = o.company || 'Sin empresa';
    if (!byCompany[c]) byCompany[c] = { count: 0, pax: 0, price: 0 };
    byCompany[c].count++;
    byCompany[c].pax   += o.pax || 0;
    byCompany[c].price += o.priceTotal || 0;
  });

  const maxTypePax  = Math.max(...Object.values(byType).map(v => v.pax));
  const maxCompPrice= Math.max(...Object.values(byCompany).map(v => v.price));

  const typeRows = Object.entries(byType).sort((a,b) => b[1].pax - a[1].pax).map(([t, v]) =>
    `<div class="bar-row">
      <span class="bar-label" title="${t}">${t}</span>
      <div class="bar-fill-wrap"><div class="bar-fill" style="width:${(v.pax/maxTypePax*100).toFixed(0)}%"></div></div>
      <span class="bar-val">${v.pax} pax</span>
    </div>`).join('');

  const compRows = Object.entries(byCompany).sort((a,b) => b[1].price - a[1].price).slice(0, 10).map(([c, v]) =>
    `<div class="bar-row">
      <span class="bar-label" title="${c}">${c}</span>
      <div class="bar-fill-wrap"><div class="bar-fill" style="width:${(v.price/maxCompPrice*100).toFixed(0)}%"></div></div>
      <span class="bar-val">${fmtMoney(v.price)}</span>
    </div>`).join('');

  container.innerHTML = `<div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-label">Total servicios</div><div class="kpi-value">${active.length}</div></div>
    <div class="kpi-card"><div class="kpi-label">Total pax</div><div class="kpi-value">${totalPax}</div></div>
    <div class="kpi-card"><div class="kpi-label">Importe total sin IVA</div><div class="kpi-value">${fmtMoney(totalPrice)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Media pax / servicio</div><div class="kpi-value">${Math.round(totalPax/active.length)}</div></div>
  </div>
  <div class="stats-grid">
    <div class="stat-card">
      <h3>Pax por tipo de servicio</h3>
      <div class="bar-chart">${typeRows}</div>
    </div>
    <div class="stat-card">
      <h3>Importe por empresa (top 10)</h3>
      <div class="bar-chart">${compRows}</div>
    </div>
    <div class="stat-card">
      <h3>Desglose de importes</h3>
      <div class="bar-chart">
        <div class="bar-row"><span class="bar-label">Alimentos</span><div class="bar-fill-wrap"><div class="bar-fill" style="width:${totalPrice ? (totalFood/totalPrice*100).toFixed(0) : 0}%"></div></div><span class="bar-val">${fmtMoney(totalFood)}</span></div>
        <div class="bar-row"><span class="bar-label">Bebidas</span><div class="bar-fill-wrap"><div class="bar-fill" style="width:${totalPrice ? (totalDrink/totalPrice*100).toFixed(0) : 0}%"></div></div><span class="bar-val">${fmtMoney(totalDrink)}</span></div>
        <div class="bar-row"><span class="bar-label">Transporte</span><div class="bar-fill-wrap"><div class="bar-fill" style="width:${totalPrice ? (totalTrans/totalPrice*100).toFixed(0) : 0}%"></div></div><span class="bar-val">${fmtMoney(totalTrans)}</span></div>
        <div class="bar-row"><span class="bar-label">Camareros</span><div class="bar-fill-wrap"><div class="bar-fill" style="width:${totalPrice ? (totalStaff/totalPrice*100).toFixed(0) : 0}%"></div></div><span class="bar-val">${fmtMoney(totalStaff)}</span></div>
      </div>
    </div>
    <div class="stat-card">
      <h3>Resumen operativo</h3>
      <div class="bar-chart">
        <div class="bar-row"><span class="bar-label">Con foto entrega</span><div class="bar-fill-wrap"><div class="bar-fill" style="width:${(active.filter(o=>o.hasDeliveryPhoto).length/active.length*100).toFixed(0)}%"></div></div><span class="bar-val">${active.filter(o=>o.hasDeliveryPhoto).length}</span></div>
        <div class="bar-row"><span class="bar-label">Con foto recogida</span><div class="bar-fill-wrap"><div class="bar-fill" style="width:${(active.filter(o=>o.hasPickupPhoto).length/active.length*100).toFixed(0)}%"></div></div><span class="bar-val">${active.filter(o=>o.hasPickupPhoto).length}</span></div>
        <div class="bar-row"><span class="bar-label">Con retraso</span><div class="bar-fill-wrap"><div class="bar-fill" style="width:${(active.filter(o=>o.isLate).length/active.length*100).toFixed(0)}%"></div></div><span class="bar-val">${active.filter(o=>o.isLate).length}</span></div>
        <div class="bar-row"><span class="bar-label">Con comentario</span><div class="bar-fill-wrap"><div class="bar-fill" style="width:${(active.filter(o=>o.userComment||o.internalComment).length/active.length*100).toFixed(0)}%"></div></div><span class="bar-val">${active.filter(o=>o.userComment||o.internalComment).length}</span></div>
      </div>
    </div>
  </div>`;
}

// ── MAIN RENDER DISPATCHER ────────────────────────────────────────
export async function renderView(view, container) {
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>Cargando…</span></div>`;
  try {
    if (view === 'today')      await renderToday(container);
    else if (view === 'week')  await renderWeek(container);
    else if (view === 'month') await renderMonth(container);
    else                       await renderCumulative(container);
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Error al cargar: ${e.message}</p></div>`;
    console.error(e);
  }
}
