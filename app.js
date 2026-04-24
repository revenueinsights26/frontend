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
            Confidence: ${forecast.confidence}% (${forecast.factors.method})
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
          Based on ${forecast.factors.historicalData} months of historical data 
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

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
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

// ─────────────────────────────────────────────────────────────
// 4-BRANCH FORECAST FUNCTION (COMPLETE REPLACEMENT)
// ─────────────────────────────────────────────────────────────
function calculateImprovedForecast(targetMonthKey, roomsAvailable) {
    const [targetYear, targetMonth] = targetMonthKey.split("-");
    const targetMonthNum = parseInt(targetMonth);
    const targetYearNum = parseInt(targetYear);
    
    // Get current month's performance data
    const currentMonthPerf = allDailyPerf.filter(r => r.stay_date && r.stay_date.startsWith(targetMonthKey));
    const currentKPIs = computeMonthlyKPIs(currentMonthPerf, roomsAvailable);
    
    // Get all historical data for this month from previous years
    const historicalMonths = [];
    for (let i = 1; i <= 2; i++) {
        const pastYear = String(targetYearNum - i);
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
    
    // Get total days of historical data
    const totalHistoricalDays = allDailyPerf.length;
    
    // Calculate recent momentum (last 30 days vs previous 30 days)
    const recentMomentum = calculateRecentMomentum(roomsAvailable);
    
    // ─────────────────────────────────────────────────────────────
    // BRANCH 1: Has historical data for same month last year
    // ─────────────────────────────────────────────────────────────
    if (historicalMonths.length >= 1) {
        const avgHistoricalOcc = historicalMonths.reduce((sum, h) => sum + h.kpis.occupancy, 0) / historicalMonths.length;
        const avgHistoricalADR = historicalMonths.reduce((sum, h) => sum + h.kpis.adr, 0) / historicalMonths.length;
        
        let yoyGrowthOcc = 1.0;
        let yoyGrowthADR = 1.0;
        if (historicalMonths.length >= 2) {
            yoyGrowthOcc = 1 + ((historicalMonths[0].kpis.occupancy - historicalMonths[1].kpis.occupancy) / historicalMonths[1].kpis.occupancy);
            yoyGrowthADR = 1 + ((historicalMonths[0].kpis.adr - historicalMonths[1].kpis.adr) / historicalMonths[1].kpis.adr);
            yoyGrowthOcc = Math.min(1.2, Math.max(0.85, yoyGrowthOcc));
            yoyGrowthADR = Math.min(1.15, Math.max(0.9, yoyGrowthADR));
        }
        
        let forecastOcc = avgHistoricalOcc * yoyGrowthOcc;
        let forecastADR = avgHistoricalADR * yoyGrowthADR;
        
        if (recentMomentum) {
            forecastOcc = (forecastOcc * 0.7) + (currentKPIs.occupancy * (1 + recentMomentum.occTrend) * 0.3);
            forecastADR = (forecastADR * 0.7) + (currentKPIs.adr * (1 + recentMomentum.adrTrend) * 0.3);
        }
        
        const forecastOccMin = forecastOcc * 0.85;
        const forecastOccMax = forecastOcc * 1.15;
        const forecastADRMin = forecastADR * 0.9;
        const forecastADRMax = forecastADR * 1.1;
        
        const forecastRevPAR = (forecastOcc / 100) * forecastADR;
        const forecastRevPARMin = (forecastOccMin / 100) * forecastADRMin;
        const forecastRevPARMax = (forecastOccMax / 100) * forecastADRMax;
        
        const daysInMonth = getDaysInMonth(targetYearNum, targetMonthNum);
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
            confidence: 85,
            factors: {
                historicalData: historicalMonths.length,
                momentumApplied: !!recentMomentum,
                method: "Seasonal (Branch 1)"
            }
        };
    }
    
    // ─────────────────────────────────────────────────────────────
    // BRANCH 2: Has at least 90 days of data
    // ─────────────────────────────────────────────────────────────
    else if (totalHistoricalDays >= 90) {
        const dowOcc = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
        const dowAdr = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
        const dowCount = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
        const dowMap = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
        
        allDailyPerf.forEach(r => {
            if (!r.stay_date) return;
            const date = new Date(r.stay_date);
            const dow = dowMap[date.getDay()];
            const occ = (r.rooms_sold / roomsAvailable) * 100;
            const adr = r.adr || (r.room_revenue / (r.rooms_sold || 1));
            dowOcc[dow] += occ;
            dowAdr[dow] += adr;
            dowCount[dow]++;
        });
        
        for (let d in dowOcc) {
            if (dowCount[d] > 0) {
                dowOcc[d] = dowOcc[d] / dowCount[d];
                dowAdr[d] = dowAdr[d] / dowCount[d];
            }
        }
        
        const daysInMonth = getDaysInMonth(targetYearNum, targetMonthNum);
        const today = new Date();
        let remainingDays = 0;
        let forecastOcc = 0;
        let forecastADR = 0;
        
        for (let d = 1; d <= daysInMonth; d++) {
            const checkDate = new Date(targetYearNum, targetMonthNum - 1, d);
            if (checkDate >= today) {
                remainingDays++;
                const dowName = dowMap[checkDate.getDay()];
                forecastOcc += dowOcc[dowName];
                forecastADR += dowAdr[dowName];
            }
        }
        
        if (remainingDays > 0) {
            forecastOcc = forecastOcc / remainingDays;
            forecastADR = forecastADR / remainingDays;
        } else {
            forecastOcc = currentKPIs.occupancy;
            forecastADR = currentKPIs.adr;
        }
        
        if (recentMomentum) {
            forecastOcc = forecastOcc * (1 + recentMomentum.occTrend * 0.5);
            forecastADR = forecastADR * (1 + recentMomentum.adrTrend * 0.5);
        }
        
        const forecastOccMin = Math.max(0, forecastOcc * 0.85);
        const forecastOccMax = forecastOcc * 1.15;
        const forecastADRMin = forecastADR * 0.9;
        const forecastADRMax = forecastADR * 1.1;
        
        const forecastRevPAR = (forecastOcc / 100) * forecastADR;
        const forecastRevPARMin = (forecastOccMin / 100) * forecastADRMin;
        const forecastRevPARMax = (forecastOccMax / 100) * forecastADRMax;
        
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
            confidence: 75,
            factors: {
                historicalData: Math.floor(totalHistoricalDays / 30),
                momentumApplied: !!recentMomentum,
                method: "DOW-Weighted (Branch 2)"
            }
        };
    }
    
    // ─────────────────────────────────────────────────────────────
    // BRANCH 3: Has 30-90 days of data
    // ─────────────────────────────────────────────────────────────
    else if (totalHistoricalDays >= 30) {
        const last30Days = allDailyPerf.slice(-30);
        const last30KPIs = computeMonthlyKPIs(last30Days, roomsAvailable);
        
        let forecastOcc = last30KPIs.occupancy;
        let forecastADR = last30KPIs.adr;
        
        if (recentMomentum) {
            forecastOcc = forecastOcc * (1 + recentMomentum.occTrend * 0.3);
            forecastADR = forecastADR * (1 + recentMomentum.adrTrend * 0.3);
        }
        
        const forecastOccMin = Math.max(0, forecastOcc * 0.85);
        const forecastOccMax = forecastOcc * 1.15;
        const forecastADRMin = forecastADR * 0.9;
        const forecastADRMax = forecastADR * 1.1;
        
        const daysInMonth = getDaysInMonth(targetYearNum, targetMonthNum);
        const forecastRevPAR = (forecastOcc / 100) * forecastADR;
        const forecastRevPARMin = (forecastOccMin / 100) * forecastADRMin;
        const forecastRevPARMax = (forecastOccMax / 100) * forecastADRMax;
        
        const forecastRevenue = forecastRevPAR * roomsAvailable * daysIn
