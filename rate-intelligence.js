console.log("rate-intelligence.js loaded - PERMANENT FORECAST FIX");

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const API = window.location.hostname === 'localhost' 
  ? "http://localhost:8000" 
  : "https://backend-x5sw.onrender.com";

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────
let allDailyPerf = [];
let allDailyComp = [];
let monthKeys = [];
let currentMonthIndex = 0;
let roomsAvailable = 100;
let allSnapshots = [];
let allMonthsWithData = new Set();

// ─────────────────────────────────────────────
// On load
// ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("ownerToken");
  if (!token) { 
    window.location.href = "index.html"; 
    return; 
  }

  roomsAvailable = parseInt(localStorage.getItem("roomsAvailable") || "100", 10);
  
  const savedHotelId = localStorage.getItem("hotelId");
  if (savedHotelId) {
    localStorage.setItem("hotelId", savedHotelId);
  }
  
  // Setup month navigation with forecast support
  document.getElementById("prevMonth").addEventListener("click", () => {
    navigateMonth(-1);
  });
  
  document.getElementById("nextMonth").addEventListener("click", () => {
    navigateMonth(1);
  });

  loadDashboardData();
});

// ─────────────────────────────────────────────
// Smart navigation that works with ANY month
// ─────────────────────────────────────────────
function navigateMonth(direction) {
  // Get current displayed month from the label
  const currentLabel = document.getElementById("monthLabel").innerText;
  let currentDate = parseMonthLabel(currentLabel);
  
  // If we can't parse, use current real date
  if (!currentDate) {
    currentDate = new Date();
  }
  
  // Add/subtract month
  currentDate.setMonth(currentDate.getMonth() + direction);
  
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0');
  const monthKey = `${year}-${month}`;
  
  // Check if we have data for this month
  if (allMonthsWithData.has(monthKey)) {
    // Load historical data
    loadHistoricalMonth(monthKey);
  } else {
    // Load forecast
    loadForecastForMonth(monthKey);
  }
}

function parseMonthLabel(label) {
  // Handle formats like "April 2025" or "April 2025 🔮"
  const cleanLabel = label.replace('🔮', '').trim();
  const parts = cleanLabel.split(' ');
  if (parts.length >= 2) {
    const monthName = parts[0];
    const year = parseInt(parts[1]);
    const monthIndex = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December']
                        .indexOf(monthName);
    if (monthIndex !== -1 && !isNaN(year)) {
      return new Date(year, monthIndex, 1);
    }
  }
  return null;
}

function loadHistoricalMonth(monthKey) {
  const monthPerf = allDailyPerf.filter(r => r.stay_date && r.stay_date.startsWith(monthKey));
  const monthComp = allDailyComp.filter(r => r.stay_date && r.stay_date.startsWith(monthKey));
  
  if (monthPerf.length === 0) {
    loadForecastForMonth(monthKey);
    return;
  }
  
  document.getElementById("monthLabel").textContent = formatMonthLabel(monthKey);
  
  const isCurrentFuture = isCurrentOrFutureMonth(monthKey);
  const kpis = computeMonthlyKPIs(monthPerf, roomsAvailable);
  const dowAnalysis = analyzeDOWPatterns(monthPerf, roomsAvailable);
  const demandAnalysis = analyzeDemand(monthPerf, roomsAvailable);
  const competitorRates = analyzeCompetitorRates(monthComp);
  
  renderExecutiveSummary(kpis, dowAnalysis, demandAnalysis, competitorRates, isCurrentFuture, monthKey);
  renderRateRecommendations(kpis, dowAnalysis, competitorRates, isCurrentFuture);
  renderRevenueTriangle(kpis, dowAnalysis, isCurrentFuture);
  renderDemandCalendar(demandAnalysis, monthPerf);
  renderDayStrategy(monthPerf, monthComp, roomsAvailable, isCurrentFuture);
}

