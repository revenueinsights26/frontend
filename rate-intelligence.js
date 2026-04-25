console.log("rate-intelligence.js loaded - FULL VERSION with Forecast");

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
  
  document.getElementById("prevMonth").addEventListener("click", () => {
    if (currentMonthIndex > 0) { 
      currentMonthIndex--; 
      loadMonthData();
    } else {
      // Allow navigation to months BEFORE first data month (future months)
      const firstMonth = monthKeys[0];
      if (firstMonth) {
        const [firstYear, firstMonthNum] = firstMonth.split("-").map(Number);
        const targetDate = new Date(firstYear, firstMonthNum - 2, 1);
        const targetMonthKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
        loadForecastForMonth(targetMonthKey);
        currentMonthIndex = -1;
      }
    }
  });
  
  document.getElementById("nextMonth").addEventListener("click", () => {
    if (currentMonthIndex < monthKeys.length - 1) { 
      currentMonthIndex++; 
      loadMonthData();
    } else {
      // Navigate to months AFTER last data month
      const lastMonth = monthKeys[monthKeys.length - 1];
      if (lastMonth) {
        const [lastYear, lastMonthNum] = lastMonth.split("-").map(Number);
        let nextYear = lastYear;
        let nextMonth = lastMonthNum + 1;
        if (nextMonth > 12) {
          nextMonth = 1;
          nextYear++;
        }
        const nextMonthKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
        loadForecastForMonth(nextMonthKey);
        currentMonthIndex = monthKeys.length;
      }
    }
  });

  loadDashboardData();
});

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
      // No data at all - use forecast for current month
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
    monthKeys = extractMonths(allDailyPerf);
    
    if (monthKeys.length === 0 && allSnapshots.length === 0) {
      alert("No data available. Please upload data first.");
      window.location.href = "dashboard.html";
      return;
    }
    
    if (monthKeys.length === 0 && allSnapshots.length > 0) {
      // Have snapshots but no daily data - use forecast
      const today = new Date();
      const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      loadForecastForMonth(currentMonthKey);
      return;
    }
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
    const currentMonthKey = `${currentYear}-${currentMonth}`;
    
    let currentMonthIdx = monthKeys.indexOf(currentMonthKey);
    if (currentMonthIdx === -1) {
      // If current month not in data, find the closest or use last
      currentMonthIdx = monthKeys.length - 1;
    }
    
    currentMonthIndex = currentMonthIdx;
    loadMonthData();
  })
  .catch(err => {
    console.error("Error loading data:", err);
    // Fallback to forecast
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
  document.getElementById("monthLabel").textContent = formatMonthLabel(monthKey);
  
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
    // Fallback forecast
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
      <div style="display: flex; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
        <span>🏨 Historical ADR (last period):</span>
        <strong>R ${Math.round(lastAdr).toLocaleString()}</strong>
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
  
  // Demand Calendar
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
  
  const weekdayRate = Math.round(forecastAdr * 0.95);
  const weekendRate = Math.round(forecastAdr * 1.08);
  
  let html = `
    <div style="font-size: 11px; color: #64748b; margin-bottom: 12px; padding: 8px; background: #f1f5f9; border-radius: 6px;">
      ℹ️ Forecasted rate suggestions based on historical patterns and ${forecast.method}.
    </div>
    <table class="detailed-table" style="width: 100%; border-collapse: collapse;">
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
        <td style="padding: 10px; font-weight: 600;">${s.day}</td>
        <td style="padding: 10px; text-align: center;"><strong style="color: ${occColor};">${Math.round(occ)}%</strong></td>
        <td style="padding: 10px; text-align: center;"><strong>R ${suggested.toLocaleString()}</strong></td>
        <td style="padding: 10px; font-size: 12px;">${s.strategy}</td>
        <td style="padding: 10px; text-align: center;"><span style="background: ${confidenceColor}20; color: ${confidenceColor}; padding: 2px 8px; border-radius: 12px; font-size: 10px;">${confidenceText}</span></td>
      </tr>
    `;
  });
  
  html += '</tbody></table>';
  table.innerHTML = html;
}

// =========================================================
// LOAD MONTH WITH HISTORICAL DATA
// =========================================================

