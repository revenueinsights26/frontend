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

let occChart    = null;
let adrChart    = null;
let dowOccChart = null;
let dowAdrChart = null;

// ─────────────────────────────────────────────
// On load - AUTO LOAD last viewed hotel
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
  const hasData = localStorage.getItem("hasDashboardData") === "true";
  
  if (hotelId && (localStorage.getItem("autoLoad") === "1" || hasData)) {
    localStorage.removeItem("autoLoad");
    loadDashboard(true);
  } else if (hotelId) {
    loadDashboard(true);
  }
});

// ─────────────────────────────────────────────
// Load dashboard
// ─────────────────────────────────────────────
function loadDashboard(silent = false) {
  const token   = localStorage.getItem("ownerToken");
  let hotelId = document.getElementById("hotelId").value.trim();
  
  if (!hotelId && silent) {
    hotelId = localStorage.getItem("hotelId");
    if (hotelId) {
      document.getElementById("hotelId").value = hotelId;
    }
  }
  
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
      if (!silent) alert("No snapshots found for " + hotelId + ". Upload data first.");
      if (kpisContainer) {
        kpisContainer.innerHTML = `<div class="card" style="grid-column:1/-1; text-align:center; padding:40px;">📭 No data found. <a href="upload.html">Upload your first data file</a></div>`;
      }
      return;
    }
    
    allSnapshots = data;
    const latestSnapshot = allSnapshots[allSnapshots.length - 1];
    fetchDailyAndPrepare(latestSnapshot.snapshot_id);
    
    localStorage.setItem("hasDashboardData", "true");

    document.getElementById("kpis").hidden       = false;
    document.getElementById("monthNav").hidden   = false;
    document.getElementById("charts").hidden     = false;
    document.getElementById("dowSection").hidden = false;
    document.getElementById("detailedSection").hidden = false;
  })
  .catch(err => { 
    if (!silent) alert("Could not load dashboard: " + err.message); 
    console.error(err);
    if (kpisContainer) {
      kpisContainer.innerHTML = `<div class="card" style="grid-column:1/-1; text-align:center; padding:40px; color:#b91c1c;">❌ Error loading data. Please check your connection and try again.</div>`;
    }
  });
}

// ─────────────────────────────────────────────
// Fetch daily data, derive months
// ─────────────────────────────────────────────
function fetchDailyAndPrepare(snapshotId) {
  const token = localStorage.getItem("ownerToken");

  fetch(API + "/daily_by_snapshot/" + snapshotId, {
    headers: { "X-Owner-Token": token }
  })
  .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
  .then(data => {
    allDailyPerf = data.performance || [];
    allDailyComp = data.compset     || [];
    monthKeys    = extractMonths(allDailyPerf);

    if (monthKeys.length === 0) { 
      console.warn("No dated daily data available.");
      return; 
    }

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
    const currentMonthKey = `${currentYear}-${currentMonth}`;
    
    let currentMonthIdx = monthKeys.indexOf(currentMonthKey);
    if (currentMonthIdx === -1) {
      currentMonthIdx = monthKeys.length - 1;
    }
    
    currentMonthIndex = currentMonthIdx;
    renderMonth();
  })
  .catch(err => console.error("Daily fetch error:", err));
}

// ─────────────────────────────────────────────
// Helper functions for variance display
// ─────────────────────────────────────────────
function getPreviousMonthName(currentMonthKey) {
  const currentIndex = monthKeys.indexOf(currentMonthKey);
  if (currentIndex > 0) {
    const prevMonthKey = monthKeys[currentIndex - 1];
    return formatMonthLabel(prevMonthKey);
  }
  return null;
}

function getYoYMonthName(currentMonthKey) {
  const [year, month] = currentMonthKey.split("-");
  const prevYear = String(parseInt(year) - 1);
  return formatMonthLabel(`${prevYear}-${month}`);
}

function isYoYDataSufficient(currentMonthKey, roomsAvailable) {
  const [currentYear, currentMonth] = currentMonthKey.split("-");
  const prevYear = String(parseInt(currentYear) - 1);
  const yoyMonthKey = `${prevYear}-${currentMonth}`;
  
  if (!monthKeys.includes(yoyMonthKey)) return false;
  
  const currentPerf = allDailyPerf.filter(r => r.stay_date && r.stay_date.startsWith(currentMonthKey));
  const yoyPerf = allDailyPerf.filter(r => r.stay_date && r.stay_date.startsWith(yoyMonthKey));
  
  if (yoyPerf.length === 0) return false;
  
  const currentDayCount = currentPerf.length;
  const yoyDayCount = yoyPerf.length;
  
  return yoyDayCount >= currentDayCount * 0.6;
}

function shouldShowForecastRanges(monthKey) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  
  const [year, month] = monthKey.split("-").map(Number);
  
  if (year > currentYear) return true;
  if (year === currentYear && month >= currentMonth) return true;
  return false;
}

function formatVariance(value, isPercentage = false, higherIsBetter = true, context = null) {
  if (value === null || value === undefined) {
    return '<span class="variance-value na">N/A</span>';
  }
  
  const absValue = Math.abs(value);
  const formattedValue = isPercentage ? absValue.toFixed(1) + '%' : 'R ' + fmt(absValue);
  const sign = value > 0 ? '+' : '';
  const fullText = sign + formattedValue;
  
  let colorClass = 'neu';
  if (value !== 0) {
    if (higherIsBetter) {
      colorClass = value > 0 ? 'pos' : 'neg';
    } else {
      colorClass = value < 0 ? 'pos' : 'neg';
    }
  }
  
  if (context) {
    return `<span class="variance-value ${colorClass}">${fullText}</span> <span style="font-size: 9px; color: #94a3b8;">${context}</span>`;
  }
  
  return `<span class="variance-value ${colorClass}">${fullText}</span>`;
}