// ─────────────────────────────────────────────
// Load Historical Data and build month set
// ─────────────────────────────────────────────
function loadDashboardData() {
  const token = localStorage.getItem("ownerToken");
  let hotelId = localStorage.getItem("hotelId");
  
  if (!hotelId) {
    alert("No hotel selected. Please go back and load a hotel from the dashboard first.");
    window.location.href = "dashboard.html";
    return;
  }

  const summaryCard = document.getElementById("summaryCard");
  if (summaryCard) {
    summaryCard.innerHTML = `<div style="text-align: center; padding: 40px;">📊 Loading rate intelligence data...</div>`;
  }

  fetch(API + "/hotel_dashboard_history/" + hotelId, {
    headers: { "X-Owner-Token": token }
  })
  .then(res => res.json())
  .then(snapshots => {
    if (!snapshots || snapshots.length === 0) {
      allSnapshots = [];
      const today = new Date();
      const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      loadForecastForMonth(currentMonthKey);
      return;
    }
    
    allSnapshots = snapshots;
    const latestSnapshot = snapshots[snapshots.length - 1];
    return fetch(API + "/daily_by_snapshot/" + latestSnapshot.snapshot_id, {
      headers: { "X-Owner-Token": token }
    });
  })
  .then(res => {
    if (res) return res.json();
    return null;
  })
  .then(data => {
    if (data) {
      allDailyPerf = data.performance || [];
      allDailyComp = data.compset || [];
    }
    
    // Build set of months that HAVE data
    allDailyPerf.forEach(r => {
      if (r.stay_date && r.stay_date.length >= 7) {
        allMonthsWithData.add(r.stay_date.substring(0, 7));
      }
    });
    
    monthKeys = Array.from(allMonthsWithData).sort();
    
    if (monthKeys.length === 0 && allSnapshots.length === 0) {
      alert("No data available. Please upload data first.");
      window.location.href = "dashboard.html";
      return;
    }
    
    // Start with current month
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
    const currentMonthKey = `${currentYear}-${currentMonth}`;
    
    if (allMonthsWithData.has(currentMonthKey)) {
      loadHistoricalMonth(currentMonthKey);
    } else {
      loadForecastForMonth(currentMonthKey);
    }
  })
  .catch(err => {
    console.error("Error loading data:", err);
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    loadForecastForMonth(currentMonthKey);
  });
}

// =========================================================
// FORECAST FOR MONTHS WITH NO DATA
// =========================================================

async function loadForecastForMonth(monthKey) {
  const token = localStorage.getItem("ownerToken");
  const hotelId = localStorage.getItem("hotelId") || "ELLIPSE001";
  const roomsAvail = parseInt(localStorage.getItem("roomsAvailable") || "100", 10);
  
  // Update month display
  document.getElementById("monthLabel").textContent = formatMonthLabel(monthKey) + " 🔮";
  
  const summaryCard = document.getElementById("summaryCard");
  summaryCard.innerHTML = `<div style="text-align: center; padding: 40px;">🔮 Loading forecast for ${formatMonthLabel(monthKey)}...</div>`;
  
  try {
    const response = await fetch(`${API}/forecast_future_month`, {
      method: "POST",
      headers: {
        "X-Owner-Token": token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        hotel_id: hotelId,
        target_month: monthKey,
        rooms_available: roomsAvail
      })
    });
    
    const forecast = await response.json();
    renderForecastUI(forecast, monthKey);
    
  } catch (err) {
    console.error("Forecast error:", err);
    renderForecastUI({
      forecast_occupancy: 45,
      forecast_adr_min: 1200,
      forecast_adr_max: 1600,
      forecast_revpar: 600,
      confidence: 30,
      method: "Default (No Data)"
    }, monthKey);
  }
}

