// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE CLIENT & FIRESTORE DATA ACCESS LAYER
// Project: dukanstock-c244b
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCAwcLa0flaeF8mFYo_9PQA7RuBv2Zk8vI",
  authDomain: "dukanstock-c244b.firebaseapp.com",
  projectId: "dukanstock-c244b",
  storageBucket: "dukanstock-c244b.firebasestorage.app",
  messagingSenderId: "794120667790",
  appId: "1:794120667790:web:6a09bb640d0c94a2277fdf"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

const COLLECTION_NAME = "packing_entries";

/**
 * Save or update a packing entry in Firestore
 * @param {Object} entry
 * @returns {Promise<string>} docId
 */
export async function saveEntry(entry) {
  const data = {
    ...entry,
    updatedAt: serverTimestamp()
  };

  if (entry.id) {
    const docRef = doc(db, COLLECTION_NAME, entry.id);
    await updateDoc(docRef, data);
    return entry.id;
  } else {
    data.createdAt = serverTimestamp();
    const docRef = await addDoc(collection(db, COLLECTION_NAME), data);
    return docRef.id;
  }
}

/**
 * Delete an entry by ID
 * @param {string} id
 */
export async function deleteEntry(id) {
  if (!id) return;
  const docRef = doc(db, COLLECTION_NAME, id);
  await deleteDoc(docRef);
}

/**
 * Real-time listener for all packing entries
 * @param {Function} callback (entriesArray) => void
 * @returns {Function} unsubscribe function
 */
export function subscribeToEntries(callback) {
  const q = query(collection(db, COLLECTION_NAME), orderBy("date", "desc"));
  return onSnapshot(q, (snapshot) => {
    const entries = [];
    snapshot.forEach((doc) => {
      entries.push({ id: doc.id, ...doc.data() });
    });
    // Sort stably: date desc, then timestamp desc
    entries.sort((a, b) => {
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
    callback(entries);
  }, (err) => {
    console.error("Firestore onSnapshot error:", err);
  });
}

/**
 * Auto Carry-Forward Logic:
 * Given a productId and a target dateStr (YYYY-MM-DD),
 * find the most recent entry strictly before this date (or previous entry)
 * and return its closing balance.
 *
 * Formula:
 * Next day Opening Balance = Previous day Closing Balance
 */
export function getAutoCarryForward(entries, productId, targetDateStr) {
  // Filter entries for this product
  const productEntries = entries.filter(e => e.productId === productId);
  if (!productEntries.length) {
    return { openingBalance: 0, fromDate: null, prevEntry: null };
  }

  // Filter entries strictly before targetDateStr
  const beforeEntries = productEntries.filter(e => e.date < targetDateStr);
  if (beforeEntries.length > 0) {
    // Sort by date desc, then timestamp desc
    beforeEntries.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
    const latestPrev = beforeEntries[0];
    return {
      openingBalance: Number(latestPrev.closingBalance) || 0,
      fromDate: latestPrev.date,
      prevEntry: latestPrev
    };
  }

  // If no entry exists strictly before, check if there is an existing entry on the target date
  const sameDayEntries = productEntries.filter(e => e.date === targetDateStr);
  if (sameDayEntries.length > 0) {
    sameDayEntries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return {
      openingBalance: Number(sameDayEntries[0].openingBalance) || 0,
      fromDate: targetDateStr,
      prevEntry: sameDayEntries[0]
    };
  }

  return { openingBalance: 0, fromDate: null, prevEntry: null };
}

export { db };