function getSeasonalTooltip() {
  return `<span class="tooltip-icon" title="MoM compares this month to previous month. Normal seasonal patterns are expected.">?</span>`;
}

// ─────────────────────────────────────────────
// Render selected month
// ─────────────────────────────────────────────
function renderMonth() {
  const monthKey = monthKeys[currentMonthIndex];
  document.getElementById("monthLabel").textContent = formatMonthLabel(monthKey);

  const monthPerf = allDailyPerf.filter(r => r.stay_date && r.stay_date.startsWith(monthKey));
  const monthComp = allDailyComp.filter(r => r.stay_date && r.stay_date.startsWith(monthKey));

  if (monthPerf.length === 0) { 
    console.warn("No data for selected month.");
    return; 
  }

  const roomsAvailable = parseInt(localStorage.getItem("roomsAvailable") || "100", 10);
  const kpis = computeMonthlyKPIs(monthPerf, roomsAvailable);
  
  const variances = calculateVariances(monthKey, roomsAvailable);
  const yoySufficient = isYoYDataSufficient(monthKey, roomsAvailable);
  
  let forecast = null;
  if (shouldShowForecastRanges(monthKey)) {
    forecast = calculateImprovedForecast(monthKey, roomsAvailable);
  }

  renderMonthlyKPIs(kpis, monthKey, variances, forecast, yoySufficient);
  drawTrendCharts(monthPerf, monthComp, roomsAvailable);
  drawDOWCharts(monthPerf, roomsAvailable);
  
  renderDetailedComparisonWithSnapshots(monthKey, roomsAvailable);
}

function renderMonthlyKPIs(kpis, monthKey, variances, forecast, yoySufficient) {
  const cur = localStorage.getItem("currencySymbol") || "R";
  const container = document.getElementById("kpis");
  
  const prevMonthName = getPreviousMonthName(monthKey);
  const yoyMonthName = getYoYMonthName(monthKey);
  
  let momDisplay = '';
  if (variances.mom) {
    momDisplay = formatVariance(variances.mom.occupancy, true, true, `vs ${prevMonthName}`);
  } else {
    momDisplay = '<span class="variance-value na">N/A</span>';
  }
  
  let yoyDisplay = '';
  if (!yoySufficient) {
    yoyDisplay = '<span class="variance-insufficient">Insufficient historical data</span>';
  } else if (variances.yoy) {
    yoyDisplay = formatVariance(variances.yoy.occupancy, true, true, `vs ${yoyMonthName}`);
  } else {
    yoyDisplay = '<span class="variance-value na">N/A</span>';
  }
  
  let adrMomDisplay = '';
  if (variances.mom) {
    adrMomDisplay = formatVariance(variances.mom.adr, false, true, `vs ${prevMonthName}`);
  } else {
    adrMomDisplay = '<span class="variance-value na">N/A</span>';
  }
  
  let adrYoyDisplay = '';
  if (!yoySufficient) {
    adrYoyDisplay = '<span class="variance-insufficient">Insufficient historical data</span>';
  } else if (variances.yoy) {
    adrYoyDisplay = formatVariance(variances.yoy.adr, false, true, `vs ${yoyMonthName}`);
  } else {
    adrYoyDisplay = '<span class="variance-value na">N/A</span>';
  }
  
  let revparMomDisplay = '';
  if (variances.mom) {
    revparMomDisplay = formatVariance(variances.mom.revpar, false, true, `vs ${prevMonthName}`);
  } else {
    revparMomDisplay = '<span class="variance-value na">N/A</span>';
  }
  
  let revparYoyDisplay = '';
  if (!yoySufficient) {
    revparYoyDisplay = '<span class="variance-insufficient">Insufficient historical data</span>';
  } else if (variances.yoy) {
    revparYoyDisplay = formatVariance(variances.yoy.revpar, false, true, `vs ${yoyMonthName}`);
  } else {
    revparYoyDisplay = '<span class="variance-value na">N/A</span>';
  }
  
  let revenueMomDisplay = '';
  if (variances.mom) {
    revenueMomDisplay = formatVariance(variances.mom.revenue, false, true, `vs ${prevMonthName}`);
  } else {
    revenueMomDisplay = '<span class="variance-value na">N/A</span>';
  }
  
  let revenueYoyDisplay = '';
  if (!yoySufficient) {
    revenueYoyDisplay = '<span class="variance-insufficient">Insufficient historical data</span>';
  } else if (variances.yoy) {
    revenueYoyDisplay = formatVariance(variances.yoy.revenue, false, true, `vs ${yoyMonthName}`);
  } else {
    revenueYoyDisplay = '<span class="variance-value na">N/A</span>';
  }

  let html = `
    <div class="kpi">
      <div class="label">Occupancy ${getSeasonalTooltip()}</div>
      <div class="value">${kpis.occupancy.toFixed(1)}%</div>
      <div class="variance-row">
        <span class="variance-label">MoM:</span> ${momDisplay}
        <span class="variance-label" style="margin-left:12px;">YoY:</span> ${yoyDisplay}
      </div>
    </div>
    <div class="kpi">
      <div class="label">ADR</div>
      <div class="value">${cur} ${fmt(kpis.adr)}</div>
      <div class="variance-row">
        <span class="variance-label">MoM:</span> ${adrMomDisplay}
        <span class="variance-label" style="margin-left:12px;">YoY:</span> ${adrYoyDisplay}
      </div>
    </div>
    <div class="kpi">
      <div class="label">RevPAR</div>
      <div class="value">${cur} ${fmt(kpis.revpar)}</div>
      <div class="variance-row">
        <span class="variance-label">MoM:</span> ${revparMomDisplay}
        <span class="variance-label" style="margin-left:12px;">YoY:</span> ${revparYoyDisplay}
      </div>
    </div>
    <div class="kpi">
      <div class="label">Room Revenue</div>
      <div class="value">${cur} ${fmt(kpis.revenue)}</div>
      <div class="variance-row">
        <span class="variance-label">MoM:</span> ${revenueMomDisplay}
        <span class="variance-label" style="margin-left:12px;">YoY:</span> ${revenueYoyDisplay}
      </div>
    </div>
  `;

  if (forecast) {
    html += `
      <div class="card" style="grid-column:1/-1;font-size:13px;margin-top:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong>📊 Forecast for ${formatMonthLabel(monthKey)}</strong>
          <span style="background:#e5e7eb;padding:2px 8px;border-radius:12px;font-size:11px;">
            Confidence: ${forecast.confidence}%
          </span>
        </div>
        
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px;">
          <div>
            <div style="color:#6b7280;font-size:11px;">Occupancy</div>
            <div><strong>${forecast.occupancy}%</strong></div>
            <div style="font-size:10px;color:#6b7280;">Range: ${forecast.occupancyMin}-${forecast.occupancyMax}%</div>
          </div>
          <div>
            <div style="color:#6b7280;font-size:11px;">ADR</div>
            <div><strong>${cur} ${fmt(forecast.adr)}</strong></div>
            <div style="font-size:10px;color:#6b7280;">Range: ${cur} ${fmt(forecast.adrMin)}-${fmt(forecast.adrMax)}</div>
          </div>
          <div>
            <div style="color:#6b7280;font-size:11px;">RevPAR</div>
            <div><strong>${cur} ${fmt(forecast.revpar)}</strong></div>
            <div style="font-size:10px;color:#6b7280;">Range: ${cur} ${fmt(forecast.revparMin)}-${fmt(forecast.revparMax)}</div>
          </div>
          <div>
            <div style="color:#6b7280;font-size:11px;">Room Revenue</div>
            <div><strong>${cur} ${fmt(forecast.revenue)}</strong></div>
            <div style="font-size:10px;color:#6b7280;">Range: ${cur} ${fmt(forecast.revenueMin)}-${fmt(forecast.revenueMax)}</div>
          </div>
        </div>
        
        <div style="font-size:10px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:6px;">
          Based on ${forecast.factors.historicalData} years of historical data 
          ${forecast.factors.momentumApplied ? '• Recent momentum applied' : ''}
        </div>
      </div>`;
  }

  const forecastSnap = pickForecastFromSnapshots(monthKey, allSnapshots);
  if (forecastSnap && forecastSnap.commentary) {
    html += `
      <div class="card" style="grid-column:1/-1;font-size:13px;line-height:1.6;">
        <strong>💡 AI Commentary</strong><br>${forecastSnap.commentary}
      </div>`;
  }

  container.innerHTML = html;
}

