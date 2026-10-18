// ─────────────────────────────────────────────────────────────────────────────
// 365 SPICERY — DUKAN STOCK MANAGER
// Label Studio Real-Time Live Sync Service
// Connects to Firebase project: lablerecords-3f897 (Collection: labelRecords)
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

const LABEL_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBUC4Ej-pNcQsMbWYavJu9tBH53_WWL-zA",
  authDomain: "lablerecords-3f897.firebaseapp.com",
  projectId: "lablerecords-3f897",
  storageBucket: "lablerecords-3f897.firebasestorage.app",
  messagingSenderId: "936028827480",
  appId: "1:936028827480:web:0e6aea6bccddafa75f7f2d"
};

const LABEL_COLLECTION_NAME = "labelRecords";

let labelDb = null;
let cachedLabelRecords = [];
let updateListeners = [];
let isConnected = false;

// ── Initialize Label Studio Firebase connection ──
export function initLabelSync() {
  if (labelDb) return labelDb;
  try {
    const existing = getApps().find(a => a.name === "label-records-sync");
    const app = existing || initializeApp(LABEL_FIREBASE_CONFIG, "label-records-sync");
    labelDb = getFirestore(app);
    console.log("[LabelSync] Connected to Label Studio Cloud (lablerecords-3f897)");
    startLabelListener();
    return labelDb;
  } catch (err) {
    console.error("[LabelSync] Init error:", err);
    isConnected = false;
    notifyListeners();
    return null;
  }
}

// ── Real-Time Listener for Label Print Records ──
function startLabelListener() {
  if (!labelDb) return;
  try {
    const q = collection(labelDb, LABEL_COLLECTION_NAME);
    onSnapshot(q, (snapshot) => {
      const records = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        // STRICT FILTER: Only include "Dukan Bai" sticker records!
        const isDukan = (data.stickerType === "dukan") || (data.stickerLabel === "Dukan Bai");
        // Only include non-front packaging label records
        const isNotFront = data.labelSide !== "front" && data.packSize !== "FRONT";

        if (isDukan && isNotFront) {
          records.push({
            id: docSnap.id,
            ...data
          });
        }
      });
      cachedLabelRecords = records;
      isConnected = true;
      console.log(`[LabelSync] Real-time sync: ${records.length} Dukan Bai print records loaded.`);
      notifyListeners();
    }, (err) => {
      console.warn("[LabelSync] Snapshot error:", err);
      isConnected = false;
      notifyListeners();
    });
  } catch (err) {
    console.error("[LabelSync] Listener error:", err);
    isConnected = false;
    notifyListeners();
  }
}

// ── Register callback on label records update ──
export function subscribeToLabelSync(callback) {
  if (typeof callback === "function") {
    updateListeners.push(callback);
    callback({
      records: cachedLabelRecords,
      connected: isConnected,
      totalCount: cachedLabelRecords.length
    });
  }
  return () => {
    updateListeners = updateListeners.filter(cb => cb !== callback);
  };
}

function notifyListeners() {
  const payload = {
    records: cachedLabelRecords,
    connected: isConnected,
    totalCount: cachedLabelRecords.length
  };
  updateListeners.forEach(cb => {
    try { cb(payload); } catch (e) { console.error(e); }
  });
}

// ── Convert YYYY-MM-DD to DD-MM-YYYY ──
function toLabelDateStr(dateStr) {
  if (!dateStr) return "";
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) return dateStr;
  const parts = dateStr.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

