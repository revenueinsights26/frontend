console.log("rate-intelligence.js loaded");

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
    }
  });
  
  document.getElementById("nextMonth").addEventListener("click", () => {
    if (currentMonthIndex < monthKeys.length - 1) { 
      currentMonthIndex++; 
      loadMonthData();
    }
  });

  loadDashboardData();
});

// ─────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────
function isCurrentOrFutureMonth(monthKey) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  
  const [year, month] = monthKey.split("-").map(Number);
  
  if (year > currentYear) return true;
  if (year === currentYear && month >= currentMonth) return true;
  return false;
}

function isTodayOrFuture(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(dateStr);
  checkDate.setHours(0, 0, 0, 0);
  return checkDate >= today;
}

// ─────────────────────────────────────────────
// Load Data
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
      alert("No data found. Please upload data first.");
      window.location.href = "dashboard.html";
      return;
    }
    
    const latestSnapshot = snapshots[snapshots.length - 1];
    return fetch(API + "/daily_by_snapshot/" + latestSnapshot.snapshot_id, {
      headers: { "X-Owner-Token": token }
    });
  })
  .then(res => res.json())
  .then(data => {
    allDailyPerf = data.performance || [];
    allDailyComp = data.compset || [];
    monthKeys = extractMonths(allDailyPerf);
    
    if (monthKeys.length === 0) {
      alert("No daily data available.");
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
    loadMonthData();
  })
  .catch(err => {
    console.error("Error loading data:", err);
    alert("Error loading data. Please ensure backend is running.");
  });
}

