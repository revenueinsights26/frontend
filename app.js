console.log("app.js loaded");

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const API = window.location.hostname === 'localhost' 
  ? "http://localhost:8000" 
  : "https://backend-x5sw.onrender.com";

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────
let allSnapshots = [];
let allDailyPerf = [];
let allDailyComp = [];
let monthKeys = [];
let currentMonthIndex = 0;
let occChart = null;
let adrChart = null;
let dowOccChart = null;
let dowAdrChart = null;

// ─────────────────────────────────────────────
// On load
// ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("ownerToken");
  if (!token) { 
    window.location.href = "index.html"; 
    return; 
  }

  const savedHotel = localStorage.getItem("hotelId");
  if (savedHotel) {
    document.getElementById("hotelId").value = savedHotel;
  }

  document.getElementById("btnLoad").addEventListener("click", loadDashboard);
  document.getElementById("btnLogout").addEventListener("click", logout);
  document.getElementById("btnUpload").addEventListener("click", () => {
    window.location.href = "upload.html";
  });
  document.getElementById("btnRateIntel").addEventListener("click", () => {
    window.location.href = "rate-intelligence.html";
  });

  document.getElementById("prevMonth").addEventListener("click", () => {
    if (currentMonthIndex > 0) { 
      currentMonthIndex--; 
      renderMonth(); 
    }
  });
  
  document.getElementById("nextMonth").addEventListener("click", () => {
    if (currentMonthIndex < monthKeys.length - 1) { 
      currentMonthIndex++; 
      renderMonth(); 
    }
  });

  // Auto-load if we have a hotel ID
  const hotelId = localStorage.getItem("hotelId");
  if (hotelId) {
    document.getElementById("hotelId").value = hotelId;
    loadDashboard(true);
  }
});

// ─────────────────────────────────────────────
// Load dashboard
// ─────────────────────────────────────────────
function loadDashboard(silent = false) {
  const token = localStorage.getItem("ownerToken");
  let hotelId = document.getElementById("hotelId").value.trim();
  
  if (!hotelId) { 
    if (!silent) alert("Enter a Hotel ID first."); 
    return; 
  }
  
  localStorage.setItem("hotelId", hotelId);

  const kpisContainer = document.getElementById("kpis");
  if (kpisContainer) {
    kpisContainer.innerHTML = `<div class="card" style="grid-column:1/-1; text-align:center; padding:40px;">📊 Loading dashboard data...</div>`;
    kpisContainer.hidden = false;
  }

  console.log("Fetching snapshots for:", hotelId);
  console.log("API URL:", API);

  fetch(API + "/hotel_dashboard_history/" + hotelId, {
    headers: { "X-Owner-Token": token }
  })
  .then(res => { 
    console.log("Response status:", res.status);
    if (!res.ok) throw new Error("HTTP " + res.status); 
    return res.json(); 
  })
  .then(data => {
    console.log("Snapshots received:", data);
    if (!Array.isArray(data) || data.length === 0) {
      if (!silent) alert("No snapshots found for " + hotelId);
      return;
    }
    
    allSnapshots = data;
    const latestSnapshot = allSnapshots[allSnapshots.length - 1];
    console.log("Latest snapshot:", latestSnapshot);
    fetchDailyAndPrepare(latestSnapshot.snapshot_id);

    document.getElementById("kpis").hidden = false;
    document.getElementById("monthNav").hidden = false;
    document.getElementById("charts").hidden = false;
    document.getElementById("dowSection").hidden = false;
    document.getElementById("detailedSection").hidden = false;
  })
  .catch(err => { 
    console.error("Error:", err);
    if (!silent) alert("Could not load dashboard: " + err.message); 
  });
}

