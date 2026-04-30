console.log("rate-intelligence.js loaded - COMPLETE FIX VERSION (Past/Future logic)");

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
let roomsAvailable = 6;
let allSnapshots = [];
let allMonthsWithData = new Set();
let historicalDOWPatterns = null; // Store DOW patterns from historical data

// ─────────────────────────────────────────────
// On load
// ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("ownerToken");
  if (!token) { 
    window.location.href = "index.html"; 
    return; 
  }

  roomsAvailable = parseInt(localStorage.getItem("roomsAvailable") || "6", 10);
  
  const savedHotelId = localStorage.getItem("hotelId");
  if (savedHotelId) {
    localStorage.setItem("hotelId", savedHotelId);
  }
  
  document.getElementById("prevMonth").addEventListener("click", navigatePrevMonth);
  document.getElementById("nextMonth").addEventListener("click", navigateNextMonth);

  loadDashboardData();
});

// ─────────────────────────────────────────────
// Helper: Check if date is in the past
// ─────────────────────────────────────────────
function isPastDate(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  return checkDate < today;
}

function isTodayDate(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  return checkDate.getTime() === today.getTime();
}

function isFutureDate(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  return checkDate > today;
}

// ─────────────────────────────────────────────
// Get forecasted occupancy for a specific date
// ─────────────────────────────────────────────
function getForecastedOccupancyForDate(date, baseForecastOcc) {
  if (!historicalDOWPatterns) {
    // Default DOW patterns if no historical data
    const defaultPatterns = {
      'Monday': 0.92, 'Tuesday': 0.94, 'Wednesday': 0.96,
      'Thursday': 0.95, 'Friday': 1.02, 'Saturday': 1.10, 'Sunday': 1.05
    };
    const dowName = date.toLocaleDateString('en-ZA', { weekday: 'long' });
    const factor = defaultPatterns[dowName] || 1.0;
    return Math.min(95, Math.max(5, baseForecastOcc * factor));
  }
  
  const dowName = date.toLocaleDateString('en-ZA', { weekday: 'long' });
  const avgPattern = historicalDOWPatterns[dowName] || 0.5;
  // Normalize pattern to get factor
  const allValues = Object.values(historicalDOWPatterns);
  const avgAll = allValues.reduce((a,b) => a + b, 0) / allValues.length;
  const factor = avgAll > 0 ? avgPattern / avgAll : 1.0;
  return Math.min(95, Math.max(5, baseForecastOcc * factor));
}

// ─────────────────────────────────────────────
// Navigation functions
// ─────────────────────────────────────────────
let currentDisplayYear = null;
let currentDisplayMonth = null;

function navigatePrevMonth() {
  if (currentDisplayYear !== null && currentDisplayMonth !== null) {
    currentDisplayMonth--;
    if (currentDisplayMonth < 0) {
      currentDisplayMonth = 11;
      currentDisplayYear--;
    }
    loadDataForYearMonth(currentDisplayYear, currentDisplayMonth);
  } else if (currentMonthIndex > 0) {
    currentMonthIndex--;
    loadMonthData();
  }
}

function navigateNextMonth() {
  if (currentDisplayYear !== null && currentDisplayMonth !== null) {
    currentDisplayMonth++;
    if (currentDisplayMonth > 11) {
      currentDisplayMonth = 0;
      currentDisplayYear++;
    }
    loadDataForYearMonth(currentDisplayYear, currentDisplayMonth);
  } else if (currentMonthIndex < monthKeys.length - 1) {
    currentMonthIndex++;
    loadMonthData();
  } else if (monthKeys.length > 0) {
    const lastMonth = monthKeys[monthKeys.length - 1];
    const [lastYear, lastMonthNum] = lastMonth.split('-').map(Number);
    currentDisplayYear = lastYear;
    currentDisplayMonth = lastMonthNum - 1;
    currentDisplayMonth++;
    if (currentDisplayMonth > 11) {
      currentDisplayMonth = 0;
      currentDisplayYear++;
    }
    loadDataForYearMonth(currentDisplayYear, currentDisplayMonth);
  }
}