function renderForecastUI(forecast, monthKey) {
  const forecastOcc = forecast.forecast_occupancy;
  const forecastAdrMin = forecast.forecast_adr_min;
  const forecastAdrMax = forecast.forecast_adr_max;
  const forecastAdr = (forecastAdrMin + forecastAdrMax) / 2;
  const confidence = forecast.confidence;
  const method = forecast.method;
  
  let confidenceColor = "#f97316";
  let confidenceText = "Low Confidence";
  if (confidence >= 75) {
    confidenceColor = "#22c55e";
    confidenceText = "High Confidence";
  } else if (confidence >= 60) {
    confidenceColor = "#eab308";
    confidenceText = "Medium Confidence";
  }
  
  // Executive Summary
  const summaryCard = document.getElementById("summaryCard");
  summaryCard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
      <div>
        <h3 style="margin: 0 0 8px 0; color: white;">🔮 FORECAST MODE</h3>
        <p style="margin: 0; opacity: 0.9;">${formatMonthLabel(monthKey)} - No historical data yet</p>
      </div>
      <div style="background: ${confidenceColor}; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">
        ${confidenceText} (${confidence}%)
      </div>
    </div>
    <div style="margin-top: 20px; background: rgba(255,255,255,0.1); padding: 16px; border-radius: 12px;">
      <p style="margin: 0 0 8px 0;"><strong>Method:</strong> ${method}</p>
      <p style="margin: 0;"><strong>Forecast:</strong> ${forecastOcc}% occupancy with ADR between R${forecastAdrMin.toFixed(0)} - R${forecastAdrMax.toFixed(0)}</p>
    </div>
    <div style="margin-top: 16px; padding: 12px; background: rgba(255,255,255,0.08); border-radius: 8px;">
      <p style="margin: 0; font-size: 14px;">💡 Upload data for this month when available to improve future forecasts.</p>
    </div>
  `;
  
  // Rate Recommendations
  const rateRecs = document.getElementById("rateRecommendations");
  const suggestedRate = Math.round(forecastAdr);
  const lastAdr = allSnapshots.length > 0 ? allSnapshots[allSnapshots.length - 1].adr : 1500;
  
  rateRecs.innerHTML = `
    <div style="margin-bottom: 20px;">
      <div style="font-size: 32px; font-weight: bold; color: #2563eb;">R ${suggestedRate.toLocaleString()}</div>
      <div style="color: #6b7280;">Suggested Rate for ${formatMonthLabel(monthKey)}</div>
    </div>
    <div style="border-top: 1px solid #e5e7eb; padding-top: 16px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
        <span>📊 Projected Occupancy:</span>
        <strong>${forecastOcc}%</strong>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
        <span>💰 Projected ADR Range:</span>
        <strong>R ${forecastAdrMin.toFixed(0)} - R ${forecastAdrMax.toFixed(0)}</strong>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>📈 Projected RevPAR:</span>
        <strong>R ${forecast.forecast_revpar.toLocaleString()}</strong>
      </div>
    </div>
    <div style="margin-top: 16px; padding: 12px; background: #fef3c7; border-radius: 8px;">
      <span style="font-size: 13px;">⚠️ This is a forecast based on historical patterns. Start at R${suggestedRate.toLocaleString()} and adjust based on real-time demand.</span>
    </div>
  `;
  
  // Revenue Triangle
  const revenueTriangle = document.getElementById("revenueTriangle");
  revenueTriangle.innerHTML = `
    <div style="text-align: center; padding: 20px;">
      <div style="font-size: 48px; font-weight: bold; color: #2563eb;">R ${forecast.forecast_revpar.toLocaleString()}</div>
      <div style="color: #6b7280; margin-bottom: 20px;">Projected RevPAR</div>
      <div style="display: flex; justify-content: space-around; border-top: 1px solid #e5e7eb; padding-top: 20px;">
        <div>
          <div style="font-size: 24px; font-weight: bold;">${forecastOcc}%</div>
          <div style="font-size: 12px; color: #6b7280;">Forecast Occupancy</div>
        </div>
        <div>
          <div style="font-size: 24px; font-weight: bold;">R ${suggestedRate.toLocaleString()}</div>
          <div style="font-size: 12px; color: #6b7280;">Target ADR</div>
        </div>
      </div>
    </div>
  `;
  
  // Demand Calendar - Generate future dates
  renderForecastDemandCalendar(forecast, monthKey);
  
  // Strategy Table
  renderForecastStrategyTable(forecast, monthKey);
}

function renderForecastDemandCalendar(forecast, monthKey) {
  const calendarDiv = document.getElementById("demandCalendar");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [year, month] = monthKey.split("-").map(Number);
  const startDate = new Date(year, month - 1, 1);
  const days = [];
  
  for (let i = 0; i < 35; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    if (date.getMonth() !== month - 1) break;
    
    if (date >= today) {
      const dayOfWeek = date.toLocaleDateString('en-ZA', { weekday: 'short' });
      const isWeekend = dayOfWeek === 'Sat' || dayOfWeek === 'Sun';
      const demandScore = isWeekend ? forecast.forecast_occupancy * 1.15 : forecast.forecast_occupancy * 0.95;
      const suggestedRate = isWeekend ? forecast.forecast_adr_max : forecast.forecast_adr_min;
      const isToday = date.toDateString() === today.toDateString();
      
      days.push(`
        <div style="padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; background: ${isToday ? '#e0f2fe' : 'white'}">
          <div style="font-weight: bold;">${date.getDate()} ${dayOfWeek}${isToday ? ' 🔴' : ''}</div>
          <div style="font-size: 20px; font-weight: bold; color: ${demandScore > forecast.forecast_occupancy ? '#22c55e' : '#f97316'}">
            ${Math.round(demandScore)}%
          </div>
          <div style="font-size: 12px; color: #6b7280;">R ${Math.round(suggestedRate)}</div>
          <div style="font-size: 10px; margin-top: 4px;">${isWeekend ? 'Weekend' : 'Weekday'}</div>
        </div>
      `);
    }
  }
  
  calendarDiv.innerHTML = days.length > 0 
    ? `<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px;">${days.join('')}</div>`
    : `<div style="text-align: center; padding: 40px; background: #fef3c7; border-radius: 12px;">
        <div style="font-size: 48px; margin-bottom: 16px;">📅</div>
        <h3>No upcoming dates in ${formatMonthLabel(monthKey)}</h3>
        <p>All dates in this month have passed.</p>
       </div>`;
}

