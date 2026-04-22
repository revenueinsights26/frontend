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

  fetch(API + "/hotel_dashboard_history/" + hotelId, {
    headers: { "X-Owner-Token": token }
  })
  .then(res => { 
    if (!res.ok) throw new Error("HTTP " + res.status); 
    return res.json(); 
  })
  .then(data => {
    if (!Array.isArray(data) || data.length === 0) {
      if (!silent) alert("No snapshots found for " + hotelId);
      return;
    }
    
    allSnapshots = data;
    const latestSnapshot = allSnapshots[allSnapshots.length - 1];
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

  fetch(API + "/daily_by_snapshot/" + snapshotId, {
    headers: { "X-Owner-Token": token }
  })
  .then(res => { 
    if (!res.ok) throw new Error("HTTP " + res.status); 
    return res.json(); 
  })
  .then(data => {
    allDailyPerf = data.performance || [];
    allDailyComp = data.compset || [];
    
    console.log("Daily performance data:", allDailyPerf);
    
    // Extract months from performance data - FIXED
    const months = new Set();
    allDailyPerf.forEach(r => {
      if (r.stay_date) {
        // Handle different date formats
        let dateStr = r.stay_date;
        if (dateStr.length >= 7) {
          const monthKey = dateStr.substring(0, 7);
          months.add(monthKey);
          console.log("Added month:", monthKey, "from date:", dateStr);
        }
      }
    });
    
    monthKeys = Array.from(months).sort();
    console.log("All months found:", monthKeys);

    if (monthKeys.length === 0) { 
      console.warn("No dated daily data available.");
      // Show error in UI
      const kpisContainer = document.getElementById("kpis");
      if (kpisContainer) {
        kpisContainer.innerHTML = `<div class="card" style="grid-column:1/-1; text-align:center; padding:40px; color:#b91c1c;">❌ No daily data found. Please upload data first.</div>`;
      }
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
  console.log("Performance rows for this month:", monthPerf.length);
  if (monthPerf.length > 0) {
    console.log("First row sample:", monthPerf[0]);
  }

  if (monthPerf.length === 0) { 
    console.warn("No data for selected month.");
    return; 
  }

  const roomsAvailable = parseInt(localStorage.getItem("roomsAvailable") || "94", 10);
  const kpis = computeMonthlyKPIs(monthPerf, roomsAvailable);
  
  renderMonthlyKPIs(kpis);
  drawTrendCharts(monthPerf, monthComp, roomsAvailable);
  drawDOWCharts(monthPerf, roomsAvailable);
}

// ─────────────────────────────────────────────
// Monthly KPIs
// ─────────────────────────────────────────────
function renderMonthlyKPIs(kpis) {
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
// Trend Charts
// ─────────────────────────────────────────────
function drawTrendCharts(perf, comp, roomsAvailable) {
  const labels = perf.map(r => {
    const date = new Date(r.stay_date);
    return `${date.getMonth()+1}/${date.getDate()}`;
  });
  
  const occData = perf.map(r => roomsAvailable > 0 ? (r.rooms_sold / roomsAvailable) * 100 : 0);
  const adrData = perf.map(r => r.adr || (r.room_revenue / r.rooms_sold));

  const occCanvas = document.getElementById("occChart");
  const adrCanvas = document.getElementById("adrChart");
  
  if (occCanvas) {
    if (occChart) occChart.destroy();
    occChart = new Chart(occCanvas.getContext("2d"), {
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

  if (adrCanvas) {
    if (adrChart) adrChart.destroy();
    adrChart = new Chart(adrCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "ADR (R)",
          data: adrData,
          borderColor: "#15803d",
          backgroundColor: "rgba(21,128,61,0.08)",
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "top" } },
        scales: { y: { title: { display: true, text: "ADR (R)" } } }
      }
    });
  }
}

// ─────────────────────────────────────────────
// DOW Charts
// ─────────────────────────────────────────────
const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_COLORS = ["#6366f1","#2563eb","#0891b2","#15803d","#ca8a04","#ea580c","#b91c1c"];

function drawDOWCharts(perf, roomsAvailable) {
  const dowOcc = [[], [], [], [], [], [], []];
  const dowAdr = [[], [], [], [], [], [], []];

  perf.forEach(r => {
    const date = new Date(r.stay_date);
    const dow = date.getDay();
    const occ = roomsAvailable > 0 ? (r.rooms_sold / roomsAvailable) * 100 : 0;
    const adr = r.adr || (r.room_revenue / r.rooms_sold);
    
    dowOcc[dow].push(occ);
    dowAdr[dow].push(adr);
  });

  const avgOcc = dowOcc.map(a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0);
  const avgAdr = dowAdr.map(a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0);

  const occCanvas = document.getElementById("dowOccChart");
  const adrCanvas = document.getElementById("dowAdrChart");
  
  if (occCanvas) {
    if (dowOccChart) dowOccChart.destroy();
    dowOccChart = new Chart(occCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: DOW_LABELS,
        datasets: [{
          label: "Avg Occupancy %",
          data: avgOcc.map(v => parseFloat(v.toFixed(1))),
          backgroundColor: DOW_COLORS,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { title: { display: true, text: "Avg Occupancy %" }, max: 100 } }
      }
    });
  }

  if (adrCanvas) {
    if (dowAdrChart) dowAdrChart.destroy();
    dowAdrChart = new Chart(adrCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: DOW_LABELS,
        datasets: [{
          label: "Avg ADR",
          data: avgAdr.map(v => Math.round(v)),
          backgroundColor: DOW_COLORS,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { title: { display: true, text: "Avg ADR (R)" } } }
      }
    });
  }
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
  if (isNaN(n) || n === null || n === undefined) return "0";
  return Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function logout() {
  localStorage.clear();
  window.location.href = "index.html";
}