function loadMonthData() {
  const monthKey = monthKeys[currentMonthIndex];
  document.getElementById("monthLabel").textContent = formatMonthLabel(monthKey);
  
  const monthPerf = allDailyPerf.filter(r => r.stay_date && r.stay_date.startsWith(monthKey));
  const monthComp = allDailyComp.filter(r => r.stay_date && r.stay_date.startsWith(monthKey));
  
  if (monthPerf.length === 0) return;
  
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
// Executive Summary
// ─────────────────────────────────────────────
function renderExecutiveSummary(kpis, dowAnalysis, demandAnalysis, competitorRates, isCurrentFuture, monthKey) {
  let summary;
  
  if (!isCurrentFuture) {
    summary = {
      text: `📅 This is historical data for ${formatMonthLabel(monthKey)}. The insights below are for reference only. Use the month navigator to view current/future months for active recommendations.`,
      recommendation: "Historical View",
      focus: "For Reference Only"
    };
  } else {
    summary = generateExecutiveSummary(kpis, dowAnalysis, demandAnalysis, competitorRates);
  }
  
  const html = `
    <div style="display: flex; align-items: flex-start; gap: 20px;">
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
    text = "🏨 Your hotel typically runs at HIGH OCCUPANCY (>80%) during this period. ";
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
    text = "📈 Your hotel shows GOOD OCCUPANCY (65-80%) historically. ";
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
    text = "⚠️ Your hotel shows MODERATE OCCUPANCY (50-65%) historically. ";
    text += "Let historical demand patterns guide your strategy - occupancy typically comes naturally during this period. ";
    recommendation = "📊 Monitor Demand";
    focus = "Let History Guide You";
  } else {
    text = "🔍 Your hotel shows LOWER OCCUPANCY (<50%) historically during this period. ";
    text += "This may be a seasonal pattern. Consider targeted promotions only if you need to outperform historical trends. ";
    recommendation = "🎯 Strategic Promotions";
    focus = "Selective Action";
  }
  
  if (demandAnalysis.highDemandDays.length > 0) {
    text += ` Based on historical data, high demand typically occurs on ${demandAnalysis.highDemandDays.slice(0, 3).join(", ")}. `;
  }
  
  if (demandAnalysis.lowDemandDays.length > 0) {
    text += ` Lower demand patterns on ${demandAnalysis.lowDemandDays.slice(0, 2).join(", ")} - this is normal. `;
  }
  
  return { text, recommendation, focus };
}

// ─────────────────────────────────────────────
// Rate Recommendations - IMPROVED with DOW analysis
// ─────────────────────────────────────────────
function renderRateRecommendations(kpis, dowAnalysis, competitorRates, isCurrentFuture) {
  if (!isCurrentFuture) {
    const html = `
      <div style="text-align: center; padding: 40px 20px; color: #6b7280;">
        <div style="font-size: 48px; margin-bottom: 16px;">📅</div>
        <strong>Historical Month</strong>
        <p style="margin-top: 8px; font-size: 13px;">Rate recommendations are only available for current and future months.</p>
        <p style="font-size: 12px;">Use the month navigator to view upcoming periods.</p>
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
        <div style="display: flex; justify-content: space-between; align-items: center;">
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
  
  // Calculate weekend vs weekday multipliers from actual DOW analysis
  const weekendOcc = dowAnalysis.weekendOcc;
  const weekdayOcc = dowAnalysis.weekdayOcc;
  
  // Determine if weekends are strong or weak
  let weekendMultiplier = 1.0;
  let weekdayMultiplier = 1.0;
  let weekendAction = "";
  let weekdayAction = "";
  let weekendRec = "";
  let weekdayRec = "";
  
  // Weekend analysis
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
  
  // Weekday analysis
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
    weekdayRec = "Weekday occupancy is soft. Consider corporate rates or last-minute deals.";
  } else {
    weekdayMultiplier = 0.95;
    weekdayAction = "📉 Discount";
    weekdayRec = "Low weekday occupancy. Consider targeted promotions.";
  }
  
  // Competitor adjustment
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

// ─────────────────────────────────────────────
// Revenue Triangle
// ─────────────────────────────────────────────
function renderRevenueTriangle(kpis, dowAnalysis, isCurrentFuture) {
  const analysis = analyzeRevenueTriangle(kpis, dowAnalysis, isCurrentFuture);
  
  const html = `
    <div style="text-align: center; margin-bottom: 15px;">
      <div style="display: inline-block; background: #f1f5f9; border-radius: 50%; width: 120px; height: 120px; line-height: 120px; margin-bottom: 10px;">
        <span style="font-size: 28px; font-weight: 700;">${(kpis.revpar).toFixed(0)}</span>
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
          <div style="background: #16a34a; width: ${Math.min((kpis.adr / 3000) * 100, 100)}%; height: 6px; border-radius: 3px;"></div>
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
    action = "Use these patterns to inform future strategy, but don't force changes to past months.";
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
    action = "Let historical demand guide your strategy - don't over-react to short-term softness.";
  }
  
  return { insight, action };
}

// ─────────────────────────────────────────────
// Demand Calendar - ONLY SHOWS TODAY AND FUTURE DATES
// ─────────────────────────────────────────────
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
      <div style="background: ${bgColor}; padding: 10px 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div style="font-weight: 600; color: ${textColor};">
          <strong>${displayDate}</strong> - ${dow} ${todayBadge}
        </div>
        <div style="display: flex; gap: 20px; align-items: center;">
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

// ─────────────────────────────────────────────
// Helper functions for DOW factor
// ─────────────────────────────────────────────
function getDOWFactor(dayName, monthPerf, roomsAvailable) {
  const dowOcc = [];
  monthPerf.forEach(r => {
    const date = new Date(r.stay_date);
    const dow = getDayOfWeekName(r.stay_date);
    if (dow === dayName) {
      const occ = (r.rooms_sold / roomsAvailable) * 100;
      dowOcc.push(occ);
    }
  });
  
  if (dowOcc.length === 0) return 50;
  return dowOcc.reduce((a, b) => a + b, 0) / dowOcc.length;
}

function getDayOfWeekName(dateStr) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const date = new Date(dateStr);
  return days[date.getDay()];
}

// ─────────────────────────────────────────────
// Day Strategy Table - Shows future dates only
// ─────────────────────────────────────────────
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
  
  // Calculate DOW averages from all historical data
  const dowAverages = calculateDOWAverages(allDailyPerf, roomsAvailable);
  
  let html = `
    <div style="font-size: 11px; color: #64748b; margin-bottom: 12px; padding: 8px; background: #f1f5f9; border-radius: 6px;">
      ℹ️ Rate suggestions based on historical day-of-week patterns and competitor positioning.
    </div>
    <table class="detailed-table" style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th>Date</th>
          <th>DOW</th>
          <th>Your Current Rate</th>
          <th>Comp Avg</th>
          <th>Recommendation</th>
          <th>Suggested Rate</th>
          <th>Confidence</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  for (const day of futureDates) {
    const date = day.stay_date;
    const [year, month, dayNum] = date.split("-");
    const displayDate = `${dayNum}/${month}`;
    const dow = getDayOfWeek(date);
    const historicalOcc = roomsAvailable > 0 ? (day.rooms_sold / roomsAvailable) * 100 : 0;
    
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
    
    // Get DOW-specific recommendation
    const dowName = getDayOfWeekName(date);
    const dowOccAvg = dowAverages.occupancy[dowName] || 50;
    const dowAdrAvg = dowAverages.adr[dowName] || 1500;
    
    let suggestedRate = null;
    let confidenceScore = 0;
    let recommendation = "";
    let bgColor = "";
    let rateDisplay = "";
    let confidenceLevel = "";
    
    const isToday = new Date(date).toDateString() === new Date().toDateString();
    const todayBadge = isToday ? ' <span style="color: #3b82f6;">(TODAY)</span>' : '';
    
    // CASE 1: Sold Out
    if (isSoldOut) {
      rateDisplay = '<span style="color: #dc2626; font-weight: 600;">SOLD OUT</span>';
      
      if (compAvg) {
        suggestedRate = Math.round(compAvg * 1.15 / 10) * 10;
        recommendation = "Property sold out. Consider +15% for future dates.";
        confidenceScore = 60;
        confidenceLevel = "Medium";
        bgColor = "#fef3c7";
      } else if (historicalOcc > 75) {
        suggestedRate = Math.round((historicalOcc * 15) / 10) * 10;
        recommendation = "High historical demand. Consider rate increase for future dates.";
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
    }
    // CASE 2: Have both current rate and competitor data
    else if (currentRate && compAvg) {
      rateDisplay = formatCurrency(currentRate);
      
      // Calculate suggested rate based on DOW pattern
      const dowMultiplier = dowOccAvg > 60 ? 1.05 : (dowOccAvg > 45 ? 1.0 : 0.97);
      const compMultiplier = compAvg > currentRate * 1.05 ? 1.03 : (compAvg < currentRate * 0.95 ? 0.97 : 1.0);
      
      suggestedRate = Math.round(currentRate * dowMultiplier * compMultiplier / 10) * 10;
      confidenceScore = 70;
      confidenceLevel = "Medium";
      
      if (dowOccAvg > 70) {
        recommendation = `Historically high demand on ${dowName}s. Consider +${Math.round((dowMultiplier - 1) * 100)}% increase.`;
        bgColor = "#f0fdf4";
      } else if (dowOccAvg < 40) {
        recommendation = `Historically soft demand on ${dowName}s. Consider value-adds or small decreases.`;
        bgColor = "#fef2f2";
      } else {
        recommendation = `Moderate historical demand on ${dowName}s. Maintain current strategy.`;
        bgColor = "#f8fafc";
      }
    }
    // CASE 3: Have current rate but no competitor data
    else if (currentRate && !compAvg) {
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
    }
    // CASE 4: No current rate and no competitor data
    else if (!currentRate && !compAvg) {
      rateDisplay = '<span style="color: #94a3b8;">—</span>';
      suggestedRate = null;
      recommendation = "Insufficient data: No rate information available.";
      confidenceScore = 0;
      confidenceLevel = "Very Low";
      bgColor = "#f1f5f9";
    }
    // CASE 5: No current rate but have competitor data
    else if (!currentRate && compAvg) {
      rateDisplay = '<span style="color: #94a3b8;">—</span>';
      
      const dowMultiplier = dowOccAvg > 60 ? 1.05 : (dowOccAvg > 45 ? 1.0 : 0.98);
      suggestedRate = Math.round(compAvg * dowMultiplier / 10) * 10;
      confidenceScore = 50;
      confidenceLevel = "Low";
      
      recommendation = `Use competitor average as baseline, adjusted for ${dowName} demand pattern.`;
      bgColor = "#fef3c7";
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
    } else if (confidenceLevel === "Very Low" && confidenceScore > 0) {
      confidenceColor = "#94a3b8";
      confidenceDisplay = `Very Low ${confidenceScore}%`;
    }
    
    html += `
      <tr style="background: ${bgColor};">
        <td class="date-cell">${displayDate}