function renderForecastStrategyTable(forecast, monthKey) {
  const table = document.getElementById("strategyTable");
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const forecastAdr = (forecast.forecast_adr_min + forecast.forecast_adr_max) / 2;
  const forecastOcc = forecast.forecast_occupancy;
  
  let html = `
    <div style="font-size: 11px; color: #64748b; margin-bottom: 12px; padding: 8px; background: #f1f5f9; border-radius: 6px;">
      ℹ️ Forecasted rate suggestions based on historical patterns and ${forecast.method}.
    </div>
    <div style="overflow-x: auto;">
      <table class="detailed-table" style="width: 100%; border-collapse: collapse; min-width: 600px;">
        <thead>
          <tr><th>Day of Week</th><th>Forecast Occupancy</th><th>Suggested Rate</th><th>Strategy</th><th>Confidence</th></tr>
        </thead>
        <tbody>
  `;
  
  const dayStrategies = [
    { day: "Monday", multiplier: 0.94, strategy: "Weekday - Corporate focus" },
    { day: "Tuesday", multiplier: 0.95, strategy: "Weekday - Maintain" },
    { day: "Wednesday", multiplier: 0.96, strategy: "Weekday - Steady demand" },
    { day: "Thursday", multiplier: 0.92, strategy: "Weekday - Softest day" },
    { day: "Friday", multiplier: 1.05, strategy: "Weekend start - Increase" },
    { day: "Saturday", multiplier: 1.10, strategy: "Peak day - Push rates" },
    { day: "Sunday", multiplier: 1.03, strategy: "Weekend end - Maintain" }
  ];
  
  dayStrategies.forEach(s => {
    const occ = forecastOcc * s.multiplier;
    const suggested = Math.round(forecastAdr * s.multiplier);
    let confidenceColor = "#f97316";
    let confidenceText = "Medium";
    
    if (forecast.confidence >= 75) {
      confidenceColor = "#22c55e";
      confidenceText = "High";
    } else if (forecast.confidence >= 50) {
      confidenceColor = "#eab308";
      confidenceText = "Medium";
    } else {
      confidenceColor = "#ef4444";
      confidenceText = "Low";
    }
    
    let bgColor = "#f8fafc";
    let occColor = "#1e293b";
    if (occ > 70) {
      bgColor = "#f0fdf4";
      occColor = "#166534";
    } else if (occ < 40) {
      bgColor = "#fef2f2";
      occColor = "#991b1b";
    }
    
    html += `
      <tr style="background: ${bgColor};">
        <td style="padding: 10px; font-weight: 600;">${s.day}<td>
        <td style="padding: 10px; text-align: center;"><strong style="color: ${occColor};">${Math.round(occ)}%</strong></td>
        <td style="padding: 10px; text-align: center;"><strong>R ${suggested.toLocaleString()}</strong></td>
        <td style="padding: 10px; font-size: 12px;">${s.strategy}</td>
        <td style="padding: 10px; text-align: center;"><span style="background: ${confidenceColor}20; color: ${confidenceColor}; padding: 2px 8px; border-radius: 12px; font-size: 10px;">${confidenceText}</span></td>
      </tr>
    `;
  });
  
  html += '</tbody></table></div>';
  table.innerHTML = html;
}

// =========================================================
// Helper Functions - Keep all your existing ones
// =========================================================

function isCurrentOrFutureMonth(monthKey) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const [year, month] = monthKey.split("-").map(Number);
  if (year > currentYear) return true;
  if (year === currentYear && month >= currentMonth) return true;
  return false;
}

function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split("-");
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleString("en-ZA", { month: "long", year: "numeric" });
}

function formatCurrency(value) {
  const cur = localStorage.getItem("currencySymbol") || "R";
  return `${cur} ${Math.round(value).toLocaleString()}`;
}

function getDayOfWeek(dateStr) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const date = new Date(dateStr);
  return days[date.getDay()];
}

function getDayOfWeekName(dateStr) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const date = new Date(dateStr);
  return days[date.getDay()];
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