function loadDataForYearMonth(year, month) {
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthName = new Date(year, month, 1).toLocaleString('en-ZA', { month: 'long', year: 'numeric' });
  document.getElementById("monthLabel").textContent = monthName;
  
  const hasData = allMonthsWithData.has(monthKey);
  
  if (hasData) {
    loadHistoricalMonth(monthKey);
  } else {
    loadForecastForMonth(monthKey, monthName);
  }
}

// ─────────────────────────────────────────────
// Load Historical Data
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
      currentDisplayYear = today.getFullYear();
      currentDisplayMonth = today.getMonth();
      loadDataForYearMonth(currentDisplayYear, currentDisplayMonth);
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
    
    allDailyPerf.forEach(r => {
      if (r.stay_date && r.stay_date.length >= 7) {
        allMonthsWithData.add(r.stay_date.substring(0, 7));
      }
    });
    
    monthKeys = Array.from(allMonthsWithData).sort();
    
    // Calculate historical DOW patterns for forecasting
    historicalDOWPatterns = calculateDOWAverages(allDailyPerf, roomsAvailable).occupancy;
    
    console.log("Months with data:", monthKeys);
    console.log("Historical DOW patterns:", historicalDOWPatterns);
    
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    
    if (allMonthsWithData.has(currentMonthKey)) {
      loadHistoricalMonth(currentMonthKey);
    } else {
      currentDisplayYear = today.getFullYear();
      currentDisplayMonth = today.getMonth();
      loadDataForYearMonth(currentDisplayYear, currentDisplayMonth);
    }
  })
  .catch(err => {
    console.error("Error loading data:", err);
    const today = new Date();
    currentDisplayYear = today.getFullYear();
    currentDisplayMonth = today.getMonth();
    loadDataForYearMonth(currentDisplayYear, currentDisplayMonth);
  });
}

// ─────────────────────────────────────────────
// Load historical month data
// ─────────────────────────────────────────────
function loadHistoricalMonth(monthKey) {
  const monthPerf = allDailyPerf.filter(r => r.stay_date && r.stay_date.startsWith(monthKey));
  const monthComp = allDailyComp.filter(r => r.stay_date && r.stay_date.startsWith(monthKey));
  
  if (monthPerf.length === 0) {
    const [year, month] = monthKey.split('-');
    loadDataForYearMonth(parseInt(year), parseInt(month) - 1);
    return;
  }
  
  const [year, month] = monthKey.split('-');
  currentDisplayYear = parseInt(year);
  currentDisplayMonth = parseInt(month) - 1;
  
  const monthName = new Date(currentDisplayYear, currentDisplayMonth, 1).toLocaleString('en-ZA', { month: 'long', year: 'numeric' });
  document.getElementById("monthLabel").textContent = monthName;
  
  const kpis = computeMonthlyKPIs(monthPerf, roomsAvailable);
  const dowAnalysis = analyzeDOWPatterns(monthPerf, roomsAvailable);
  const demandAnalysis = analyzeDemand(monthPerf, roomsAvailable);
  const competitorRates = analyzeCompetitorRates(monthComp);
  
  renderExecutiveSummary(kpis, dowAnalysis, demandAnalysis, competitorRates, monthKey);
  renderRateRecommendations(kpis, dowAnalysis, competitorRates);
  renderRevenueTriangle(kpis);
  renderDemandCalendarSmart(monthPerf, monthKey);
  renderDayStrategySmart(monthPerf, monthComp, monthKey);
}

