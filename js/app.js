// ─────────────────────────────────────────────────────────────────────────────
// DUKAN STOCK & PACKAGING MANAGER — MAIN APPLICATION LOGIC
// ─────────────────────────────────────────────────────────────────────────────

import { DUKAN_PRODUCTS, CATEGORIES, getProductById } from "./products.js";
import { saveEntry, deleteEntry, subscribeToEntries, getAutoCarryForward } from "./firebase.js";

// ── APP STATE ──
let currentDate = getTodayStr();
let allEntries = [];
let selectedCategory = "All";
let searchQuery = "";
let currentView = "dashboard";
let editingEntryId = null;
let historyProductId = null;
let isOpeningOverridden = false;

// ── DOM ELEMENTS CACHE ──
const dom = {
  // Navigation & Views
  navItems: document.querySelectorAll("[data-view]"),
  views: {
    dashboard: document.getElementById("view-dashboard"),
    ledger: document.getElementById("view-ledger"),
    products: document.getElementById("view-products"),
  },
  pageTitle: document.getElementById("page-title"),

  // Date Navigation
  btnPrevDay: document.getElementById("btn-prev-day"),
  btnNextDay: document.getElementById("btn-next-day"),
  dateDisplay: document.getElementById("date-display"),
  dateText: document.getElementById("date-text"),
  datePickerHidden: document.getElementById("date-picker-hidden"),
  btnJumpToday: document.getElementById("btn-jump-today"),

  // Topbar Actions
  btnExportExcel: document.getElementById("btn-export-excel"),
  btnOpenNewEntry: document.getElementById("btn-open-new-entry"),
  mobQuickAddBtn: document.getElementById("mob-quick-add-btn"),

  // KPI Elements
  kpiTodayInward: document.getElementById("kpi-today-inward"),
  kpiTodayPacked: document.getElementById("kpi-today-packed"),
  kpiTodayPcs: document.getElementById("kpi-today-pcs"),
  kpiTodayWastage: document.getElementById("kpi-today-wastage"),
  kpiTotalClosing: document.getElementById("kpi-total-closing"),

  // Dashboard Toolbar & Table
  searchProductsInput: document.getElementById("search-products-input"),
  categoryChipsWrap: document.getElementById("category-chips-wrap"),
  dashboardStockTbody: document.getElementById("dashboard-stock-tbody"),

  // Master Ledger Table
  ledgerFilterProduct: document.getElementById("ledger-filter-product"),
  ledgerFilterDate: document.getElementById("ledger-filter-date"),
  btnExportLedgerExcel: document.getElementById("btn-export-ledger-excel"),
  masterLedgerTbody: document.getElementById("master-ledger-tbody"),

  // Products Catalog Table
  btnExportProductsCatalog: document.getElementById("btn-export-products-catalog"),
  productsCatalogTbody: document.getElementById("products-catalog-tbody"),

  // Entry Modal
  modalEntryOverlay: document.getElementById("modal-entry-overlay"),
  modalEntryTitle: document.getElementById("modal-entry-title"),
  modalEntryClose: document.getElementById("modal-entry-close"),
  btnCancelEntry: document.getElementById("btn-cancel-entry"),
  entryForm: document.getElementById("entry-form"),
  entryId: document.getElementById("entry-id"),
  formProductSelect: document.getElementById("form-product-select"),
  formDateInput: document.getElementById("form-date-input"),
  formOpeningInput: document.getElementById("form-opening-input"),
  cfStatusLabel: document.getElementById("cf-status-label"),
  btnToggleOverrideOpening: document.getElementById("btn-toggle-override-opening"),
  formSourceSelect: document.getElementById("form-source-select"),
  formBatchInput: document.getElementById("form-batch-input"),
  formInwardInput: document.getElementById("form-inward-input"),
  formP100Input: document.getElementById("form-p100-input"),
  formP200Input: document.getElementById("form-p200-input"),
  formP500Input: document.getElementById("form-p500-input"),
  formP1000Input: document.getElementById("form-p1000-input"),
  labelKg100: document.getElementById("label-kg-100"),
  labelKg200: document.getElementById("label-kg-200"),
  labelKg500: document.getElementById("label-kg-500"),
  labelKg1000: document.getElementById("label-kg-1000"),
  formWastageInput: document.getElementById("form-wastage-input"),
  calcSummaryText: document.getElementById("calc-summary-text"),
  calcClosingVal: document.getElementById("calc-closing-val"),
  formPackedByInput: document.getElementById("form-packed-by-input"),
  formCheckedByInput: document.getElementById("form-checked-by-input"),
  formRemarksInput: document.getElementById("form-remarks-input"),

  // History Modal
  modalHistoryOverlay: document.getElementById("modal-history-overlay"),
  historyModalProductTitle: document.getElementById("history-modal-product-title"),
  historyModalBatchPill: document.getElementById("history-modal-batch-pill"),
  historyModalTbody: document.getElementById("history-modal-tbody"),
  modalHistoryClose: document.getElementById("modal-history-close"),
  btnExportSingleProductExcel: document.getElementById("btn-export-single-product-excel"),

  // Toast Container
  toastContainer: document.getElementById("toast-container"),
};