function analyzeDOWPatterns(perf, roomsAvailable) {
  const dowOcc = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [] };
  const dowMap = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };
  
  perf.forEach(r => {
    const date = new Date(r.stay_date);
    const dow = dowMap[date.getDay()];
    const occ = roomsAvailable > 0 ? (r.rooms_sold / roomsAvailable) * 100 : 0;
    dowOcc[dow].push(occ);
  });
  
  const avgOcc = {};
  for (let day in dowOcc) {
    avgOcc[day] = dowOcc[day].length ? dowOcc[day].reduce((a,b) => a + b, 0) / dowOcc[day].length : 0;
  }
  
  const weekdayOcc = (avgOcc.Mon + avgOcc.Tue + avgOcc.Wed + avgOcc.Thu) / 4;
  const weekendOcc = (avgOcc.Fri + avgOcc.Sat + avgOcc.Sun) / 3;
  
  return { weekdayOcc, weekendOcc, avgOcc };
}

function analyzeDemand(perf, roomsAvailable) {
  const highDemandDays = [];
  const lowDemandDays = [];
  const dowMap = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };
  
  const dowOcc = {};
  perf.forEach(r => {
    const date = new Date(r.stay_date);
    const dow = dowMap[date.getDay()];
    const occ = roomsAvailable > 0 ? (r.rooms_sold / roomsAvailable) * 100 : 0;
    if (!dowOcc[dow]) dowOcc[dow] = [];
    dowOcc[dow].push(occ);
  });
  
  for (let day in dowOcc) {
    const avg = dowOcc[day].reduce((a,b) => a + b, 0) / dowOcc[day].length;
    if (avg > 75) highDemandDays.push(day);
    if (avg < 50) lowDemandDays.push(day);
  }
  
  return { highDemandDays, lowDemandDays };
}

function analyzeCompetitorRates(comp) {
  let allRates = [];
  comp.forEach(c => {
    if (c.comps && c.comps.length > 0) {
      allRates = allRates.concat(c.comps);
    }
  });
  
  const avgCompetitorRate = allRates.length ? allRates.reduce((a,b) => a + b, 0) / allRates.length : 1500;
  return { avgCompetitorRate };
}

function renderExecutiveSummary(kpis, dowAnalysis, demandAnalysis, competitorRates, isCurrentFuture, monthKey) {
  let text = "";
  let recommendation = "";
  let focus = "";
  
  const occ = kpis.occupancy;
  const adr = kpis.adr;
  
  if (occ > 80) {
    text = "🏨 Your hotel shows HIGH OCCUPANCY (>80%). ";
    if (adr < competitorRates.avgCompetitorRate * 0.95) {
      text += "Historical rates are BELOW competitors despite strong demand. ";
      recommendation = "↑ Increase Rates";
      focus = "ADR Optimization";
    } else {
      text += "You have pricing power based on historical performance. ";
      recommendation = "↗️ Moderate Rate Increase";
      focus = "Revenue Maximization";
    }
  } else if (occ > 65) {
    text = "📈 Your hotel shows GOOD OCCUPANCY (65-80%). ";
    if (adr < competitorRates.avgCompetitorRate * 0.9) {
      text += "Room to increase rates as historical pricing is below competition. ";
      recommendation = "📈 Raise ADR Gradually";
      focus = "Rate & Occupancy Balance";
    } else {
      text += "Maintain current strategy based on historical patterns. ";
      recommendation = "⚖️ Maintain Strategy";
      focus = "Balanced Approach";
    }
  } else if (occ > 50) {
    text = "⚠️ Your hotel shows MODERATE OCCUPANCY (50-65%). ";
    text += "Let historical patterns guide your strategy. ";
    recommendation = "📊 Monitor Demand";
    focus = "Let History Guide You";
  } else {
    text = "🔍 Your hotel shows LOWER OCCUPANCY (<50%) historically during this period. ";
    text += "This may be a seasonal pattern. Consider targeted promotions only if you need to outperform historical trends. ";
    recommendation = "🎯 Strategic Promotions";
    focus = "Selective Action";
  }
  
  if (demandAnalysis.highDemandDays.length > 0) {
    text += ` High demand typically occurs on ${demandAnalysis.highDemandDays.slice(0, 3).join(", ")}. `;
  }
  
  if (demandAnalysis.lowDemandDays.length > 0) {
    text += ` Lower demand patterns on ${demandAnalysis.lowDemandDays.slice(0, 2).join(", ")} - this is normal. `;
  }
  
  const html = `
    <div style="display: flex; align-items: flex-start; gap: 20px; flex-wrap: wrap;">
      <div style="flex: 1;">
        <h3 style="margin: 0 0 10px 0; color: white;">📝 Executive Summary</h3>
        <p style="line-height: 1.6; font-size: 14px;">${text}</p>
      </div>
      <div style="text-align: center; min-width: 150px;">
        <div style="background: rgba(255,255,255,0.1); border-radius: 12px; padding: 12px;">
          <div style="font-size: 11px; opacity: 0.8;">Recommendation</div>
          <div style="font-size: 18px; font-weight: 700; margin: 5px 0;">${recommendation}</div>
          <div style="font-size: 11px; opacity: 0.8;">${focus}</div>
        </div>
      </div>
    </div>
  `;
  
  document.getElementById("summaryCard").innerHTML = html;
}