// ─────────────────────────────────────────────
// Fetch daily data
// ─────────────────────────────────────────────
function fetchDailyAndPrepare(snapshotId) {
  const token = localStorage.getItem("ownerToken");

  console.log("Fetching daily data for snapshot:", snapshotId);

  fetch(API + "/daily_by_snapshot/" + snapshotId, {
    headers: { "X-Owner-Token": token }
  })
  .then(res => { 
    if (!res.ok) throw new Error("HTTP " + res.status); 
    return res.json(); 
  })
  .then(data => {
    console.log("Daily data received:", data);
    allDailyPerf = data.performance || [];
    allDailyComp = data.compset || [];
    
    // Extract months from performance data
    const months = new Set();
    allDailyPerf.forEach(r => {
      if (r.stay_date && r.stay_date.length >= 7) {
        months.add(r.stay_date.substring(0, 7));
      }
    });
    monthKeys = Array.from(months).sort();
    console.log("Months found:", monthKeys);

    if (monthKeys.length === 0) { 
      console.warn("No dated daily data available.");
      return; 
    }

    currentMonthIndex = monthKeys.length - 1;
    renderMonth();
  })
  .catch(err => console.error("Daily fetch error:", err));
}

// ─────────────────────────────────────────────
// Render selected month
// ─────────────────────────────────────────────
function renderMonth() {
  if (monthKeys.length === 0) return;
  
  const monthKey = monthKeys[currentMonthIndex];
  document.getElementById("monthLabel").textContent = formatMonthLabel(monthKey);

  const monthPerf = allDailyPerf.filter(r => r.stay_date && r.stay_date.startsWith(monthKey));
  const monthComp = allDailyComp.filter(r => r.stay_date && r.stay_date.startsWith(monthKey));

  console.log("Rendering month:", monthKey);
  console.log("Performance rows:", monthPerf.length);
  console.log("Comp rows:", monthComp.length);

  if (monthPerf.length === 0) { 
    console.warn("No data for selected month.");
    return; 
  }

  const roomsAvailable = parseInt(localStorage.getItem("roomsAvailable") || "100", 10);
  const kpis = computeMonthlyKPIs(monthPerf, roomsAvailable);
  
  renderSimpleKPIs(kpis);
  drawSimpleTrendChart(monthPerf, roomsAvailable);
}

// ─────────────────────────────────────────────
// Simple KPI display
// ─────────────────────────────────────────────
function renderSimpleKPIs(kpis) {
  const cur = localStorage.getItem("currencySymbol") || "R";
  const container = document.getElementById("kpis");

  const html = `
    <div class="kpi">
      <div class="label">Occupancy</div>
      <div class="value">${kpis.occupancy.toFixed(1)}%</div>
    </div>
    <div class="kpi">
      <div class="label">ADR</div>
      <div class="value">${cur} ${fmt(kpis.adr)}</div>
    </div>
    <div class="kpi">
      <div class="label">RevPAR</div>
      <div class="value">${cur} ${fmt(kpis.revpar)}</div>
    </div>
    <div class="kpi">
      <div class="label">Room Revenue</div>
      <div class="value">${cur} ${fmt(kpis.revenue)}</div>
    </div>
  `;
  
  container.innerHTML = html;
}

// ─────────────────────────────────────────────
// Simple trend chart
// ─────────────────────────────────────────────
function drawSimpleTrendChart(perf, roomsAvailable) {
  const labels = perf.map(r => r.stay_date.substring(5, 10)); // MM-DD format
  const occData = perf.map(r => roomsAvailable > 0 ? (r.rooms_sold / roomsAvailable) * 100 : 0);

  const canvas = document.getElementById("occChart");
  if (!canvas) return;

  if (occChart) occChart.destroy();
  occChart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Occupancy %",
        data: occData,
        borderColor: "#2563eb",
        backgroundColor: "rgba(37,99,235,0.08)",
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "top" } },
      scales: { y: { title: { display: true, text: "Occupancy %" }, max: 100 } }
    }
  });
}

// ─────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────
function computeMonthlyKPIs(perf, roomsAvailable) {
  const days = perf.length;
  const roomsSold = perf.reduce((a, r) => a + r.rooms_sold, 0);
  const revenue = perf.reduce((a, r) => a + r.room_revenue, 0);
  const occupancy = days ? (roomsSold / (roomsAvailable * days)) * 100 : 0;
  const adr = roomsSold ? revenue / roomsSold : 0;
  const revpar = days ? revenue / (roomsAvailable * days) : 0;
  return { occupancy, adr, revpar, revenue };
}

function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split("-");
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleString("en-ZA", { month: "long", year: "numeric" });
}

function fmt(n) {
  return Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function logout() {
  localStorage.clear();
  window.location.href = "index.html";
}