// ── DATE UTILITIES ──
function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDateStr(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  dateObj.setDate(dateObj.getDate() + deltaDays);
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[dateObj.getMonth()]} ${y} • ${days[dateObj.getDay()]}`;
}

function updateDateDisplay() {
  dom.dateText.textContent = formatDisplayDate(currentDate);
  dom.datePickerHidden.value = currentDate;
}

// ── CALCULATION LOGIC ──
/**
 * Packaging KG math:
 * Total Packed (KG) = (p100 * 0.1) + (p200 * 0.2) + (p500 * 0.5) + (p1000 * 1.0)
 * Closing Balance (KG) = Opening + Inward - Total Packed - Wastage
 */
function calculateMetrics({ opening, inward, p100, p200, p500, p1000, wastage }) {
  const op = Number(opening) || 0;
  const inw = Number(inward) || 0;
  const q100 = Number(p100) || 0;
  const q200 = Number(p200) || 0;
  const q500 = Number(p500) || 0;
  const q1000 = Number(p1000) || 0;
  const wst = Number(wastage) || 0;

  const kg100 = q100 * 0.1;
  const kg200 = q200 * 0.2;
  const kg500 = q500 * 0.5;
  const kg1000 = q1000 * 1.0;

  const totalPackedKg = kg100 + kg200 + kg500 + kg1000;
  const totalPcs = q100 + q200 + q500 + q1000;
  const closingBalance = Math.round((op + inw - totalPackedKg - wst) * 100) / 100;

  return {
    opening: op,
    inward: inw,
    p100: q100,
    p200: q200,
    p500: q500,
    p1000: q1000,
    kg100: Math.round(kg100 * 100) / 100,
    kg200: Math.round(kg200 * 100) / 100,
    kg500: Math.round(kg500 * 100) / 100,
    kg1000: Math.round(kg1000 * 100) / 100,
    totalPackedKg: Math.round(totalPackedKg * 100) / 100,
    totalPcs,
    wastage: wst,
    closingBalance,
  };
}

// ── GET CURRENT PRODUCT STATUS FOR DATE ──
function getProductStatusForDate(productId, dateStr) {
  const prod = getProductById(productId);
  const existingEntry = allEntries.find((e) => e.productId === productId && e.date === dateStr);

  if (existingEntry) {
    return {
      product: prod,
      hasEntry: true,
      entry: existingEntry,
      opening: Number(existingEntry.openingBalance) || 0,
      inward: Number(existingEntry.inwardQty) || 0,
      p100: Number(existingEntry.p100) || 0,
      p200: Number(existingEntry.p200) || 0,
      p500: Number(existingEntry.p500) || 0,
      p1000: Number(existingEntry.p1000) || 0,
      totalPacked: Number(existingEntry.totalPacked) || 0,
      wastage: Number(existingEntry.wastage) || 0,
      closing: Number(existingEntry.closingBalance) || 0,
      batchNo: existingEntry.batchNo || prod.batchCode,
      source: existingEntry.source || "Cold Storage",
      packedBy: existingEntry.packedBy || "-",
      checkedBy: existingEntry.checkedBy || "-",
    };
  }

  // No entry yet on this date: auto carry-forward from previous closing!
  const cf = getAutoCarryForward(allEntries, productId, dateStr);
  const opening = cf.openingBalance;
  return {
    product: prod,
    hasEntry: false,
    entry: null,
    opening,
    inward: 0,
    p100: 0,
    p200: 0,
    p500: 0,
    p1000: 0,
    totalPacked: 0,
    wastage: 0,
    closing: opening,
    batchNo: prod.batchCode,
    source: "Cold Storage",
    packedBy: "-",
    checkedBy: "-",
    carriedFromDate: cf.fromDate,
  };
}

// ── RENDER DASHBOARD (KPIS + CARDS) ──
function renderDashboard() {
  let todayInwardTotal = 0;
  let todayPackedTotal = 0;
  let todayPcsTotal = 0;
  let todayWastageTotal = 0;
  let totalClosingSum = 0;

  // Filter products by category & search
  const filteredProducts = DUKAN_PRODUCTS.filter((p) => {
    const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
    const matchesSearch =
      searchQuery === "" ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.batchCode.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Calculate totals and render table rows
  const rowsHtml = filteredProducts.map((p, idx) => {
    const status = getProductStatusForDate(p.id, currentDate);

    // Sum overall totals across all 28 products for this date
    if (status.hasEntry) {
      todayInwardTotal += status.inward;
      todayPackedTotal += status.totalPacked;
      todayPcsTotal += status.p100 + status.p200 + status.p500 + status.p1000;
      todayWastageTotal += status.wastage;
    }
    totalClosingSum += status.closing;

    const hasPacking = status.p100 > 0 || status.p200 > 0 || status.p500 > 0 || status.p1000 > 0;
    const packBreakdownStr = hasPacking
      ? [
          status.p100 > 0 ? `100g:${status.p100}` : "",
          status.p200 > 0 ? `200g:${status.p200}` : "",
          status.p500 > 0 ? `500g:${status.p500}` : "",
          status.p1000 > 0 ? `1kg:${status.p1000}` : ""
        ].filter(Boolean).join(" • ")
      : "";

    return `
      <tr>
        <td style="color:#94A3B8; font-weight:600;">${idx + 1}</td>
        <td style="font-weight:700; color:var(--text-main); font-size:13px;">${p.name}</td>
        <td><span class="batch-pill">${status.batchNo}</span></td>
        <td>
          <span class="category-tag" style="background:${p.color}15; color:${p.color}; border:1px solid ${p.color}40;">
            ${p.category}
          </span>
        </td>
        <td class="num-cell" style="font-weight:600;">${status.opening.toFixed(2)}</td>
        <td class="num-cell" style="color:${status.inward > 0 ? "#2563EB" : "inherit"}; font-weight:${status.inward > 0 ? "700" : "500"};">
          ${status.inward > 0 ? "+" : ""}${status.inward.toFixed(2)}
        </td>
        <td class="num-cell" style="color:${status.totalPacked > 0 ? "#059669" : "inherit"}; font-weight:${status.totalPacked > 0 ? "700" : "500"};">
          <div>${status.totalPacked > 0 ? "-" : ""}${status.totalPacked.toFixed(2)}</div>
          ${packBreakdownStr ? `<div style="font-size:10.5px; color:#16A34A; font-weight:600;">${packBreakdownStr}</div>` : ""}
        </td>
        <td class="num-cell" style="color:${status.wastage > 0 ? "#DC2626" : "inherit"};">
          ${status.wastage.toFixed(2)}
        </td>
        <td class="num-cell closing-highlight" style="font-size:14px; font-weight:800;">
          ${status.closing.toFixed(2)}
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-primary btn-sm btn-row-pack" data-product-id="${p.id}">
              ${status.hasEntry ? "Edit Entry" : "+ Log Packing"}
            </button>
            <button class="btn btn-secondary btn-sm btn-row-history" data-product-id="${p.id}" title="View chronological batches">
              History
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  dom.dashboardStockTbody.innerHTML = rowsHtml || `
    <tr>
      <td colspan="10" style="text-align:center; padding:36px; color:#94A3B8;">
        No products matching "${searchQuery}"
      </td>
    </tr>
  `;

  // Update summary strip displays
  dom.kpiTodayInward.textContent = `${todayInwardTotal.toFixed(2)} KG`;
  dom.kpiTodayPacked.textContent = `${todayPackedTotal.toFixed(2)} KG`;
  dom.kpiTodayPcs.textContent = `(${todayPcsTotal} pcs)`;
  dom.kpiTodayWastage.textContent = `${todayWastageTotal.toFixed(2)} KG`;
  dom.kpiTotalClosing.textContent = `${totalClosingSum.toFixed(2)} KG`;

  // Attach row button listeners
  dom.dashboardStockTbody.querySelectorAll(".btn-row-pack").forEach((btn) => {
    btn.addEventListener("click", () => openEntryModal(btn.dataset.productId));
  });
  dom.dashboardStockTbody.querySelectorAll(".btn-row-history").forEach((btn) => {
    btn.addEventListener("click", () => openHistoryModal(btn.dataset.productId));
  });
}