function renderRateRecommendations(kpis, dowAnalysis, competitorRates, isCurrentFuture) {
  const compAvg = competitorRates.avgCompetitorRate;
  const yourADR = kpis.adr;
  
  const weekendOcc = dowAnalysis.weekendOcc;
  const weekdayOcc = dowAnalysis.weekdayOcc;
  
  let weekendMultiplier = 1.0;
  let weekdayMultiplier = 1.0;
  let weekendAction = "";
  let weekdayAction = "";
  let weekendRec = "";
  let weekdayRec = "";
  
  if (weekendOcc > 75) {
    weekendMultiplier = 1.08;
    weekendAction = "📈 Increase";
    weekendRec = "High weekend demand. You have pricing power on weekends.";
  } else if (weekendOcc > 60) {
    weekendMultiplier = 1.04;
    weekendAction = "↗️ Slight Increase";
    weekendRec = "Good weekend demand. Consider small rate increases.";
  } else if (weekendOcc > 45) {
    weekendMultiplier = 1.00;
    weekendAction = "⚖️ Maintain";
    weekendRec = "Moderate weekend demand. Maintain current rates.";
  } else {
    weekendMultiplier = 0.97;
    weekendAction = "🎁 Value Add";
    weekendRec = "Weekend demand is soft. Consider packages or promotions.";
  }
  
  if (weekdayOcc > 65) {
    weekdayMultiplier = 1.05;
    weekdayAction = "📈 Increase";
    weekdayRec = "Strong weekday occupancy. You can push rates slightly.";
  } else if (weekdayOcc > 50) {
    weekdayMultiplier = 1.00;
    weekdayAction = "⚖️ Maintain";
    weekdayRec = "Moderate weekday occupancy. Maintain current strategy.";
  } else {
    weekdayMultiplier = 0.95;
    weekdayAction = "📉 Discount";
    weekdayRec = "Low weekday occupancy. Consider targeted promotions.";
  }
  
  let compAdjustment = 1.0;
  if (yourADR < compAvg * 0.85) {
    compAdjustment = 1.05;
  } else if (yourADR > compAvg * 1.15) {
    compAdjustment = 0.97;
  }
  
  const weekdaySuggested = Math.round(yourADR * weekdayMultiplier * compAdjustment / 10) * 10;
  const weekendSuggested = Math.round(yourADR * weekendMultiplier * compAdjustment / 10) * 10;
  
  const html = `
    <div style="margin-bottom: 15px;">
      <div style="background: #f0fdf4; padding: 10px; border-radius: 8px; margin-bottom: 10px;">
        <strong>🏨 Your Historical ADR:</strong> ${formatCurrency(yourADR)}<br>
        <strong>🏨 Your Historical Occupancy:</strong> ${kpis.occupancy.toFixed(1)}%<br>
        <strong>🏨 Competitor Average:</strong> ${formatCurrency(compAvg)}
      </div>
    </div>
    <div style="background: #f0fdf4; border-left: 3px solid #15803d; padding: 12px; margin-bottom: 12px; border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
        <div>
          <strong>Weekdays (Mon-Thu)</strong>
          <div style="font-size: 13px; color: #4b5563; margin-top: 4px;">${weekdayRec}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 700; color: #15803d;">${weekdayAction}</div>
          <div style="font-size: 11px; color: #6b7280;">Suggested: ${formatCurrency(weekdaySuggested)}</div>
        </div>
      </div>
    </div>
    <div style="background: #fef3c7; border-left: 3px solid #ca8a04; padding: 12px; margin-bottom: 12px; border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
        <div>
          <strong>Weekends (Fri-Sun)</strong>
          <div style="font-size: 13px; color: #4b5563; margin-top: 4px;">${weekendRec}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 700; color: #ca8a04;">${weekendAction}</div>
          <div style="font-size: 11px; color: #6b7280;">Suggested: ${formatCurrency(weekendSuggested)}</div>
        </div>
      </div>
    </div>
  `;
  
  document.getElementById("rateRecommendations").innerHTML = html;
}

