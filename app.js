// js/app.js
import { renderView } from './dashboard.js';
import { processImport, confirmImport } from './importer.js';
import { saveOrder } from './firebase.js';

// ── INIT ──────────────────────────────────────────────────────────
const mainContent = document.getElementById('mainContent');
const currentDate = document.getElementById('currentDate');
const mainTabs    = document.getElementById('mainTabs');

let currentView = 'today';

// Set date
currentDate.textContent = new Date().toLocaleDateString('es-ES', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
});

// Initial render
renderView(currentView, mainContent);

// ── TAB NAVIGATION ────────────────────────────────────────────────
mainTabs.addEventListener('click', e => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  currentView = tab.dataset.view;
  renderView(currentView, mainContent);
});

// ── IMPORT MODAL ──────────────────────────────────────────────────
const importModal   = document.getElementById('importModal');
const closeImport   = document.getElementById('closeImport');
const dropZone      = document.getElementById('dropZone');
const fileInput     = document.getElementById('fileInput');
const importPreview = document.getElementById('importPreview');
const importSummary = document.getElementById('importSummary');
const importNewList = document.getElementById('importNewList');
const importProgress= document.getElementById('importProgress');
const progressFill  = document.getElementById('progressFill');
const progressText  = document.getElementById('progressText');
const btnConfirm    = document.getElementById('btnConfirmImport');

let pendingImport = null;

document.getElementById('btnImport').addEventListener('click', () => {
  importModal.hidden = false;
  resetImportModal();
});
closeImport.addEventListener('click', () => { importModal.hidden = true; });
importModal.addEventListener('click', e => { if (e.target === importModal) importModal.hidden = true; });

// Drag & drop
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

async function handleFile(file) {
  if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
    alert('Por favor seleccioná un archivo CSV');
    return;
  }
  try {
    const text = await file.text();
    const result = await processImport(text);
    pendingImport = result;
    showImportPreview(result);
  } catch (e) {
    alert('Error al procesar el archivo: ' + e.message);
    console.error(e);
  }
}

function showImportPreview({ orders, newOrders, updatedOrders }) {
  importSummary.innerHTML = `
    <strong>${orders.length}</strong> pedidos en el archivo<br>
    <span style="color:var(--ok-fg)">✓ ${newOrders.length} nuevos</span> &nbsp;·&nbsp;
    <span style="color:var(--text-secondary)">${updatedOrders.length} ya existentes (se actualizarán)</span>
  `;

  if (newOrders.length > 0) {
    importNewList.innerHTML = newOrders.map(o =>
      `<div class="import-new-item">
        <span>${o.customerName} · ${o.buildingRoom}</span>
        <span>${o.deliveryAtISO ? new Date(o.deliveryAtISO).toLocaleDateString('es-ES') : '—'}</span>
      </div>`
    ).join('');
  } else {
    importNewList.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary);padding:4px 0">No hay pedidos nuevos — solo actualizaciones</div>';
  }

  importPreview.hidden = false;
}

btnConfirm.addEventListener('click', async () => {
  if (!pendingImport) return;
  btnConfirm.disabled = true;
  importPreview.hidden = true;
  importProgress.hidden = false;

  const newIds = new Set(pendingImport.newOrders.map(o => o.orderId));

  await confirmImport(pendingImport.orders, newIds, (pct, done, total) => {
    progressFill.style.width = pct + '%';
    progressText.textContent = `Guardando… ${done} de ${total}`;
  });

  progressText.textContent = '✓ Importación completada';
  setTimeout(() => {
    importModal.hidden = true;
    resetImportModal();
    renderView(currentView, mainContent);
  }, 1200);
});

function resetImportModal() {
  pendingImport = null;
  importPreview.hidden = true;
  importProgress.hidden = true;
  progressFill.style.width = '0%';
  progressText.textContent = 'Procesando…';
  btnConfirm.disabled = false;
  fileInput.value = '';
  importNewList.innerHTML = '';
  importSummary.innerHTML = '';
}

// ── ADD MANUAL MODAL ──────────────────────────────────────────────
const addModal  = document.getElementById('addModal');
const closeAdd  = document.getElementById('closeAdd');
const btnAdd    = document.getElementById('btnAdd');
const btnSave   = document.getElementById('btnSaveManual');

btnAdd.addEventListener('click', () => { addModal.hidden = false; });
closeAdd.addEventListener('click', () => { addModal.hidden = true; });
addModal.addEventListener('click', e => { if (e.target === addModal) addModal.hidden = true; });

btnSave.addEventListener('click', async () => {
  const deliveryVal = document.getElementById('fDelivery').value;
  const orderId = 'MANUAL-' + Date.now();

  const order = {
    orderId,
    customerId:      '',
    customerName:    document.getElementById('fName').value.trim(),
    company:         document.getElementById('fCompany').value.trim(),
    email:           document.getElementById('fEmail').value.trim(),
    phone:           document.getElementById('fPhone').value.trim(),
    buildingRoom:    `${document.getElementById('fBuilding').value} - ${document.getElementById('fRoom').value}`,
    building:        document.getElementById('fBuilding').value.trim(),
    floor:           '',
    room:            document.getElementById('fRoom').value.trim(),
    deliveryAt:      deliveryVal ? { seconds: new Date(deliveryVal).getTime() / 1000 } : null,
    deliveryAtISO:   deliveryVal ? new Date(deliveryVal).toISOString() : null,
    teardownTime:    document.getElementById('fTeardown').value,
    setupTime:       '',
    startTime:       '',
    pax:             parseInt(document.getElementById('fPax').value || '0', 10),
    cateringType:    document.getElementById('fType').value,
    cateringCategory:categorizeCatering(document.getElementById('fType').value),
    orderStatus:     'CONFIRMADO',
    statusCode:      '',
    userComment:     document.getElementById('fComment').value.trim(),
    internalComment: document.getElementById('fInternal').value.trim(),
    hasDeliveryPhoto:false,
    hasPickupPhoto:  false,
    isLate:          false,
    lateMinutes:     0,
    costCenter:      '',
    department:      '',
    priceFood:       0,
    priceDrinks:     0,
    priceTransport:  0,
    priceStaff:      0,
    priceTotal:      0,
    isManual:        true,
    isNew:           true,
    source:          'manual',
    center:          '',
    createdAt:       { seconds: Date.now() / 1000 },
  };

  btnSave.disabled = true;
  btnSave.textContent = 'Guardando…';
  try {
    await saveOrder(order);
    addModal.hidden = true;
    clearAddForm();
    renderView(currentView, mainContent);
  } catch (e) {
    alert('Error al guardar: ' + e.message);
  }
  btnSave.disabled = false;
  btnSave.textContent = 'Guardar pedido';
});

function categorizeCatering(type) {
  const t = type.toLowerCase();
  if (t.includes('desayuno') || t.includes('coffee') || t.includes('break')) return 'coffee';
  if (t.includes('comida') || t.includes('lunch') || t.includes('finger') || t.includes('carta')) return 'lunch';
  return 'other';
}

function clearAddForm() {
  ['fName','fCompany','fEmail','fPhone','fBuilding','fRoom','fDelivery','fTeardown','fPax','fComment','fInternal'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('fType').value = '';
}