// ─────────────────────────────────────────────
// Forecast for month with no data
// ─────────────────────────────────────────────
async function loadForecastForMonth(monthKey, monthName) {
  const token = localStorage.getItem("ownerToken");
  const hotelId = localStorage.getItem("hotelId") || "ELLIPSE001";
  
  document.getElementById("monthLabel").textContent = monthName;
  
  const summaryCard = document.getElementById("summaryCard");
  summaryCard.innerHTML = `<div style="text-align: center; padding: 40px;">🔮 Loading forecast for ${monthName}...</div>`;
  
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
        rooms_available: roomsAvailable
      })
    });
    
    const forecast = await response.json();
    renderForecastUI(forecast, monthKey, monthName);
    
  } catch (err) {
    console.error("Forecast error:", err);
    renderForecastUI({
      forecast_occupancy: 45,
      forecast_adr_min: 1200,
      forecast_adr_max: 1600,
      forecast_revpar: 600,
      confidence: 30,
      method: "Default (No Data)"
    }, monthKey, monthName);
  }
}

function renderForecastUI(forecast, monthKey, monthName) {
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
  
  const summaryCard = document.getElementById("summaryCard");
  summaryCard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
      <div>
        <h3 style="margin: 0 0 8px 0; color: white;">🔮 FORECAST MODE</h3>
        <p style="margin: 0; opacity: 0.9;">${monthName} - No historical data yet</p>
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
  
  const rateRecs = document.getElementById("rateRecommendations");
  const suggestedRate = Math.round(forecastAdr);
  
  rateRecs.innerHTML = `
    <div style="margin-bottom: 20px;">
      <div style="font-size: 32px; font-weight: bold; color: #2563eb;">R ${suggestedRate.toLocaleString()}</div>
      <div style="color: #6b7280;">Suggested Rate for ${monthName}</div>
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
  `;
  
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
  
  renderForecastCalendarSmart(forecast, monthKey);
  renderForecastStrategyTableSmart(forecast, monthKey);
}