// ── Normalize strings for fuzzy match ──
function cleanStr(s) {
  return String(s || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Calculates total packed pieces and KG for a Dukan spice product on a given date.
 * Strictly matches ONLY Dukan Bai records.
 *
 * @param {Object} product - Dukan product object ({ id, name, batchCode })
 * @param {string} dateStr - Date string (YYYY-MM-DD or DD-MM-YYYY)
 * @returns {Object} { p100, p200, p500, p1000, totalPackedKg, totalPcs, printBatchesCount }
 */
export function getLabelPackedStats(product, dateStr) {
  if (!product) {
    return { p100: 0, p200: 0, p500: 0, p1000: 0, totalPackedKg: 0, totalPcs: 0, printBatchesCount: 0 };
  }

  const targetDateLabel = toLabelDateStr(dateStr);
  const prodBatchClean = cleanStr(product.batchCode);
  const prodNameClean = cleanStr(product.name);

  // Filter records matching product and date (STRICTLY Dukan Bai)
  const matchingRecords = cachedLabelRecords.filter(r => {
    // 0. Ensure strictly Dukan Bai
    const isDukan = (r.stickerType === "dukan") || (r.stickerLabel === "Dukan Bai");
    if (!isDukan) return false;

    // 1. Date match
    const rDate = String(r.date || "").trim();
    if (rDate && targetDateLabel && rDate !== targetDateLabel) {
      return false;
    }

    // 2. Product match: by batch code or exact/fuzzy product name
    const rBatchClean = cleanStr(r.batchNo);
    const rNameClean = cleanStr(r.productName);

    // Exact matches
    const isExactName = rNameClean && prodNameClean && (rNameClean === prodNameClean);
    const isExactBatch = rBatchClean && prodBatchClean && (rBatchClean === prodBatchClean);

    if (isExactName || isExactBatch) {
      // Disambiguate deluxe vs regular if names differ in DELUXE
      if (prodNameClean.includes("DELUXE") && !rNameClean.includes("DELUXE")) return false;
      if (!prodNameClean.includes("DELUXE") && rNameClean.includes("DELUXE")) return false;
      return true;
    }

    // Substring match
    const batchMatch = rBatchClean && prodBatchClean && (rBatchClean.includes(prodBatchClean) || prodBatchClean.includes(rBatchClean));
    const nameMatch = rNameClean && prodNameClean && (rNameClean.includes(prodNameClean) || prodNameClean.includes(rNameClean));

    if (nameMatch) {
      if (prodNameClean.includes("DELUXE") && !rNameClean.includes("DELUXE")) return false;
      if (!prodNameClean.includes("DELUXE") && rNameClean.includes("DELUXE")) return false;
      return true;
    }

    return batchMatch;
  });

  let p100 = 0;
  let p200 = 0;
  let p500 = 0;
  let p1000 = 0;
  let totalWeightG = 0;

  matchingRecords.forEach(r => {
    const sizeStr = String(r.packSize || "").toLowerCase().trim();
    const copies = Number(r.copies) || 1;
    const twG = Number(r.totalWeightG) || (Number(r.weightG) * copies) || 0;
    totalWeightG += twG;

    if (sizeStr.includes("100g") || sizeStr === "100") {
      p100 += copies;
    } else if (sizeStr.includes("200g") || sizeStr === "200") {
      p200 += copies;
    } else if (sizeStr.includes("500g") || sizeStr === "500") {
      p500 += copies;
    } else if (sizeStr.includes("1kg") || sizeStr.includes("1 kg") || sizeStr.includes("1000g") || sizeStr === "1000") {
      p1000 += copies;
    } else {
      // Fallback: estimate from weightG
      const g = Number(r.weightG) || 0;
      if (g === 100) p100 += copies;
      else if (g === 200) p200 += copies;
      else if (g === 500) p500 += copies;
      else if (g === 1000) p1000 += copies;
      else {
        // Default to closest standard or count in 1kg
        p1000 += copies;
      }
    }
  });

  const totalPackedKg = (p100 * 0.1) + (p200 * 0.2) + (p500 * 0.5) + (p1000 * 1.0);
  const totalPcs = p100 + p200 + p500 + p1000;

  return {
    p100,
    p200,
    p500,
    p1000,
    totalPackedKg: Number(totalPackedKg.toFixed(2)),
    totalPcs,
    printBatchesCount: matchingRecords.length,
    matchingRecords
  };
}

export function getLabelSyncStatus() {
  return {
    connected: isConnected,
    totalRecords: cachedLabelRecords.length
  };
}