function renderRevenueTriangle(kpis, dowAnalysis, isCurrentFuture) {
  let insight = "";
  let action = "";
  
  const occ = kpis.occupancy;
  const adr = kpis.adr;
  
  if (occ < 60 && adr > 1500) {
    insight = "Historical patterns show you prioritize rate over occupancy.";
    action = "Trust your historical demand - consider small value-adds rather than rate cuts.";
  } else if (occ > 85 && adr < 1200) {
    insight = "Historical patterns show high occupancy with lower rates.";
    action = "You have pricing power! Increase rates on historically strong days.";
  } else if (occ > 75 && adr > 1800) {
    insight = "Excellent historical balance!";
    action = "Monitor and maintain - small increases on peak days only.";
  } else {
    insight = "Historical patterns show balanced performance.";
    action = "Let historical demand guide your strategy.";
  }
  
  const html = `
    <div style="text-align: center; margin-bottom: 15px;">
      <div style="display: inline-block; background: #f1f5f9; border-radius: 50%; width: 120px; height: 120px; line-height: 120px; margin-bottom: 10px;">
        <span style="font-size: 28px; font-weight: 700;">${Math.round(kpis.revpar)}</span>
      </div>
      <div><strong>Current RevPAR</strong></div>
    </div>
    
    <div style="margin-bottom: 15px;">
      <div style="background: #e0f2fe; padding: 10px; border-radius: 8px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between;">
          <span>Historical Occupancy:</span>
          <span><strong>${kpis.occupancy.toFixed(1)}%</strong></span>
        </div>
      </div>
      <div style="background: #dcfce7; padding: 10px; border-radius: 8px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between;">
          <span>Historical ADR:</span>
          <span><strong>${formatCurrency(kpis.adr)}</strong></span>
        </div>
      </div>
    </div>
    
    <div style="background: #fef3c7; padding: 10px; border-radius: 8px;">
      <strong>💡 ${insight}</strong>
      <div style="font-size: 12px; margin-top: 5px; color: #92400e;">${action}</div>
    </div>
  `;
  
  document.getElementById("revenueTriangle").innerHTML = html;
}