// ── RENDER MASTER REGISTER (EXCEL SHEET VIEW) ──
function renderMasterLedger() {
  const prodFilter = dom.ledgerFilterProduct.value;
  const dateFilter = dom.ledgerFilterDate.value;

  let filtered = [...allEntries];

  if (prodFilter !== "ALL") {
    filtered = filtered.filter((e) => e.productId === prodFilter);
  }

  if (dateFilter === "SELECTED") {
    filtered = filtered.filter((e) => e.date === currentDate);
  }

  if (!filtered.length) {
    dom.masterLedgerTbody.innerHTML = `
      <tr>
        <td colspan="18" style="text-align:center; padding:36px; color:#94A3B8;">
          No entries recorded for this selection. Click <strong>+ New Packaging Entry</strong> above to log stock.
        </td>
      </tr>
    `;
    return;
  }

  const rowsHtml = filtered.map((e, idx) => {
    const prod = getProductById(e.productId);
    const prodName = prod ? prod.name : e.productName || "Unknown Product";
    const batchCode = e.batchNo || (prod ? prod.batchCode : "-");

    return `
      <tr>
        <td style="color:#94A3B8; font-weight:600;">${idx + 1}</td>
        <td style="font-weight:700;">${e.date}</td>
        <td>
          <div style="font-weight:700; color:var(--text-main);">${prodName}</div>
          <span class="batch-pill" style="font-size:10px;">${batchCode}</span>
        </td>
        <td class="num-cell">${Number(e.openingBalance || 0).toFixed(2)}</td>
        <td><span style="font-size:11px; font-weight:600; color:#2563EB;">${e.source || "-"}</span></td>
        <td style="font-family:monospace; font-size:12px;">${e.batchNo || "-"}</td>
        <td class="num-cell" style="color:#2563EB; font-weight:700;">+${Number(e.inwardQty || 0).toFixed(2)}</td>
        <td class="num-cell">${e.p100 || 0}</td>
        <td class="num-cell">${e.p200 || 0}</td>
        <td class="num-cell">${e.p500 || 0}</td>
        <td class="num-cell">${e.p1000 || 0}</td>
        <td class="num-cell" style="color:#059669; font-weight:700;">-${Number(e.totalPacked || 0).toFixed(2)}</td>
        <td class="num-cell" style="color:#DC2626;">${Number(e.wastage || 0).toFixed(2)}</td>
        <td class="num-cell closing-highlight">${Number(e.closingBalance || 0).toFixed(2)}</td>
        <td style="font-size:12px; font-weight:600;">${e.packedBy || "-"}</td>
        <td style="font-size:12px; font-weight:600;">${e.checkedBy || "-"}</td>
        <td style="font-size:11.5px; color:#64748B; max-width:160px; overflow:hidden; text-overflow:ellipsis;" title="${e.remarks || ""}">
          ${e.remarks || "-"}
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm btn-edit-entry" data-id="${e.id}" style="padding:4px 8px;" title="Edit">
              ✏️
            </button>
            <button class="btn btn-secondary btn-sm btn-del-entry" data-id="${e.id}" style="padding:4px 8px; color:#DC2626;" title="Delete">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  dom.masterLedgerTbody.innerHTML = rowsHtml;

  // Attach row listeners
  dom.masterLedgerTbody.querySelectorAll(".btn-edit-entry").forEach((btn) => {
    btn.addEventListener("click", () => {
      const entry = allEntries.find((x) => x.id === btn.dataset.id);
      if (entry) openEntryModal(entry.productId, entry);
    });
  });

  dom.masterLedgerTbody.querySelectorAll(".btn-del-entry").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("Delete this packing entry? This will permanently remove the record from Firebase.")) {
        try {
          await deleteEntry(btn.dataset.id);
          showToast("Entry deleted successfully", "success");
        } catch (err) {
          showToast("Failed to delete entry: " + err.message, "error");
        }
      }
    });
  });
}

// ── RENDER PRODUCTS MASTER CATALOG ──
function renderProductsCatalog() {
  const rowsHtml = DUKAN_PRODUCTS.map((p, idx) => {
    const prodEntries = allEntries.filter((e) => e.productId === p.id);
    const totalInward = prodEntries.reduce((sum, e) => sum + (Number(e.inwardQty) || 0), 0);
    const totalPacked = prodEntries.reduce((sum, e) => sum + (Number(e.totalPacked) || 0), 0);
    const totalWastage = prodEntries.reduce((sum, e) => sum + (Number(e.wastage) || 0), 0);

    // Latest closing balance
    const currentStatus = getProductStatusForDate(p.id, currentDate);
    const currentStock = currentStatus.closing;

    return `
      <tr>
        <td style="color:#94A3B8; font-weight:600;">${idx + 1}</td>
        <td style="font-weight:700;">${p.name}</td>
        <td><span class="batch-pill">${p.batchCode}</span></td>
        <td>
          <span class="category-tag" style="background:${p.color}15; color:${p.color}; border:1px solid ${p.color}40;">
            ${p.category}
          </span>
        </td>
        <td class="num-cell" style="color:#2563EB; font-weight:700;">${totalInward.toFixed(2)}</td>
        <td class="num-cell" style="color:#059669; font-weight:700;">${totalPacked.toFixed(2)}</td>
        <td class="num-cell" style="color:#DC2626;">${totalWastage.toFixed(2)}</td>
        <td class="num-cell closing-highlight" style="font-size:14px;">${currentStock.toFixed(2)}</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-primary btn-sm btn-cat-pack" data-id="${p.id}">+ Entry</button>
            <button class="btn btn-secondary btn-sm btn-cat-history" data-id="${p.id}">Log</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  dom.productsCatalogTbody.innerHTML = rowsHtml;

  dom.productsCatalogTbody.querySelectorAll(".btn-cat-pack").forEach((btn) => {
    btn.addEventListener("click", () => openEntryModal(btn.dataset.id));
  });
  dom.productsCatalogTbody.querySelectorAll(".btn-cat-history").forEach((btn) => {
    btn.addEventListener("click", () => openHistoryModal(btn.dataset.id));
  });
}

// ── MODAL: OPEN ENTRY FORM ──
function openEntryModal(preselectedProductId = null, existingEntry = null) {
  dom.entryForm.reset();
  isOpeningOverridden = false;
  dom.formOpeningInput.readOnly = true;
  dom.btnToggleOverrideOpening.textContent = "Override";

  if (existingEntry) {
    editingEntryId = existingEntry.id;
    dom.entryId.value = existingEntry.id;
    dom.modalEntryTitle.textContent = "Edit Daily Packing Entry";
    dom.formProductSelect.value = existingEntry.productId;
    dom.formDateInput.value = existingEntry.date;
    dom.formOpeningInput.value = existingEntry.openingBalance;
    dom.cfStatusLabel.textContent = "Recorded opening stock for this date";
    dom.formSourceSelect.value = existingEntry.source || "Cold Storage";
    dom.formBatchInput.value = existingEntry.batchNo || "";
    dom.formInwardInput.value = existingEntry.inwardQty || 0;
    dom.formP100Input.value = existingEntry.p100 || 0;
    dom.formP200Input.value = existingEntry.p200 || 0;
    dom.formP500Input.value = existingEntry.p500 || 0;
    dom.formP1000Input.value = existingEntry.p1000 || 0;
    dom.formWastageInput.value = existingEntry.wastage || 0;
    dom.formPackedByInput.value = existingEntry.packedBy || "";
    dom.formCheckedByInput.value = existingEntry.checkedBy || "";
    dom.formRemarksInput.value = existingEntry.remarks || "";
  } else {
    editingEntryId = null;
    dom.entryId.value = "";
    dom.modalEntryTitle.textContent = "Add Daily Packing Entry";
    dom.formDateInput.value = currentDate;

    if (preselectedProductId) {
      dom.formProductSelect.value = preselectedProductId;
      handleProductOrDateChange();
    } else {
      dom.formProductSelect.value = DUKAN_PRODUCTS[0].id;
      handleProductOrDateChange();
    }
  }

  updateLiveFormCalculation();
  dom.modalEntryOverlay.classList.add("active");
}

function closeEntryModal() {
  dom.modalEntryOverlay.classList.remove("active");
  editingEntryId = null;
}

// Handle product or date change in modal form to fetch auto carry-forward
function handleProductOrDateChange() {
  if (editingEntryId) return; // Keep existing entry opening if editing

  const productId = dom.formProductSelect.value;
  const targetDate = dom.formDateInput.value || currentDate;
  const prod = getProductById(productId);

  if (prod) {
    dom.formBatchInput.value = prod.batchCode;
  }

  if (!isOpeningOverridden) {
    const cf = getAutoCarryForward(allEntries, productId, targetDate);
    dom.formOpeningInput.value = cf.openingBalance.toFixed(2);
    if (cf.fromDate) {
      dom.cfStatusLabel.textContent = `🔄 Auto-carried forward from ${cf.fromDate} closing stock (${cf.openingBalance.toFixed(2)} KG)`;
    } else {
      dom.cfStatusLabel.textContent = `🌱 Initial opening stock (0.00 KG) - click 'Change' to edit`;
    }
  }

  updateLiveFormCalculation();
}

// Real-time calculation listener in form
function updateLiveFormCalculation() {
  const opening = dom.formOpeningInput.value;
  const inward = dom.formInwardInput.value;
  const p100 = dom.formP100Input.value;
  const p200 = dom.formP200Input.value;
  const p500 = dom.formP500Input.value;
  const p1000 = dom.formP1000Input.value;
  const wastage = dom.formWastageInput.value;

  const res = calculateMetrics({ opening, inward, p100, p200, p500, p1000, wastage });

  dom.labelKg100.textContent = `= ${res.kg100.toFixed(2)} KG`;
  dom.labelKg200.textContent = `= ${res.kg200.toFixed(2)} KG`;
  dom.labelKg500.textContent = `= ${res.kg500.toFixed(2)} KG`;
  dom.labelKg1000.textContent = `= ${res.kg1000.toFixed(2)} KG`;

  dom.calcSummaryText.textContent = `(${res.opening} + ${res.inward}) − ${res.totalPackedKg} − ${res.wastage} = ${res.closingBalance.toFixed(2)} KG`;
  dom.calcClosingVal.textContent = `${res.closingBalance.toFixed(2)} KG`;

  if (res.closingBalance < 0) {
    dom.calcClosingVal.style.color = "#DC2626";
  } else {
    dom.calcClosingVal.style.color = "var(--brand-primary)";
  }
}

// ── MODAL: PRODUCT HISTORY / DRAWER ──
function openHistoryModal(productId) {
  historyProductId = productId;
  const prod = getProductById(productId);
  if (!prod) return;

  dom.historyModalProductTitle.textContent = prod.name;
  dom.historyModalBatchPill.textContent = prod.batchCode;

  const prodEntries = allEntries.filter((e) => e.productId === productId);

  if (!prodEntries.length) {
    dom.historyModalTbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align:center; padding:30px; color:#94A3B8;">
          No history entries logged for ${prod.name} yet.
        </td>
      </tr>
    `;
  } else {
    const rowsHtml = prodEntries.map((e) => `
      <tr>
        <td style="font-weight:700;">${e.date}</td>
        <td><span style="font-size:11px; font-weight:600; color:#2563EB;">${e.source || "-"}</span></td>
        <td style="font-family:monospace; font-size:12px;">${e.batchNo || "-"}</td>
        <td class="num-cell">${Number(e.openingBalance || 0).toFixed(2)}</td>
        <td class="num-cell" style="color:#2563EB; font-weight:700;">+${Number(e.inwardQty || 0).toFixed(2)}</td>
        <td class="num-cell" style="color:#059669; font-weight:700;">-${Number(e.totalPacked || 0).toFixed(2)}</td>
        <td class="num-cell" style="color:#DC2626;">${Number(e.wastage || 0).toFixed(2)}</td>
        <td class="num-cell closing-highlight">${Number(e.closingBalance || 0).toFixed(2)}</td>
        <td style="font-size:12px;">${e.packedBy || "-"}</td>
        <td style="font-size:12px;">${e.checkedBy || "-"}</td>
        <td>
          <button class="btn btn-secondary btn-sm btn-hist-edit" data-id="${e.id}" style="padding:3px 7px;">✏️</button>
        </td>
      </tr>
    `).join("");

    dom.historyModalTbody.innerHTML = rowsHtml;

    dom.historyModalTbody.querySelectorAll(".btn-hist-edit").forEach((btn) => {
      btn.addEventListener("click", () => {
        const entry = allEntries.find((x) => x.id === btn.dataset.id);
        if (entry) {
          closeHistoryModal();
          openEntryModal(entry.productId, entry);
        }
      });
    });
  }

  dom.modalHistoryOverlay.classList.add("active");
}

function closeHistoryModal() {
  dom.modalHistoryOverlay.classList.remove("active");
  historyProductId = null;
}

// ── EXCEL EXPORT FUNCTIONS (SheetJS) ──
function exportLedgerToExcel() {
  if (typeof XLSX === "undefined") {
    alert("Excel library is loading, please try again in a few seconds.");
    return;
  }

  const prodFilter = dom.ledgerFilterProduct.value;
  const dateFilter = dom.ledgerFilterDate.value;

  let filtered = [...allEntries];
  if (prodFilter !== "ALL") filtered = filtered.filter((e) => e.productId === prodFilter);
  if (dateFilter === "SELECTED") filtered = filtered.filter((e) => e.date === currentDate);

  if (!filtered.length) {
    showToast("No records to export for current filter", "error");
    return;
  }

  // Format data exactly per client's 15 column specification
  const sheetData = filtered.map((e, idx) => {
    const prod = getProductById(e.productId);
    return {
      "S.No": idx + 1,
      "Date": e.date,
      "Product Name": prod ? prod.name : e.productName,
      "Opening Balance / Carry Forward (KG)": Number(e.openingBalance || 0),
      "Source (Cold Storage / Market)": e.source || "Cold Storage",
      "Supplier Batch / Lot No.": e.batchNo || (prod ? prod.batchCode : ""),
      "Inward Quantity (KG)": Number(e.inwardQty || 0),
      "100g Packing (Pcs)": Number(e.p100 || 0),
      "200g Packing (Pcs)": Number(e.p200 || 0),
      "500g Packing (Pcs)": Number(e.p500 || 0),
      "1kg Packing (Pcs)": Number(e.p1000 || 0),
      "Total Packed (KG)": Number(e.totalPacked || 0),
      "Wastage (KG)": Number(e.wastage || 0),
      "Closing Balance (KG)": Number(e.closingBalance || 0),
      "Packed By – Name & Signature": e.packedBy || "",
      "Checked By – Name & Signature": e.checkedBy || "",
      "Remarks": e.remarks || ""
    };
  });

  const ws = XLSX.utils.json_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dukan_Stock_Register");

  const fileName = `Dukan_Stock_Register_${currentDate}.xlsx`;
  XLSX.writeFile(wb, fileName);
  showToast(`Excel file downloaded: ${fileName}`, "success");
}

function exportSingleProductExcel() {
  if (!historyProductId) return;
  const prod = getProductById(historyProductId);
  const prodEntries = allEntries.filter((e) => e.productId === historyProductId);

  if (!prodEntries.length) {
    showToast("No records to export for this product", "error");
    return;
  }

  const sheetData = prodEntries.map((e, idx) => ({
    "S.No": idx + 1,
    "Date": e.date,
    "Product Name": prod ? prod.name : "",
    "Opening Balance (KG)": Number(e.openingBalance || 0),
    "Source": e.source || "",
    "Supplier Batch / Lot": e.batchNo || "",
    "Inward (KG)": Number(e.inwardQty || 0),
    "100g (Pcs)": Number(e.p100 || 0),
    "200g (Pcs)": Number(e.p200 || 0),
    "500g (Pcs)": Number(e.p500 || 0),
    "1kg (Pcs)": Number(e.p1000 || 0),
    "Total Packed (KG)": Number(e.totalPacked || 0),
    "Wastage (KG)": Number(e.wastage || 0),
    "Closing Balance (KG)": Number(e.closingBalance || 0),
    "Packed By": e.packedBy || "",
    "Checked By": e.checkedBy || "",
    "Remarks": e.remarks || ""
  }));

  const ws = XLSX.utils.json_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, prod.batchCode || "Product_Log");

  const fileName = `${prod.batchCode}_Stock_Log_${currentDate}.xlsx`;
  XLSX.writeFile(wb, fileName);
  showToast(`Downloaded: ${fileName}`, "success");
}

function exportProductsCatalogExcel() {
  const sheetData = DUKAN_PRODUCTS.map((p, idx) => {
    const prodEntries = allEntries.filter((e) => e.productId === p.id);
    const totalInward = prodEntries.reduce((sum, e) => sum + (Number(e.inwardQty) || 0), 0);
    const totalPacked = prodEntries.reduce((sum, e) => sum + (Number(e.totalPacked) || 0), 0);
    const totalWastage = prodEntries.reduce((sum, e) => sum + (Number(e.wastage) || 0), 0);
    const status = getProductStatusForDate(p.id, currentDate);

    return {
      "S.No": idx + 1,
      "Product Name": p.name,
      "Batch Code / Lot No": p.batchCode,
      "Category": p.category,
      "Total Inward (KG)": totalInward,
      "Total Packed (KG)": totalPacked,
      "Total Wastage (KG)": totalWastage,
      "Current Closing Stock (KG)": status.closing
    };
  });

  const ws = XLSX.utils.json_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dukan_Catalog");
  XLSX.writeFile(wb, `Dukan_Products_Inventory_${currentDate}.xlsx`);
  showToast("Catalog exported to Excel", "success");
}

// ── TOAST HELPER ──
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === "success" ? "✓" : type === "error" ? "✕" : "ℹ"}</span>
    <span>${message}</span>
  `;
  dom.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// ── NAVIGATION CONTROLLER ──
function switchView(viewName) {
  currentView = viewName;
  Object.keys(dom.views).forEach((v) => {
    dom.views[v].style.display = v === viewName ? "block" : "none";
  });

  dom.navItems.forEach((item) => {
    if (item.dataset.view === viewName) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  if (viewName === "dashboard") {
    dom.pageTitle.textContent = "Daily Stock Dashboard";
    renderDashboard();
  } else if (viewName === "ledger") {
    dom.pageTitle.textContent = "Daily Packing Register (Sheet)";
    renderMasterLedger();
  } else if (viewName === "products") {
    dom.pageTitle.textContent = "All 28 Spices Master Summary";
    renderProductsCatalog();
  }
}

// ── INITIALIZATION & EVENT LISTENERS ──
function init() {
  // Populate Product Select Dropdowns
  const optionsHtml = DUKAN_PRODUCTS.map(
    (p) => `<option value="${p.id}">${p.name} (${p.batchCode})</option>`
  ).join("");
  dom.formProductSelect.innerHTML = `<option value="">Select a spice product...</option>` + optionsHtml;
  dom.ledgerFilterProduct.innerHTML = `<option value="ALL">All Spices (28)</option>` + optionsHtml;

  // Render Category Chips
  dom.categoryChipsWrap.innerHTML = CATEGORIES.map(
    (cat) => `<button class="chip-btn ${cat === selectedCategory ? "active" : ""}" data-category="${cat}">${cat}</button>`
  ).join("");

  dom.categoryChipsWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip-btn");
    if (!btn) return;
    selectedCategory = btn.dataset.category;
    dom.categoryChipsWrap.querySelectorAll(".chip-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderDashboard();
  });

  // Search input
  dom.searchProductsInput.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    renderDashboard();
  });

  // Navigation click
  dom.navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      switchView(item.dataset.view);
    });
  });

  // Date Navigation
  updateDateDisplay();
  dom.btnPrevDay.addEventListener("click", () => {
    currentDate = shiftDateStr(currentDate, -1);
    updateDateDisplay();
    renderDashboard();
    renderMasterLedger();
  });

  dom.btnNextDay.addEventListener("click", () => {
    currentDate = shiftDateStr(currentDate, 1);
    updateDateDisplay();
    renderDashboard();
    renderMasterLedger();
  });

  dom.btnJumpToday.addEventListener("click", () => {
    currentDate = getTodayStr();
    updateDateDisplay();
    renderDashboard();
    renderMasterLedger();
  });

  dom.dateDisplay.addEventListener("click", () => {
    dom.datePickerHidden.showPicker?.();
  });

  dom.datePickerHidden.addEventListener("change", (e) => {
    if (e.target.value) {
      currentDate = e.target.value;
      updateDateDisplay();
      renderDashboard();
      renderMasterLedger();
    }
  });

  // Master Ledger Filter changes
  dom.ledgerFilterProduct.addEventListener("change", renderMasterLedger);
  dom.ledgerFilterDate.addEventListener("change", renderMasterLedger);

  // Topbar action buttons
  dom.btnOpenNewEntry.addEventListener("click", () => openEntryModal());
  dom.mobQuickAddBtn.addEventListener("click", () => openEntryModal());
  dom.btnExportExcel.addEventListener("click", exportLedgerToExcel);
  dom.btnExportLedgerExcel.addEventListener("click", exportLedgerToExcel);
  dom.btnExportProductsCatalog.addEventListener("click", exportProductsCatalogExcel);
  dom.btnExportSingleProductExcel.addEventListener("click", exportSingleProductExcel);

  // Modal Close buttons
  dom.modalEntryClose.addEventListener("click", closeEntryModal);
  dom.btnCancelEntry.addEventListener("click", closeEntryModal);
  dom.modalHistoryClose.addEventListener("click", closeHistoryModal);

  // Close modals on clicking overlay outside card
  dom.modalEntryOverlay.addEventListener("click", (e) => {
    if (e.target === dom.modalEntryOverlay) closeEntryModal();
  });
  dom.modalHistoryOverlay.addEventListener("click", (e) => {
    if (e.target === dom.modalHistoryOverlay) closeHistoryModal();
  });

  // Live calculation form listeners
  dom.formProductSelect.addEventListener("change", handleProductOrDateChange);
  dom.formDateInput.addEventListener("change", handleProductOrDateChange);

  [
    dom.formOpeningInput,
    dom.formInwardInput,
    dom.formP100Input,
    dom.formP200Input,
    dom.formP500Input,
    dom.formP1000Input,
    dom.formWastageInput,
  ].forEach((input) => {
    input.addEventListener("input", updateLiveFormCalculation);
  });

  // Opening Balance manual override toggle
  dom.btnToggleOverrideOpening.addEventListener("click", () => {
    isOpeningOverridden = !isOpeningOverridden;
    dom.formOpeningInput.readOnly = !isOpeningOverridden;
    if (isOpeningOverridden) {
      dom.formOpeningInput.focus();
      dom.btnToggleOverrideOpening.textContent = "Lock";
      dom.cfStatusLabel.textContent = "⚠️ Manual opening stock edit enabled";
    } else {
      dom.btnToggleOverrideOpening.textContent = "Change";
      handleProductOrDateChange();
    }
  });

  // Form Submission
  dom.entryForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const productId = dom.formProductSelect.value;
    const prod = getProductById(productId);
    if (!prod) {
      alert("Please select a valid spice product.");
      return;
    }

    const dateVal = dom.formDateInput.value;
    const openingVal = Number(dom.formOpeningInput.value) || 0;
    const sourceVal = dom.formSourceSelect.value;
    const batchVal = dom.formBatchInput.value.trim() || prod.batchCode;
    const inwardVal = Number(dom.formInwardInput.value) || 0;
    const p100Val = Number(dom.formP100Input.value) || 0;
    const p200Val = Number(dom.formP200Input.value) || 0;
    const p500Val = Number(dom.formP500Input.value) || 0;
    const p1000Val = Number(dom.formP1000Input.value) || 0;
    const wastageVal = Number(dom.formWastageInput.value) || 0;

    const metrics = calculateMetrics({
      opening: openingVal,
      inward: inwardVal,
      p100: p100Val,
      p200: p200Val,
      p500: p500Val,
      p1000: p1000Val,
      wastage: wastageVal,
    });

    const entryData = {
      productId,
      productName: prod.name,
      date: dateVal,
      openingBalance: metrics.opening,
      source: sourceVal,
      batchNo: batchVal,
      inwardQty: metrics.inward,
      p100: metrics.p100,
      p200: metrics.p200,
      p500: metrics.p500,
      p1000: metrics.p1000,
      totalPacked: metrics.totalPackedKg,
      totalPcs: metrics.totalPcs,
      wastage: metrics.wastage,
      closingBalance: metrics.closingBalance,
      packedBy: dom.formPackedByInput.value.trim(),
      checkedBy: dom.formCheckedByInput.value.trim(),
      remarks: dom.formRemarksInput.value.trim(),
      timestamp: Date.now(),
    };

    if (editingEntryId) {
      entryData.id = editingEntryId;
    }

    try {
      dom.entryForm.querySelector('button[type="submit"]').disabled = true;
      dom.entryForm.querySelector('button[type="submit"]').textContent = "Saving...";

      await saveEntry(entryData);
      showToast(`Saved entry for ${prod.name}! Closing: ${metrics.closingBalance.toFixed(2)} KG`, "success");
      closeEntryModal();
    } catch (err) {
      console.error(err);
      showToast("Error saving to Firebase: " + err.message, "error");
    } finally {
      dom.entryForm.querySelector('button[type="submit"]').disabled = false;
      dom.entryForm.querySelector('button[type="submit"]').textContent = "Save Entry to Cloud";
    }
  });

  // Start real-time Firestore synchronization
  subscribeToEntries((entries) => {
    allEntries = entries;
    renderDashboard();
    renderMasterLedger();
    renderProductsCatalog();
    if (historyProductId) {
      openHistoryModal(historyProductId);
    }
  });
}

// Boot app on DOM ready
document.addEventListener("DOMContentLoaded", init);