// ─────────────────────────────────────────────
// SMART DEMAND CALENDAR - Shows forecast for future dates
// ─────────────────────────────────────────────
function renderDemandCalendarSmart(monthPerf, monthKey) {
  const calendarDiv = document.getElementById("demandCalendar");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = [];
  
  // Get forecast base for this month
  let baseForecastOcc = 45;
  if (allDailyPerf.length > 0) {
    const last30Days = allDailyPerf.slice(-30);
    const last30KPIs = computeMonthlyKPIs(last30Days, roomsAvailable);
    baseForecastOcc = last30KPIs.occupancy;
  }
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const date = new Date(year, month - 1, day);
    const dayData = monthPerf.find(r => r.stay_date === dateStr);
    let occ = dayData ? (dayData.rooms_sold / roomsAvailable) * 100 : 0;
    const dayOfWeek = date.toLocaleDateString('en-ZA', { weekday: 'short' });
    const isToday = date.toDateString() === today.toDateString();
    const isPast = date < today;
    const isFuture = date > today;
    
    // KEY LOGIC: For future dates with no actual data, use forecast
    if (occ === 0 && isFuture) {
      occ = getForecastedOccupancyForDate(date, baseForecastOcc);
    }
    
    let demandLevel = "Medium";
    let bgColor = "#fef3c7";
    let textColor = "#92400e";
    let recommendation = "";
    
    if (occ > 75) {
      demandLevel = "High";
      bgColor = "#dcfce7";
      textColor = "#166534";
      recommendation = "💰 Push rates";
    } else if (occ > 60) {
      demandLevel = "Good";
      bgColor = "#dbeafe";
      textColor = "#1e40af";
      recommendation = "⚖️ Maintain rates";
    } else if (occ > 45) {
      demandLevel = "Moderate";
      bgColor = "#fef3c7";
      textColor = "#92400e";
      recommendation = "📊 Let demand come";
    } else if (occ > 0) {
      demandLevel = "Low";
      bgColor = "#fee2e2";
      textColor = "#991b1b";
      recommendation = "🎯 Strategic offers only";
    } else if (isFuture) {
      demandLevel = "Forecast";
      bgColor = "#e0f2fe";
      textColor = "#0369a1";
      recommendation = `📈 Predicted ${Math.round(occ)}%`;
    } else {
      demandLevel = "No Data";
      bgColor = "#f1f5f9";
      textColor = "#64748b";
      recommendation = "No data recorded";
    }
    
    days.push(`
      <div style="padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; background: ${bgColor}; ${isToday ? 'border: 2px solid #3b82f6;' : ''}">
        <div style="font-weight: bold;">${day} ${dayOfWeek}${isToday ? ' 🔴' : ''}</div>
        <div style="font-size: 20px; font-weight: bold; color: ${textColor};">
          ${occ > 0 ? Math.round(occ) + '%' : (isPast ? '—' : (isFuture ? '📈' : '?'))}
        </div>
        <div style="font-size: 11px; color: ${textColor};">${recommendation}</div>
      </div>
    `);
  }
  
  calendarDiv.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px;">
      ${days.join('')}
    </div>
    <div style="margin-top: 12px; font-size: 11px; color: #6b7280; text-align: center;">
      📈 Future dates show forecasted occupancy based on historical patterns
    </div>
  `;
}

// ─────────────────────────────────────────────
// SMART DAY STRATEGY - Suggestions only for today and future
// ─────────────────────────────────────────────
function renderDayStrategySmart(monthPerf, monthComp, monthKey) {
  const table = document.getElementById("strategyTable");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  
  const dowAverages = calculateDOWAverages(allDailyPerf, roomsAvailable);
  
  // Get forecast base
  let baseForecastOcc = 45;
  if (allDailyPerf.length > 0) {
    const last30Days = allDailyPerf.slice(-30);
    const last30KPIs = computeMonthlyKPIs(last30Days, roomsAvailable);
    baseForecastOcc = last30KPIs.occupancy;
  }
  
  let html = `
    <div style="font-size: 11px; color: #64748b; margin-bottom: 12px; padding: 8px; background: #f1f5f9; border-radius: 6px;">
      ℹ️ Rate suggestions for TODAY and FUTURE dates only (based on forecast). Past dates are for reference.
    </div>
    <div style="overflow-x: auto;">
      <table class="detailed-table" style="width: 100%; border-collapse: collapse; min-width: 800px;">
        <thead>
          <tr style="background: #f1f5f9;">
            <th style="padding: 12px;">Date</th><th style="padding: 12px;">DOW</th><th style="padding: 12px;">Rooms Sold</th><th style="padding: 12px;">Occupancy</th><th style="padding: 12px;">Your Rate</th><th style="padding: 12px;">Comp Avg</th><th style="padding: 12px;">Recommendation</th><th style="padding: 12px;">Suggested Rate</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const date = new Date(year, month - 1, day);
    const displayDate = `${day}/${String(month).padStart(2, '0')}`;
    const dow = date.toLocaleDateString('en-ZA', { weekday: 'short' });
    const isPast = date < today;
    const isToday = date.toDateString() === today.toDateString();
    const isFuture = date > today;
    
    const dayData = monthPerf.find(r => r.stay_date === dateStr);
    const compData = monthComp.find(c => c.stay_date === dateStr);
    
    let roomsSold = dayData ? dayData.rooms_sold : 0;
    let occupancy = roomsAvailable > 0 ? (roomsSold / roomsAvailable) * 100 : 0;
    const currentRate = compData ? compData.your_rate : null;
    const compAvg = compData && compData.comps && compData.comps.length > 0 
      ? compData.comps.reduce((a,b) => a + b, 0) / compData.comps.length 
      : null;
    
    const dowName = date.toLocaleDateString('en-ZA', { weekday: 'long' });
    const dowOccAvg = dowAverages.occupancy[dowName] || 50;
    
    // For future dates with no actual data, use forecast
    if (roomsSold === 0 && isFuture) {
      occupancy = getForecastedOccupancyForDate(date, baseForecastOcc);
    }
    
    let suggestedRate = null;
    let recommendation = "";
    let bgColor = "#ffffff";
    let statusText = "";
    
    // PAST DATES: No suggestions
    if (isPast) {
      statusText = "📅 Historical (Closed)";
      suggestedRate = null;
      bgColor = "#f8fafc";
    }
    // TODAY: Show suggestion based on actual or forecast
    else if (isToday) {
      statusText = "🔴 TODAY";
      if (currentRate) {
        if (compAvg && compAvg > currentRate * 1.05) {
          suggestedRate = Math.round(currentRate * 1.03 / 10) * 10;
          recommendation = "Below competitors - increase";
          bgColor = "#f0fdf4";
        } else if (compAvg && compAvg < currentRate * 0.95) {
          suggestedRate = Math.round(currentRate * 0.97 / 10) * 10;
          recommendation = "Above competitors - decrease";
          bgColor = "#fef2f2";
        } else {
          suggestedRate = currentRate;
          recommendation = "Maintain current rate";
          bgColor = "#fef3c7";
        }
      } else if (compAvg) {
        const factor = dowOccAvg > 60 ? 1.05 : (dowOccAvg > 45 ? 1.0 : 0.98);
        suggestedRate = Math.round(compAvg * factor / 10) * 10;
        recommendation = "Use competitor rate + DOW adjustment";
        bgColor = "#e0f2fe";
      } else {
        const baseRate = 1500;
        const factor = dowOccAvg > 60 ? 1.05 : (dowOccAvg > 45 ? 1.0 : 0.98);
        suggestedRate = Math.round(baseRate * factor / 10) * 10;
        recommendation = "Use market average + DOW adjustment";
        bgColor = "#f1f5f9";
      }
    }
    // FUTURE DATES: Show forecast suggestion
    else if (isFuture) {
      statusText = "🔮 Future";
      const baseRate = currentRate || 1500;
      const factor = occupancy > 60 ? 1.05 : (occupancy > 45 ? 1.0 : 0.97);
      suggestedRate = Math.round(baseRate * factor / 10) * 10;
      recommendation = occupancy > 60 ? "Expected demand - increase" : (occupancy > 45 ? "Maintain" : "Soft demand - value add");
      bgColor = occupancy > 60 ? "#f0fdf4" : (occupancy > 45 ? "#fef3c7" : "#fef2f2");
    }
    
    const todayBadge = isToday ? ' 🔴 TODAY' : '';
    const pastBadge = isPast ? ' (Past)' : '';
    const rateDisplay = suggestedRate ? formatCurrency(suggestedRate) : (isPast ? '—' : '—');
    
    html += `
      <tr style="background: ${bgColor};">
        <td style="padding: 10px;">${displayDate}${todayBadge}${pastBadge}</td>
        <td style="padding: 10px;">${dow}</td>
        <td style="padding: 10px; text-align: right;">${roomsSold}</td>
        <td style="padding: 10px; text-align: right;">${occupancy.toFixed(1)}%</td>
        <td style="padding: 10px; text-align: right;">${currentRate ? formatCurrency(currentRate) : '—'}</td>
        <td style="padding: 10px; text-align: right;">${compAvg ? formatCurrency(compAvg) : '—'}</td>
        <td style="padding: 10px; font-size: 12px;">${recommendation || statusText}</td>
        <td style="padding: 10px; text-align: right;"><strong>${rateDisplay}</strong></td>
      </tr>
    `;
  }
  
  html += '</tbody></table></div>';
  table.innerHTML = html;
}