function calculateVariances(currentMonthKey, roomsAvailable) {
  const currentIndex = monthKeys.indexOf(currentMonthKey);
  
  let prevMonthKPIs = null;
  if (currentIndex > 0) {
    const prevMonthKey = monthKeys[currentIndex - 1];
    const prevMonthPerf = allDailyPerf.filter(r => r.stay_date && r.stay_date.startsWith(prevMonthKey));
    if (prevMonthPerf.length > 0) {
      prevMonthKPIs = computeMonthlyKPIs(prevMonthPerf, roomsAvailable);
    }
  }
  
  let yoyPrevKPIs = null;
  const [currentYear, currentMonth] = currentMonthKey.split("-");
  const prevYear = String(parseInt(currentYear) - 1);
  const yoyMonthKey = `${prevYear}-${currentMonth}`;
  
  if (monthKeys.includes(yoyMonthKey)) {
    const yoyMonthPerf = allDailyPerf.filter(r => r.stay_date && r.stay_date.startsWith(yoyMonthKey));
    if (yoyMonthPerf.length > 0) {
      yoyPrevKPIs = computeMonthlyKPIs(yoyMonthPerf, roomsAvailable);
    }
  }
  
  const currentPerf = allDailyPerf.filter(r => r.stay_date && r.stay_date.startsWith(currentMonthKey));
  const currentKPIs = computeMonthlyKPIs(currentPerf, roomsAvailable);
  
  return {
    mom: prevMonthKPIs ? {
      occupancy: currentKPIs.occupancy - prevMonthKPIs.occupancy,
      adr: currentKPIs.adr - prevMonthKPIs.adr,
      revpar: currentKPIs.revpar - prevMonthKPIs.revpar,
      revenue: currentKPIs.revenue - prevMonthKPIs.revenue
    } : null,
    yoy: yoyPrevKPIs ? {
      occupancy: currentKPIs.occupancy - yoyPrevKPIs.occupancy,
      adr: currentKPIs.adr - yoyPrevKPIs.adr,
      revpar: currentKPIs.revpar - yoyPrevKPIs.revpar,
      revenue: currentKPIs.revenue - yoyPrevKPIs.revenue
    } : null
  };
}