function loadMonthData() {
  const monthKey = monthKeys[currentMonthIndex];
  if (!monthKey) return;
  
  document.getElementById("monthLabel").textContent = formatMonthLabel(monthKey);
  
  const monthPerf = allDailyPerf.filter(r => r.stay_date && r.stay_date.startsWith(monthKey));
  const monthComp = allDailyComp.filter(r => r.stay_date && r.stay_date.startsWith(monthKey));
  
  if (monthPerf.length === 0) {
    // No data for this month - use forecast
    loadForecastForMonth(monthKey);
    return;
  }
  
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

// =========================================================
// Helper Functions for Historical Data
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

function renderExecutiveSummary(kpis, dowAnalysis, demandAnalysis, competitorRates, isCurrentFuture, monthKey) {
  let summary;
  
  if (!isCurrentFuture) {
    summary = {
      text: `📅 This is historical data for ${formatMonthLabel(monthKey)}. The insights below are for reference only.`,
      recommendation: "Historical View",
      focus: "For Reference Only"
    };
  } else {
    summary = generateExecutiveSummary(kpis, dowAnalysis, demandAnalysis, competitorRates);
  }
  
  const html = `
    <div style="display: flex; align-items: flex-start; gap: 20px; flex-wrap: wrap;">
      <div style="flex: 1;">
        <h3 style="margin: 0 0 10px 0; color: white;">📝 Executive Summary</h3>
        <p style="line-height: 1.6; font-size: 14px;">${summary.text}</p>
      </div>
      <div style="text-align: center; min-width: 150px;">
        <div style="background: rgba(255,255,255,0.1); border-radius: 12px; padding: 12px;">
          <div style="font-size: 11px; opacity: 0.8;">Recommendation</div>
          <div style="font-size: 18px; font-weight: 700; margin: 5px 0;">${summary.recommendation}</div>
          <div style="font-size: 11px; opacity: 0.8;">${summary.focus}</div>
        </div>
      </div>
    </div>
  `;
  
  document.getElementById("summaryCard").innerHTML = html;
}

function generateExecutiveSummary(kpis, dowAnalysis, demandAnalysis, competitorRates) {
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
  
  return { text, recommendation, focus };
}

function renderRateRecommendations(kpis, dowAnalysis, competitorRates, isCurrentFuture) {
  if (!isCurrentFuture) {
    const html = `
      <div style="text-align: center; padding: 40px 20px; color: #6b7280;">
        <div style="font-size: 48px; margin-bottom: 16px;">📅</div>
        <strong>Historical Month</strong>
        <p style="margin-top: 8px; font-size: 13px;">Rate recommendations are only available for current and future months.</p>
      </div>
    `;
    document.getElementById("rateRecommendations").innerHTML = html;
    return;
  }
  
  const recommendations = generateRateRecommendations(kpis, dowAnalysis, competitorRates);
  
  let html = `
    <div style="margin-bottom: 15px;">
      <div style="background: #f0fdf4; padding: 10px; border-radius: 8px; margin-bottom: 10px;">
        <strong>🏨 Your Historical ADR:</strong> ${formatCurrency(kpis.adr)}<br>
        <strong>🏨 Your Historical Occupancy:</strong> ${kpis.occupancy.toFixed(1)}%<br>
        <strong>🏨 Competitor Average:</strong> ${formatCurrency(competitorRates.avgCompetitorRate)}
      </div>
    </div>
  `;
  
  recommendations.forEach(rec => {
    const bgColor = rec.type === 'increase' ? '#f0fdf4' : (rec.type === 'decrease' ? '#fef2f2' : '#fef3c7');
    const borderColor = rec.type === 'increase' ? '#15803d' : (rec.type === 'decrease' ? '#b91c1c' : '#ca8a04');
    
    html += `
      <div style="background: ${bgColor}; border-left: 3px solid ${borderColor}; padding: 12px; margin-bottom: 12px; border-radius: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
          <div>
            <strong>${rec.dayType}</strong>
            <div style="font-size: 13px; color: #4b5563; margin-top: 4px;">${rec.recommendation}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 700; color: ${borderColor};">${rec.action}</div>
            <div style="font-size: 11px; color: #6b7280;">Suggested: ${formatCurrency(rec.suggestedRate)}</div>
          </div>
        </div>
      </div>
    `;
  });
  
  document.getElementById("rateRecommendations").innerHTML = html;
}

function generateRateRecommendations(kpis, dowAnalysis, competitorRates) {
  const recommendations = [];
  
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
  } else if (weekdayOcc > 35) {
    weekdayMultiplier = 0.98;
    weekdayAction = "🎁 Promotions";
    weekdayRec = "Weekday occupancy is soft. Consider corporate rates.";
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
  
  recommendations.push({
    dayType: "Weekdays (Mon-Thu)",
    recommendation: weekdayRec,
    action: weekdayAction,
    suggestedRate: weekdaySuggested,
    type: weekdayMultiplier > 1.02 ? "increase" : (weekdayMultiplier < 0.99 ? "decrease" : "neutral")
  });
  
  recommendations.push({
    dayType: "Weekends (Fri-Sun)",
    recommendation: weekendRec,
    action: weekendAction,
    suggestedRate: weekendSuggested,
    type: weekendMultiplier > 1.02 ? "increase" : (weekendMultiplier < 0.99 ? "decrease" : "neutral")
  });
  
  return recommendations;
}

function renderRevenueTriangle(kpis, dowAnalysis, isCurrentFuture) {
  const analysis = analyzeRevenueTriangle(kpis, dowAnalysis, isCurrentFuture);
  
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
        <div style="background: #bae6fd; height: 6px; border-radius: 3px; margin-top: 4px;">
          <div style="background: #0284c7; width: ${Math.min(kpis.occupancy, 100)}%; height: 6px; border-radius: 3px;"></div>
        </div>
      </div>
      
      <div style="background: #dcfce7; padding: 10px; border-radius: 8px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between;">
          <span>Historical ADR:</span>
          <span><strong>${formatCurrency(kpis.adr)}</strong></span>
        </div>
        <div style="background: #bbf7d0; height: 6px; border-radius: 3px; margin-top: 4px;">
          <div style="background: #16a34a; width: ${Math.min((kpis.adr / 4000) * 100, 100)}%; height: 6px; border-radius: 3px;"></div>
        </div>
      </div>
    </div>
    
    <div style="background: #fef3c7; padding: 10px; border-radius: 8px;">
      <strong>💡 ${analysis.insight}</strong>
      <div style="font-size: 12px; margin-top: 5px; color: #92400e;">${analysis.action}</div>
    </div>
  `;
  
  document.getElementById("revenueTriangle").innerHTML = html;
}

function analyzeRevenueTriangle(kpis, dowAnalysis, isCurrentFuture) {
  let insight = "";
  let action = "";
  
  const occ = kpis.occupancy;
  const adr = kpis.adr;
  
  if (!isCurrentFuture) {
    insight = "Historical performance data";
    action = "Use these patterns to inform future strategy.";
  } else if (occ < 60 && adr > 1500) {
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
  
  return { insight, action };
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
        <p style="font-size: 13px; margin-top: 8px;">Use the month navigator to view future months.</p>
      </div>
    `;
    document.getElementById("strategyTable").innerHTML = noDatesHtml;
    return;
  }
  
  const dowAverages = calculateDOWAverages(allDailyPerf, roomsAvailable);
  
  let html = `
    <div style="font-size: 11px; color: #64748b; margin-bottom: 12px; padding: 8px; background: #f1f5f9; border-radius: 6px;">
      ℹ️ Rate suggestions based on historical day-of-week patterns and competitor positioning.
    </div>
    <div style="overflow-x: auto;">
      <table class="detailed-table" style="width: 100%; border-collapse: collapse; min-width: 800px;">
        <thead>
          <tr><th>Date</th><th>DOW</th><th>Your Rate</th><th>Comp Avg</th><th>Recommendation</th><th>Suggested Rate</th><th>Confidence</th></tr>
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
    let isSoldOut = false;
    
    if (currentRate === null || currentRate === undefined || currentRate === 0 || currentRate === "-" || currentRate === "") {
      isSoldOut = true;
      currentRate = null;
    }
    
    const compAvg = compData && compData.comps && compData.comps.length > 0 
      ? compData.comps.reduce((a,b) => a + b, 0) / compData.comps.length 
      : null;
    
    const dowName = getDayOfWeekName(date);
    const dowOccAvg = dowAverages.occupancy[dowName] || 50;
    
    let suggestedRate = null;
    let confidenceScore = 0;
    let recommendation = "";
    let bgColor = "";
    let rateDisplay = "";
    let confidenceLevel = "";
    
    const isToday = new Date(date).toDateString() === new Date().toDateString();
    const todayBadge = isToday ? ' <span style="color: #3b82f6;">(TODAY)</span>' : '';
    
    if (isSoldOut) {
      rateDisplay = '<span style="color: #dc2626; font-weight: 600;">SOLD OUT</span>';
      if (compAvg) {
        suggestedRate = Math.round(compAvg * 1.15 / 10) * 10;
        recommendation = "Property sold out. Consider +15% for future dates.";
        confidenceScore = 60;
        confidenceLevel = "Medium";
        bgColor = "#fef3c7";
      } else if (dowOccAvg > 75) {
        suggestedRate = Math.round((dowOccAvg * 15) / 10) * 10;
        recommendation = "High historical demand. Consider rate increase.";
        confidenceScore = 50;
        confidenceLevel = "Medium";
        bgColor = "#fef3c7";
      } else {
        suggestedRate = null;
        recommendation = "Sold out - insufficient data for suggestion.";
        confidenceScore = 30;
        confidenceLevel = "Low";
        bgColor = "#f1f5f9";
      }
    } else if (currentRate && compAvg) {
      rateDisplay = formatCurrency(currentRate);
      const dowMultiplier = dowOccAvg > 60 ? 1.05 : (dowOccAvg > 45 ? 1.0 : 0.97);
      const compMultiplier = compAvg > currentRate * 1.05 ? 1.03 : (compAvg < currentRate * 0.95 ? 0.97 : 1.0);
      suggestedRate = Math.round(currentRate * dowMultiplier * compMultiplier / 10) * 10;
      confidenceScore = 70;
      confidenceLevel = "Medium";
      
      if (dowOccAvg > 70) {
        recommendation = `Historically high demand on ${dowName}s. Consider +${Math.round((dowMultiplier - 1) * 100)}% increase.`;
        bgColor = "#f0fdf4";
      } else if (dowOccAvg < 40) {
        recommendation = `Historically soft demand on ${dowName}s. Consider value-adds.`;
        bgColor = "#fef2f2";
      } else {
        recommendation = `Moderate historical demand on ${dowName}s. Maintain current strategy.`;
        bgColor = "#f8fafc";
      }
    } else if (currentRate && !compAvg) {
      rateDisplay = formatCurrency(currentRate);
      const dowMultiplier = dowOccAvg > 60 ? 1.03 : (dowOccAvg > 45 ? 1.0 : 0.98);
      suggestedRate = Math.round(currentRate * dowMultiplier / 10) * 10;
      confidenceScore = 55;
      confidenceLevel = "Low";
      
      if (dowOccAvg > 70) {
        recommendation = `Historically high demand on ${dowName}s. Consider +${Math.round((dowMultiplier - 1) * 100)}% increase.`;
        bgColor = "#f0fdf4";
      } else if (dowOccAvg < 40) {
        recommendation = `Historically soft demand on ${dowName}s. Consider value-adds.`;
        bgColor = "#fef2f2";
      } else {
        recommendation = `Maintain current rate for ${dowName}s.`;
        bgColor = "#fef3c7";
      }
    } else if (!currentRate && compAvg) {
      rateDisplay = '<span style="color: #94a3b8;">—</span>';
      const dowMultiplier = dowOccAvg > 60 ? 1.05 : (dowOccAvg > 45 ? 1.0 : 0.98);
      suggestedRate = Math.round(compAvg * dowMultiplier / 10) * 10;
      confidenceScore = 50;
      confidenceLevel = "Low";
      recommendation = `Use competitor average as baseline, adjusted for ${dowName} demand.`;
      bgColor = "#fef3c7";
    } else {
      rateDisplay = '<span style="color: #94a3b8;">—</span>';
      suggestedRate = null;
      recommendation = "Insufficient data for recommendation.";
      confidenceScore = 0;
      confidenceLevel = "Very Low";
      bgColor = "#f1f5f9";
    }
    
    let confidenceColor = "#94a3b8";
    let confidenceDisplay = "—";
    
    if (confidenceLevel === "High") {
      confidenceColor = "#10b981";
      confidenceDisplay = `High ${confidenceScore}%`;
    } else if (confidenceLevel === "Medium") {
      confidenceColor = "#f59e0b";
      confidenceDisplay = `Medium ${confidenceScore}%`;
    } else if (confidenceLevel === "Low") {
      confidenceColor = "#ef4444";
      confidenceDisplay = `Low ${confidenceScore}%`;
    }
    
    html += `
      <tr style="background: ${bgColor};">
        <td style="padding: 8px;">${displayDate}${todayBadge}</td>
        <td style="padding: 8px;">${dow}</td>
        <td style="padding: 8px; text-align: right;">${rateDisplay}</td>
        <td style="padding: 8px; text-align: right;">${compAvg ? formatCurrency(compAvg) : '-'}</td>
        <td style="padding: 8px; font-size: 11px;">${recommendation}</td>
        <td style="padding: 8px; text-align: right;"><strong>${suggestedRate ? formatCurrency(suggestedRate) : '—'}</strong></td>
        <td style="padding: 8px; text-align: center;">${confidenceScore > 0 ? `<span style="background: ${confidenceColor}20; color: ${confidenceColor}; padding: 2px 8px; border-radius: 12px; font-size: 10px;">${confidenceDisplay}</span>` : '—'}</td>
      </tr>
    `;
  }
  
  html += '</tbody></table></div>';
  document.getElementById("strategyTable").innerHTML = html;
}

// =========================================================
// Core Analysis Functions
// =========================================================

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

function calculateDOWAverages(dailyData, roomsAvailable) {
  const dowMap = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };
  const dowOcc = { Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0 };
  const dowAdr = { Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0 };
  const dowCount = { Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0 };
  
  dailyData.forEach(r => {
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
  
  return { occupancy: dowOcc, adr: dowAdr };
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
