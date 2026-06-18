// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  enableIndexedDbPersistence,
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBdvSI91-ZTnUAn1kYcsE8le6bYq3L4WdQ",
  authDomain: "taska-1f681.firebaseapp.com",
  projectId: "taska-1f681",
  storageBucket: "taska-1f681.firebasestorage.app",
  messagingSenderId: "662084572571",
  appId: "1:662084572571:web:b5b4a03ae3d7ae3835fd3e",
  measurementId: "G-VMDN9E4TX5"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// Enable offline persistence
enableIndexedDbPersistence(db).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('Offline: múltiples pestañas abiertas');
  } else if (err.code === 'unimplemented') {
    console.warn('Offline: navegador no compatible');
  }
});

// ── HELPERS ──────────────────────────────────────────────────────

/** Save or update a catering order */
export async function saveOrder(order) {
  const ref = doc(db, 'catering_orders', order.orderId);
  await setDoc(ref, { ...order, updatedAt: Timestamp.now() }, { merge: true });
}

/** Get all orders, optionally filtered by date range */
export async function getOrders({ from, to } = {}) {
  let q;
  const col = collection(db, 'catering_orders');

  if (from && to) {
    q = query(
      col,
      where('deliveryAt', '>=', Timestamp.fromDate(from)),
      where('deliveryAt', '<=', Timestamp.fromDate(to)),
      orderBy('deliveryAt', 'asc')
    );
  } else {
    q = query(col, orderBy('deliveryAt', 'asc'));
  }

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Get existing order IDs (for import deduplication) */
export async function getExistingOrderIds() {
  const snap = await getDocs(collection(db, 'catering_orders'));
  return new Set(snap.docs.map(d => d.id));
}

/** Save config / thresholds */
export async function saveConfig(config) {
  await setDoc(doc(db, 'catering_config', 'settings'), config, { merge: true });
}

/** Get config */
export async function getConfig() {
  const { getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  const snap = await getDoc(doc(db, 'catering_config', 'settings'));
  return snap.exists() ? snap.data() : defaultConfig();
}

function defaultConfig() {
  return {
    paxAlertIndividual: 30,   // amber
    paxAlertHigh: 50,         // red (single service)
    paxAlertDayTotal: 100,    // red (day cumulative)
  };
}

export { db };