// ─────────────────────────────────────────────
// FORECAST CALENDAR (Full forecast month)
// ─────────────────────────────────────────────
function renderForecastCalendarSmart(forecast, monthKey) {
  const calendarDiv = document.getElementById("demandCalendar");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = [];
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.toLocaleDateString('en-ZA', { weekday: 'short' });
    const isWeekend = dayOfWeek === 'Sat' || dayOfWeek === 'Sun';
    const isToday = date.toDateString() === today.toDateString();
    const isPast = date < today;
    
    let demandScore, suggestedRate;
    
    if (isPast) {
      demandScore = 0;
      suggestedRate = 0;
    } else {
      // Use forecast + DOW pattern for more accurate prediction
      let baseOcc = forecast.forecast_occupancy;
      if (historicalDOWPatterns) {
        const dowName = date.toLocaleDateString('en-ZA', { weekday: 'long' });
        const avgPattern = historicalDOWPatterns[dowName] || 0.5;
        const allValues = Object.values(historicalDOWPatterns);
        const avgAll = allValues.reduce((a,b) => a + b, 0) / allValues.length;
        const factor = avgAll > 0 ? avgPattern / avgAll : (isWeekend ? 1.15 : 0.95);
        demandScore = Math.min(95, Math.max(5, baseOcc * factor));
      } else {
        demandScore = isWeekend ? baseOcc * 1.15 : baseOcc * 0.95;
      }
      suggestedRate = isWeekend ? forecast.forecast_adr_max : forecast.forecast_adr_min;
    }
    
    const bgColor = isPast ? "#f1f5f9" : (isWeekend ? "#fef3c7" : "#f8fafc");
    
    days.push(`
      <div style="padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; background: ${bgColor}; ${isToday ? 'border: 2px solid #3b82f6;' : ''}">
        <div style="font-weight: bold;">${day} ${dayOfWeek}${isToday ? ' 🔴' : ''}</div>
        ${isPast ? 
          '<div style="font-size: 14px; color: #64748b;">Past</div>' :
          `<div style="font-size: 20px; font-weight: bold; color: #f97316;">${Math.round(demandScore)}%</div>
           <div style="font-size: 12px;">R ${Math.round(suggestedRate)}</div>
           <div style="font-size: 10px;">${isWeekend ? 'Weekend' : 'Weekday'}</div>`
        }
      </div>
    `);
  }
  
  calendarDiv.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px;">
      ${days.join('')}
    </div>
    <div style="margin-top: 12px; font-size: 11px; color: #6b7280; text-align: center;">
      📈 Forecasted values based on historical patterns
    </div>
  `;
}

// ─────────────────────────────────────────────
// FORECAST STRATEGY TABLE
// ─────────────────────────────────────────────
function renderForecastStrategyTableSmart(forecast, monthKey) {
  const table = document.getElementById("strategyTable");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const forecastAdr = (forecast.forecast_adr_min + forecast.forecast_adr_max) / 2;
  
  let html = `
    <div style="font-size: 11px; color: #64748b; margin-bottom: 12px; padding: 8px; background: #f1f5f9; border-radius: 6px;">
      ℹ️ Forecasted rate recommendations for TODAY and FUTURE dates only.
    </div>
    <div style="overflow-x: auto;">
      <table class="detailed-table" style="width: 100%; border-collapse: collapse; min-width: 600px;">
        <thead>
          <tr style="background: #f1f5f9;">
            <th style="padding: 12px;">Date</th><th style="padding: 12px;">DOW</th><th style="padding: 12px;">Forecast Occupancy</th><th style="padding: 12px;">Suggested Rate</th><th style="padding: 12px;">Recommendation</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const displayDate = `${day}/${String(month).padStart(2, '0')}`;
    const dow = date.toLocaleDateString('en-ZA', { weekday: 'short' });
    const isWeekend = dow === 'Sat' || dow === 'Sun';
    const isPast = date < today;
    const isToday = date.toDateString() === today.toDateString();
    
    let occ, suggestedRate, recommendation;
    
    if (isPast) {
      occ = 0;
      suggestedRate = null;
      recommendation = "Past date - Closed";
    } else {
      // Use DOW patterns for more accurate forecast
      let baseOcc = forecast.forecast_occupancy;
      if (historicalDOWPatterns) {
        const dowName = date.toLocaleDateString('en-ZA', { weekday: 'long' });
        const avgPattern = historicalDOWPatterns[dowName] || 0.5;
        const allValues = Object.values(historicalDOWPatterns);
        const avgAll = allValues.reduce((a,b) => a + b, 0) / allValues.length;
        const factor = avgAll > 0 ? avgPattern / avgAll : (isWeekend ? 1.15 : 0.95);
        occ = Math.min(95, Math.max(5, baseOcc * factor));
      } else {
        occ = isWeekend ? baseOcc * 1.15 : baseOcc * 0.95;
      }
      suggestedRate = isWeekend ? forecast.forecast_adr_max : forecast.forecast_adr_min;
      recommendation = occ > 60 ? "Expected demand - increase rates" : (occ > 45 ? "Maintain current rate" : "Soft demand - consider value adds");
    }
    
    const todayBadge = isToday ? ' 🔴 TODAY' : '';
    const pastBadge = isPast ? ' (Past)' : '';
    const rateDisplay = suggestedRate ? formatCurrency(Math.round(suggestedRate)) : '—';
    
    html += `
      <tr style="background: ${isPast ? '#f1f5f9' : (isWeekend ? '#fef3c7' : '#ffffff')};">
        <td style="padding: 10px;">${displayDate}${todayBadge}${pastBadge}</td>
        <td style="padding: 10px;">${dow}</td>
        <td style="padding: 10px; text-align: center;"><strong>${isPast ? '—' : Math.round(occ) + '%'}</strong></td>
        <td style="padding: 10px; text-align: center;"><strong>${rateDisplay}</strong></td>
        <td style="padding: 10px; font-size: 12px;">${recommendation || 'No action needed'}</td>
      </tr>
    `;
  }
  
  html += '</tbody></table></div>';
  table.innerHTML = html;
}