function renderDemandCalendar(demandAnalysis, monthPerf) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const futureDates = monthPerf.filter(r => {
    const checkDate = new Date(r.stay_date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate >= today;
  }).map(r => r.stay_date).sort();
  
  if (futureDates.length === 0) {
    document.getElementById("demandCalendar").innerHTML = `
      <div style="text-align: center; padding: 40px; background: #fef3c7; border-radius: 12px;">
        <div style="font-size: 48px; margin-bottom: 16px;">📅</div>
        <h3>No upcoming dates in this month</h3>
        <p>All dates in ${formatMonthLabel(monthKeys[currentMonthIndex])} have passed.</p>
        <p style="font-size: 13px; margin-top: 8px;">Use the month navigator to view future months.</p>
      </div>
    `;
    return;
  }
  
  let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
  
  futureDates.forEach(date => {
    const [year, month, day] = date.split("-");
    const displayDate = `${day}/${month}`;
    const dow = getDayOfWeek(date);
    
    const dayData = monthPerf.find(r => r.stay_date === date);
    const occ = dayData ? (dayData.rooms_sold / roomsAvailable) * 100 : 0;
    
    let demandLevel = "Medium";
    let bgColor = "#fef3c7";
    let textColor = "#92400e";
    
    if (occ > 75) {
      demandLevel = "High";
      bgColor = "#dcfce7";
      textColor = "#166534";
    } else if (occ < 50) {
      demandLevel = "Low";
      bgColor = "#fee2e2";
      textColor = "#991b1b";
    }
    
    let recommendation = "";
    if (occ > 75) {
      recommendation = "💰 Push rates";
    } else if (occ > 60) {
      recommendation = "⚖️ Maintain rates";
    } else if (occ > 45) {
      recommendation = "📊 Let demand come";
    } else {
      recommendation = "🎯 Strategic offers only";
    }
    
    const isToday = new Date(date).toDateString() === new Date().toDateString();
    const todayBadge = isToday ? '<span style="background: #1e293b; color: white; padding: 2px 8px; border-radius: 12px; font-size: 10px; margin-left: 8px;">TODAY</span>' : '';
    
    html += `
      <div style="background: ${bgColor}; padding: 10px 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
        <div style="font-weight: 600; color: ${textColor};">
          <strong>${displayDate}</strong> - ${dow} ${todayBadge}
        </div>
        <div style="display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
          <span style="background: rgba(0,0,0,0.05); padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; color: ${textColor};">
            ${demandLevel} Demand
          </span>
          <span style="font-size: 12px; color: ${textColor};">
            ${recommendation}
          </span>
          <span style="font-size: 11px; color: ${textColor}; opacity: 0.7;">
            ${occ.toFixed(0)}% Occ
          </span>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  document.getElementById("demandCalendar").innerHTML = html;
}

function renderDayStrategy(monthPerf, monthComp, roomsAvailable, isCurrentFuture) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const futureDates = monthPerf.filter(r => {
    const checkDate = new Date(r.stay_date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate >= today;
  }).sort((a, b) => a.stay_date.localeCompare(b.stay_date));
  
  if (futureDates.length === 0 && isCurrentFuture) {
    const noDatesHtml = `
      <div style="text-align: center; padding: 40px; background: #fef3c7; border-radius: 12px;">
        <div style="font-size: 48px; margin-bottom: 16px;">📅</div>
        <h3>No upcoming dates in this month</h3>
        <p>All dates in ${formatMonthLabel(monthKeys[currentMonthIndex])} have passed.</p>
      </div>
    `;
    document.getElementById("strategyTable").innerHTML = noDatesHtml;
    return;
  }
  
  let html = `
    <div style="font-size: 11px; color: #64748b; margin-bottom: 12px; padding: 8px; background: #f1f5f9; border-radius: 6px;">
      ℹ️ Rate suggestions based on historical day-of-week patterns and competitor positioning.
    </div>
    <div style="overflow-x: auto;">
      <table class="detailed-table" style="width: 100%; border-collapse: collapse; min-width: 700px;">
        <thead>
          <tr><th>Date</th><th>DOW</th><th>Your Rate</th><th>Comp Avg</th><th>Recommendation</th><th>Suggested Rate</th></table>
        </thead>
        <tbody>
  `;
  
  for (const day of futureDates) {
    const date = day.stay_date;
    const [year, month, dayNum] = date.split("-");
    const displayDate = `${dayNum}/${month}`;
    const dow = getDayOfWeek(date);
    
    const compData = monthComp.find(c => c.stay_date === date);
    let currentRate = compData ? compData.your_rate : null;
    
    if (currentRate === null || currentRate === undefined || currentRate === 0) {
      currentRate = null;
    }
    
    const compAvg = compData && compData.comps && compData.comps.length > 0 
      ? compData.comps.reduce((a,b) => a + b, 0) / compData.comps.length 
      : null;
    
    let suggestedRate = null;
    let recommendation = "";
    let bgColor = "";
    let rateDisplay = "";
    
    const isToday = new Date(date).toDateString() === new Date().toDateString();
    const todayBadge = isToday ? ' <span style="color: #3b82f6;">(TODAY)</span>' : '';
    
    if (!currentRate && !compAvg) {
      rateDisplay = '<span style="color: #94a3b8;">—</span>';
      suggestedRate = null;
      recommendation = "No rate data available";
      bgColor = "#f1f5f9";
    } else if (currentRate && compAvg) {
      rateDisplay = formatCurrency(currentRate);
      suggestedRate = currentRate;
      recommendation = compAvg > currentRate ? "Below competitors - consider increase" : "At or above competitors - maintain";
      bgColor = "#f0fdf4";
    } else if (currentRate && !compAvg) {
      rateDisplay = formatCurrency(currentRate);
      suggestedRate = currentRate;
      recommendation = "Maintain current rate";
      bgColor = "#fef3c7";
    } else if (!currentRate && compAvg) {
      rateDisplay = '<span style="color: #94a3b8;">—</span>';
      suggestedRate = Math.round(compAvg / 10) * 10;
      recommendation = "Use competitor rate as baseline";
      bgColor = "#fef3c7";
    }
    
    html += `
      <tr style="background: ${bgColor};">
        <td style="padding: 8px;">${displayDate}${todayBadge}</td>
        <td style="padding: 8px;">${dow}</td>
        <td style="padding: 8px; text-align: right;">${rateDisplay}</td>
        <td style="padding: 8px; text-align: right;">${compAvg ? formatCurrency(compAvg) : '-'}</td>
        <td style="padding: 8px; font-size: 11px;">${recommendation}</td>
        <td style="padding: 8px; text-align: right;"><strong>${suggestedRate ? formatCurrency(suggestedRate) : '—'}</strong></td>
      </tr>
    `;
  }
  
  html += '</tbody></table></div>';
  document.getElementById("strategyTable").innerHTML = html;
}