function computeMonthlyKPIs(perf, roomsAvailable) {
  const days = perf.length;
  const roomsSold = perf.reduce((a, r) => a + r.rooms_sold, 0);
  const revenue = perf.reduce((a, r) => a + r.room_revenue, 0);
  const occupancy = days ? (roomsSold / (roomsAvailable * days)) * 100 : 0;
  const adr = roomsSold ? revenue / roomsSold : 0;
  const revpar = days ? revenue / (roomsAvailable * days) : 0;
  return { occupancy, adr, revpar, revenue };
}

function extractMonths(perfRows) {
  const set = new Set();
  perfRows.forEach(r => {
    if (r.stay_date && /^\d{4}-\d{2}-/.test(r.stay_date))
      set.add(r.stay_date.slice(0, 7));
  });
  return Array.from(set).sort();
}

function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split("-");
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleString("en-ZA", { month: "long", year: "numeric" });
}

function getDayOfWeek(dateStr) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const date = new Date(dateStr);
  return days[date.getDay()];
}

function formatDateDisplay(dateStr) {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}`;
}

function formatCurrency(value) {
  const cur = localStorage.getItem("currencySymbol") || "R";
  return `${cur} ${fmt(value)}`;
}

function formatPickup(value, isPercentage = false) {
  const sign = value > 0 ? '+' : '';
  const absValue = Math.abs(value);
  const formatted = isPercentage ? absValue.toFixed(1) + '%' : fmt(absValue);
  return `${sign}${formatted}`;
}

function fmt(n) {
  return Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function logout() {
  localStorage.clear();
  window.location.href = "index.html";
}

function calculateImprovedForecast(targetMonthKey, roomsAvailable) {
  const [targetYear, targetMonth] = targetMonthKey.split("-");
  const historicalMonths = [];
  
  for (let i = 1; i <= 3; i++) {
    const pastYear = String(parseInt(targetYear) - i);
    const pastMonthKey = `${pastYear}-${targetMonth}`;
    if (monthKeys.includes(pastMonthKey)) {
      const pastPerf = allDailyPerf.filter(r => r.stay_date && r.stay_date.startsWith(pastMonthKey));
      if (pastPerf.length > 0) {
        historicalMonths.push({
          year: pastYear,
          kpis: computeMonthlyKPIs(pastPerf, roomsAvailable)
        });
      }
    }
  }
  
  const recentMomentum = calculateRecentMomentum(roomsAvailable);
  
  if (historicalMonths.length > 0) {
    const avgHistoricalOcc = historicalMonths.reduce((sum, h) => sum + h.kpis.occupancy, 0) / historicalMonths.length;
    const avgHistoricalADR = historicalMonths.reduce((sum, h) => sum + h.kpis.adr, 0) / historicalMonths.length;
    
    const prevMonthIndex = monthKeys.indexOf(targetMonthKey) - 1;
    let prevMonthKPIs = null;
    if (prevMonthIndex >= 0) {
      const prevMonthPerf = allDailyPerf.filter(r => r.stay_date && r.stay_date.startsWith(monthKeys[prevMonthIndex]));
      if (prevMonthPerf.length > 0) {
        prevMonthKPIs = computeMonthlyKPIs(prevMonthPerf, roomsAvailable);
      }
    }
    
    let forecastOcc = avgHistoricalOcc;
    let forecastADR = avgHistoricalADR;
    
    if (recentMomentum && prevMonthKPIs) {
      const momentumOcc = prevMonthKPIs.occupancy * (1 + recentMomentum.occTrend);
      const momentumADR = prevMonthKPIs.adr * (1 + recentMomentum.adrTrend);
      forecastOcc = (forecastOcc * 0.7) + (momentumOcc * 0.3);
      forecastADR = (forecastADR * 0.7) + (momentumADR * 0.3);
    }
    
    if (historicalMonths.length >= 2) {
      const yoyGrowthOcc = (historicalMonths[0].kpis.occupancy - historicalMonths[1].kpis.occupancy) / historicalMonths[1].kpis.occupancy;
      const yoyGrowthADR = (historicalMonths[0].kpis.adr - historicalMonths[1].kpis.adr) / historicalMonths[1].kpis.adr;
      
      if (yoyGrowthOcc > 0) forecastOcc *= (1 + yoyGrowthOcc * 0.5);
      if (yoyGrowthADR > 0) forecastADR *= (1 + yoyGrowthADR * 0.5);
    }
    
    const forecastOccMin = forecastOcc * 0.85;
    const forecastOccMax = forecastOcc * 1.15;
    const forecastADRMin = forecastADR * 0.9;
    const forecastADRMax = forecastADR * 1.1;
    
    const forecastRevPAR = (forecastOcc / 100) * forecastADR;
    const forecastRevPARMin = (forecastOccMin / 100) * forecastADRMin;
    const forecastRevPARMax = (forecastOccMax / 100) * forecastADRMax;
    
    const daysInMonth = getDaysInMonth(parseInt(targetYear), parseInt(targetMonth));
    const forecastRevenue = forecastRevPAR * roomsAvailable * daysInMonth;
    const forecastRevenueMin = forecastRevPARMin * roomsAvailable * daysInMonth;
    const forecastRevenueMax = forecastRevPARMax * roomsAvailable * daysInMonth;
    
    return {
      occupancy: Math.round(forecastOcc),
      occupancyMin: Math.round(forecastOccMin),
      occupancyMax: Math.round(forecastOccMax),
      adr: forecastADR,
      adrMin: forecastADRMin,
      adrMax: forecastADRMax,
      revpar: forecastRevPAR,
      revparMin: forecastRevPARMin,
      revparMax: forecastRevPARMax,
      revenue: forecastRevenue,
      revenueMin: forecastRevenueMin,
      revenueMax: forecastRevenueMax,
      confidence: calculateConfidenceLevel(historicalMonths.length, recentMomentum),
      factors: {
        historicalData: historicalMonths.length,
        momentumApplied: !!recentMomentum,
        seasonalAdjustment: 1.0
      }
    };
  }
  
  return null;
}

function calculateRecentMomentum(roomsAvailable) {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  
  const sixtyDaysAgo = new Date(today);
  sixtyDaysAgo.setDate(today.getDate() - 60);
  
  const recent30 = allDailyPerf.filter(r => {
    if (!r.stay_date) return false;
    const date = new Date(r.stay_date);
    return date >= thirtyDaysAgo && date <= today;
  });
  
  const previous30 = allDailyPerf.filter(r => {
    if (!r.stay_date) return false;
    const date = new Date(r.stay_date);
    return date >= sixtyDaysAgo && date < thirtyDaysAgo;
  });
  
  if (recent30.length === 0 || previous30.length === 0) return null;
  
  const recentKPIs = computeMonthlyKPIs(recent30, roomsAvailable);
  const previousKPIs = computeMonthlyKPIs(previous30, roomsAvailable);
  
  return {
    occTrend: (recentKPIs.occupancy - previousKPIs.occupancy) / previousKPIs.occupancy,
    adrTrend: (recentKPIs.adr - previousKPIs.adr) / previousKPIs.adr
  };
}

function calculateConfidenceLevel(historicalYears, momentum) {
  let confidence = 50;
  
  if (historicalYears >= 3) confidence += 25;
  else if (historicalYears >= 2) confidence += 15;
  else if (historicalYears >= 1) confidence += 5;
  
  if (momentum) confidence += 10;
  
  return Math.min(confidence, 95);
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function pickForecastFromSnapshots(monthKey, snapshots) {
  const monthDate = new Date(monthKey + "-01");
  const valid = snapshots.filter(s => new Date(s.period_start) <= monthDate);
  return valid.length ? valid[valid.length - 1] : null;
}

function getYoYOccupancyData(currentMonthPerf, roomsAvailable) {
  if (!currentMonthPerf || currentMonthPerf.length === 0) return null;
  
  const firstDate = currentMonthPerf[0].stay_date;
  if (!firstDate) return null;
  
  const [currentYear, currentMonth] = firstDate.split("-");
  const prevYear = String(parseInt(currentYear) - 1);
  
  const yoyPerf = allDailyPerf.filter(r => {
    if (!r.stay_date) return false;
    const [year, month] = r.stay_date.split("-");
    return month === currentMonth && year === prevYear;
  });
  
  if (yoyPerf.length === 0) return null;
  
  yoyPerf.sort((a, b) => {
    const dayA = parseInt(a.stay_date.split("-")[2]);
    const dayB = parseInt(b.stay_date.split("-")[2]);
    return dayA - dayB;
  });
  
  return yoyPerf.map(r => {
    return roomsAvailable > 0
      ? parseFloat(((r.rooms_sold / roomsAvailable) * 100).toFixed(1))
      : r.rooms_sold;
  });
}

function drawTrendCharts(perf, comp, roomsAvailable) {
  const labels  = perf.map(r => r.stay_date);
  const occData = perf.map(r =>
    roomsAvailable > 0
      ? parseFloat(((r.rooms_sold / roomsAvailable) * 100).toFixed(1))
      : r.rooms_sold
  );
  const adrData = perf.map(r => r.adr);
  
  const yoyOccData = getYoYOccupancyData(perf, roomsAvailable);

  const occCanvas = document.getElementById("occChart");
  const adrCanvas = document.getElementById("adrChart");
  if (!occCanvas || !adrCanvas) { console.error("Canvas elements not found"); return; }

  const occDatasets = [{
    label: "Current Year Occupancy %",
    data: occData,
    borderColor: "#2563eb",
    backgroundColor: "rgba(37,99,235,0.08)",
    borderWidth: 2, 
    pointRadius: 2, 
    tension: 0.3, 
    fill: true
  }];
  
  if (yoyOccData && yoyOccData.length === labels.length) {
    occDatasets.push({
      label: "Last Year Occupancy %",
      data: yoyOccData,
      borderColor: "#9ca3af",
      backgroundColor: "transparent",
      borderWidth: 2,
      borderDash: [5, 5],
      pointRadius: 1,
      tension: 0.3,
      fill: false
    });
  }

  if (occChart) occChart.destroy();
  occChart = new Chart(occCanvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: occDatasets
    },
    options: chartOptions("Occupancy %")
  });

  const datasets = [{
    label: "ADR (Realised)",
    data: adrData,
    borderColor: "#15803d",
    backgroundColor: "rgba(21,128,61,0.08)",
    borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true
  }];

  if (comp && comp.length > 0) {
    datasets.push({
      label: "Your Rate",
      data: comp.map(r => r.your_rate),
      borderColor: "#b91c1c", backgroundColor: "transparent",
      borderWidth: 2, borderDash: [4, 4], pointRadius: 2, tension: 0.3, fill: false
    });

    const hasComps = comp.some(r => r.comps && r.comps.length > 0);
    if (hasComps) {
      datasets.push({
        label: "Comp Avg",
        data: comp.map(r => {
          const vals = (r.comps || []).filter(v => v !== null);
          return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        }),
        borderColor: "#f59e0b", backgroundColor: "transparent",
        borderWidth: 1.5, borderDash: [2, 3], pointRadius: 1, tension: 0.3, fill: false
      });
    }
  }

  if (adrChart) adrChart.destroy();
  adrChart = new Chart(adrCanvas.getContext("2d"), {
    type: "line",
    data: { labels, datasets },
    options: chartOptions("Rate (R)")
  });
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_COLORS = ["#6366f1","#2563eb","#0891b2","#15803d","#ca8a04","#ea580c","#b91c1c"];

function drawDOWCharts(perf, roomsAvailable) {
  const dowOcc = [[], [], [], [], [], [], []];
  const dowAdr = [[], [], [], [], [], [], []];

  perf.forEach(r => {
    if (!r.stay_date) return;
    const [y, m, d] = r.stay_date.split("-").map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    if (r.rooms_sold > 0) {
      const pct = roomsAvailable > 0 ? (r.rooms_sold / roomsAvailable) * 100 : r.rooms_sold;
      dowOcc[dow].push(pct);
    }
    if (r.adr > 0) dowAdr[dow].push(r.adr);
  });

  const avgOcc = dowOcc.map(a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0);
  const avgAdr = dowAdr.map(a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0);

  const occCanvas = document.getElementById("dowOccChart");
  const adrCanvas = document.getElementById("dowAdrChart");
  if (!occCanvas || !adrCanvas) return;

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
      scales: {
        y: { title: { display: true, text: "Avg Occupancy %", font: { size: 11 } }, max: 100 },
        x: { ticks: { font: { size: 11 } } }
      }
    }
  });

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
      scales: {
        y: { title: { display: true, text: "Avg ADR (R)", font: { size: 11 } } },
        x: { ticks: { font: { size: 11 } } }
      }
    }
  });
}

function chartOptions(yLabel) {
  return {
    responsive: true,
    plugins: {
      legend: { position: "top", labels: { boxWidth: 12, font: { size: 11 } } }
    },
    scales: {
      x: { ticks: { font: { size: 10 }, maxTicksLimit: 12, maxRotation: 45 } },
      y: { title: { display: true, text: yLabel, font: { size: 11 } }, ticks: { font: { size: 10 } } }
    }
  };
}

async function renderDetailedComparisonWithSnapshots(currentMonthKey, roomsAvailable) {
  const token = localStorage.getItem("ownerToken");
  const hotelId = localStorage.getItem("hotelId");
  
  try {
    const snapshotsResponse = await fetch(API + "/hotel_dashboard_history/" + hotelId, {
      headers: { "X-Owner-Token": token }
    });
    const allSnapshotsList = await snapshotsResponse.json();
    
    if (!allSnapshotsList || allSnapshotsList.length < 2) {
      showNoComparisonMessage();
      return;
    }
    
    const currentSnapshot = allSnapshotsList[allSnapshotsList.length - 1];
    const previousSnapshot = allSnapshotsList[allSnapshotsList.length - 2];
    
    const currentDailyResponse = await fetch(API + "/daily_by_snapshot/" + currentSnapshot.snapshot_id, {
      headers: { "X-Owner-Token": token }
    });
    const currentDailyData = await currentDailyResponse.json();
    const currentMonthPerf = currentDailyData.performance.filter(r => r.stay_date && r.stay_date.startsWith(currentMonthKey));
    currentMonthPerf.sort((a, b) => a.stay_date.localeCompare(b.stay_date));
    
    const previousDailyResponse = await fetch(API + "/daily_by_snapshot/" + previousSnapshot.snapshot_id, {
      headers: { "X-Owner-Token": token }
    });
    const previousDailyData = await previousDailyResponse.json();
    
    let previousMonthPerf = previousDailyData.performance.filter(r => r.stay_date && r.stay_date.startsWith(currentMonthKey));
    
    if (previousMonthPerf.length === 0 && previousDailyData.performance.length > 0) {
      const prevDates = previousDailyData.performance.map(r => r.stay_date).sort();
      const prevLastMonth = prevDates[prevDates.length - 1].slice(0, 7);
      previousMonthPerf = previousDailyData.performance.filter(r => r.stay_date && r.stay_date.startsWith(prevLastMonth));
    }
    
    previousMonthPerf.sort((a, b) => a.stay_date.localeCompare(b.stay_date));
    
    const prevMonthMap = new Map();
    previousMonthPerf.forEach(day => {
      const dayNum = parseInt(day.stay_date.split("-")[2]);
      prevMonthMap.set(dayNum, day);
    });
    
    let tableRows = '';
    let totals = {
      currentRooms: 0,
      prevRooms: 0,
      currentRevenue: 0,
      prevRevenue: 0,
      daysWithData: 0
    };
    
    let rowIndex = 0;
    
    const formatSnapshotDate = (dateStr) => {
      if (!dateStr) return 'Unknown';
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-ZA');
    };
    
    const comparisonInfo = `
      <div style="background: #e0f2fe; padding: 8px 12px; border-radius: 8px; margin-bottom: 16px; font-size: 12px;">
        📊 Comparing: <strong>${formatSnapshotDate(currentSnapshot.period_start)} to ${formatSnapshotDate(currentSnapshot.period_end)}</strong> (Current Upload) 
        vs <strong>${formatSnapshotDate(previousSnapshot.period_start)} to ${formatSnapshotDate(previousSnapshot.period_end)}</strong> (Previous Upload)
      </div>
    `;
    
    currentMonthPerf.forEach(currentDay => {
      const date = currentDay.stay_date;
      const dayNum = parseInt(date.split("-")[2]);
      const dow = getDayOfWeek(date);
      
      const currentRooms = currentDay.rooms_sold;
      const currentRevenue = currentDay.room_revenue;
      const currentOccPct = roomsAvailable > 0 ? (currentRooms / roomsAvailable) * 100 : 0;
      const currentADR = currentRooms > 0 ? currentRevenue / currentRooms : 0;
      
      let prevRooms = 0;
      let prevRevenue = 0;
      let prevOccPct = 0;
      let prevADR = 0;
      let hasPrevData = false;
      
      if (prevMonthMap.has(dayNum)) {
        const prevDay = prevMonthMap.get(dayNum);
        prevRooms = prevDay.rooms_sold;
        prevRevenue = prevDay.room_revenue;
        prevOccPct = roomsAvailable > 0 ? (prevRooms / roomsAvailable) * 100 : 0;
        prevADR = prevRooms > 0 ? prevRevenue / prevRooms : 0;
        hasPrevData = true;
      }
      
      const roomsPickup = currentRooms - prevRooms;
      const occPickup = currentOccPct - prevOccPct;
      const revenuePickup = currentRevenue - prevRevenue;
      const adrPickup = currentADR - prevADR;
      
      totals.currentRooms += currentRooms;
      totals.currentRevenue += currentRevenue;
      totals.daysWithData++;
      
      if (hasPrevData) {
        totals.prevRooms += prevRooms;
        totals.prevRevenue += prevRevenue;
      }
      
      const roomsPickupClass = roomsPickup > 0 ? 'pickup-positive' : (roomsPickup < 0 ? 'pickup-negative' : 'pickup-neutral');
      const occPickupClass = occPickup > 0 ? 'pickup-positive' : (occPickup < 0 ? 'pickup-negative' : 'pickup-neutral');
      const revenuePickupClass = revenuePickup > 0 ? 'pickup-positive' : (revenuePickup < 0 ? 'pickup-negative' : 'pickup-neutral');
      const adrPickupClass = adrPickup > 0 ? 'pickup-positive' : (adrPickup < 0 ? 'pickup-negative' : 'pickup-neutral');
      
      const rowClass = rowIndex % 2 === 0 ? 'table-row-even' : 'table-row-odd';
      
      tableRows += `
        <tr class="${rowClass}">
          <td class="date-cell">${formatDateDisplay(date)}</td>
          <td class="dow-cell">${dow}</td>
          <td class="number-cell">${currentRooms}</td>
          <td class="number-cell">${hasPrevData ? prevRooms : '-'}</td>
          <td class="pickup-cell ${roomsPickupClass}">${hasPrevData ? formatPickup(roomsPickup) : '-'}</td>
          <td class="number-cell">${currentOccPct.toFixed(1)}%</td>
          <td class="number-cell">${hasPrevData ? prevOccPct.toFixed(1) + '%' : '-'}</td>
          <td class="pickup-cell ${occPickupClass}">${hasPrevData ? formatPickup(occPickup, true) : '-'}</td>
          <td class="number-cell">${formatCurrency(currentRevenue)}</td>
          <td class="number-cell">${hasPrevData ? formatCurrency(prevRevenue) : '-'}</td>
          <td class="pickup-cell ${revenuePickupClass}">${hasPrevData ? formatPickup(revenuePickup) : '-'}</td>
          <td class="number-cell">${formatCurrency(currentADR)}</td>
          <td class="number-cell">${hasPrevData ? formatCurrency(prevADR) : '-'}</td>
          <td class="pickup-cell ${adrPickupClass}">${hasPrevData ? formatPickup(adrPickup) : '-'}</td>
        </tr>
      `;
      rowIndex++;
    });
    
    const avgCurrentOcc = totals.daysWithData > 0 ? (totals.currentRooms / (roomsAvailable * totals.daysWithData)) * 100 : 0;
    const avgPrevOcc = totals.daysWithData > 0 && totals.prevRooms > 0 ? (totals.prevRooms / (roomsAvailable * totals.daysWithData)) * 100 : 0;
    const avgCurrentADR = totals.currentRooms > 0 ? totals.currentRevenue / totals.currentRooms : 0;
    const avgPrevADR = totals.prevRooms > 0 ? totals.prevRevenue / totals.prevRooms : 0;
    
    const totalRoomsPickup = totals.currentRooms - totals.prevRooms;
    const totalOccPickup = avgCurrentOcc - avgPrevOcc;
    const totalRevenuePickup = totals.currentRevenue - totals.prevRevenue;
    const totalADRPickup = avgCurrentADR - avgPrevADR;
    
    const uniqueId = `detailed-table-${Date.now()}`;
    
    const tableHTML = `
      <div class="detailed-section">
        <div class="detailed-header" onclick="toggleDetailedTable('${uniqueId}')">
          <h2 style="margin:0; cursor:pointer;">
            📋 Day-by-Day Detailed Overview 
            <span class="toggle-icon">▼</span>
          </h2>
          <p class="subtle" style="margin:5px 0 0;">Click to expand/collapse</p>
        </div>
        <div id="${uniqueId}" class="detailed-content" style="display: block;">
          ${comparisonInfo}
          <div class="table-wrapper">
            <table class="detailed-table">
              <thead>
                <tr>
                  <th rowspan="2">Date</th>
                  <th rowspan="2">DOW</th>
                  <th colspan="3">Rooms Sold</th>
                  <th colspan="3">Occupancy %</th>
                  <th colspan="3">Room Revenue</th>
                  <th colspan="3">ADR</th>
                </tr>
                <tr>
                  <th>Current</th><th>Prev</th><th>Pickup</th>
                  <th>Current</th><th>Prev</th><th>Pickup</th>
                  <th>Current</th><th>Prev</th><th>Pickup</th>
                  <th>Current</th><th>Prev</th><th>Pickup</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
              <tfoot>
                <tr class="totals-row">
                  <td colspan="2"><strong>TOTALS / AVG</strong></td>
                  <td class="number-cell"><strong>${totals.currentRooms}</strong></td>
                  <td class="number-cell"><strong>${totals.prevRooms > 0 ? totals.prevRooms : '-'}</strong></td>
                  <td class="pickup-cell ${totalRoomsPickup > 0 ? 'pickup-positive' : (totalRoomsPickup < 0 ? 'pickup-negative' : 'pickup-neutral')}">
                    <strong>${totals.prevRooms > 0 ? formatPickup(totalRoomsPickup) : '-'}</strong>
                  </td>
                  <td class="number-cell"><strong>${avgCurrentOcc.toFixed(1)}%</strong></td>
                  <td class="number-cell"><strong>${totals.prevRooms > 0 ? avgPrevOcc.toFixed(1) + '%' : '-'}</strong></td>
                  <td class="pickup-cell ${totalOccPickup > 0 ? 'pickup-positive' : (totalOccPickup < 0 ? 'pickup-negative' : 'pickup-neutral')}">
                    <strong>${totals.prevRooms > 0 ? formatPickup(totalOccPickup, true) : '-'}</strong>
                  </td>
                  <td class="number-cell"><strong>${formatCurrency(totals.currentRevenue)}</strong></td>
                  <td class="number-cell"><strong>${totals.prevRevenue > 0 ? formatCurrency(totals.prevRevenue) : '-'}</strong></td>
                  <td class="pickup-cell ${totalRevenuePickup > 0 ? 'pickup-positive' : (totalRevenuePickup < 0 ? 'pickup-negative' : 'pickup-neutral')}">
                    <strong>${totals.prevRevenue > 0 ? formatPickup(totalRevenuePickup) : '-'}</strong>
                  </td>
                  <td class="number-cell"><strong>${formatCurrency(avgCurrentADR)}</strong></td>
                  <td class="number-cell"><strong>${totals.prevRooms > 0 ? formatCurrency(avgPrevADR) : '-'}</strong></td>
                  <td class="pickup-cell ${totalADRPickup > 0 ? 'pickup-positive' : (totalADRPickup < 0 ? 'pickup-negative' : 'pickup-neutral')}">
                    <strong>${totals.prevRooms > 0 ? formatPickup(totalADRPickup) : '-'}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    `;
    
    let detailedContainer = document.getElementById("detailedContainer");
    if (!detailedContainer) {
      detailedContainer = document.createElement("div");
      detailedContainer.id = "detailedContainer";
      const dowSection = document.getElementById("dowSection");
      if (dowSection) {
        dowSection.insertAdjacentElement('afterend', detailedContainer);
      }
    }
    if (detailedContainer) {
      detailedContainer.innerHTML = tableHTML;
    }
    
  } catch (err) {
    console.error("Error rendering detailed comparison:", err);
    showNoComparisonMessage();
  }
}

function showNoComparisonMessage() {
  const tableHTML = `
    <div class="detailed-section">
      <div class="detailed-header" onclick="toggleDetailedTable('no-compare-table')">
        <h2 style="margin:0; cursor:pointer;">
          📋 Day-by-Day Detailed Overview 
          <span class="toggle-icon">▼</span>
        </h2>
        <p class="subtle" style="margin:5px 0 0;">Click to expand/collapse</p>
      </div>
      <div id="no-compare-table" class="detailed-content" style="display: block;">
        <div style="text-align: center; padding: 40px; background: #fef3c7; border-radius: 12px;">
          <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
          <h3>Not enough data for comparison</h3>
          <p>Upload at least two snapshots to see day-by-day pickups.</p>
          <p style="font-size: 13px; margin-top: 8px;">Current data is shown in the charts above. Upload again next week to see improvements.</p>
        </div>
      </div>
    </div>
  `;
  
  let detailedContainer = document.getElementById("detailedContainer");
  if (!detailedContainer) {
    detailedContainer = document.createElement("div");
    detailedContainer.id = "detailedContainer";
    const dowSection = document.getElementById("dowSection");
    if (dowSection) {
      dowSection.insertAdjacentElement('afterend', detailedContainer);
    }
  }
  if (detailedContainer) {
    detailedContainer.innerHTML = tableHTML;
  }
}

window.toggleDetailedTable = function(id) {
  const content = document.getElementById(id);
  const icon = content?.parentElement?.querySelector('.toggle-icon');
  if (content && icon) {
    if (content.style.display === 'none') {
      content.style.display = 'block';
      icon.textContent = '▼';
    } else {
      content.style.display = 'none';
      icon.textContent = '▶';
    }
  }
}