// ─────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────
function computeMonthlyKPIs(perf, roomsAvailable) {
  const days = perf.length;
  const roomsSold = perf.reduce((a, r) => a + (r.rooms_sold || 0), 0);
  const revenue = perf.reduce((a, r) => a + (r.room_revenue || 0), 0);
  const occupancy = days ? (roomsSold / (roomsAvailable * days)) * 100 : 0;
  const adr = roomsSold ? revenue / roomsSold : 0;
  const revpar = days ? revenue / (roomsAvailable * days) : 0;
  return { occupancy, adr, revpar, revenue };
}

function analyzeDOWPatterns(perf, roomsAvailable) {
  const dowOcc = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [] };
  const dowMap = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };
  
  perf.forEach(r => {
    if (!r.stay_date) return;
    const date = new Date(r.stay_date);
    const dow = dowMap[date.getDay()];
    const occ = (r.rooms_sold / roomsAvailable) * 100;
    if (dowOcc[dow]) dowOcc[dow].push(occ);
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
    if (!r.stay_date) return;
    const date = new Date(r.stay_date);
    const dow = dowMap[date.getDay()];
    const occ = (r.rooms_sold / roomsAvailable) * 100;
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

function calculateDOWAverages(dailyData, roomsAvailable) {
  const dowMap = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };
  const dowOcc = { Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0 };
  const dowCount = { Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0 };
  
  dailyData.forEach(r => {
    if (!r.stay_date) return;
    const date = new Date(r.stay_date);
    const dow = dowMap[date.getDay()];
    const occ = (r.rooms_sold / roomsAvailable) * 100;
    dowOcc[dow] += occ;
    dowCount[dow]++;
  });
  
  for (let d in dowOcc) {
    if (dowCount[d] > 0) {
      dowOcc[d] = dowOcc[d] / dowCount[d];
    } else {
      dowOcc[d] = 50; // Default if no data
    }
  }
  
  return { occupancy: dowOcc };
}

function formatCurrency(value) {
  const cur = localStorage.getItem("currencySymbol") || "R";
  return `${cur} ${Math.round(value).toLocaleString()}`;
}

function renderExecutiveSummary(kpis, dowAnalysis, demandAnalysis, competitorRates, monthKey) {
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

function renderRateRecommendations(kpis, dowAnalysis, competitorRates) {
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

function renderRevenueTriangle(kpis) {
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
