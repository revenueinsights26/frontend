console.log("rate-intelligence.js loaded");

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const API = window.location.hostname === 'localhost' 
  ? "https://backend-x5sw.onrender.com";
  : "https://your-app.onrender.com";

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

// ─────────────────────────────────────────────
// MATHEMATICAL SUGGESTED RATE FORMULA
// ─────────────────────────────────────────────
function calculateSuggestedRate(currentRate, compAvg, historicalOcc, dowFactor, overallAvgOcc) {
  // Step 1: Demand Score (0.5 to 1.35)
  let demandScore;
  if (historicalOcc >= 80) {
    demandScore = 1.15 + ((historicalOcc - 80) / 100);
  } else if (historicalOcc >= 65) {
    demandScore = 1.0 + ((historicalOcc - 65) / 100);
  } else if (historicalOcc >= 50) {
    demandScore = 0.85 + ((historicalOcc - 50) / 100);
  } else {
    demandScore = 0.7 + (historicalOcc / 100);
  }
  demandScore = Math.min(1.35, Math.max(0.7, demandScore));
  
  // Step 2: Competitor Score (0.85 to 1.15)
  let compScore = 1.0;
  if (compAvg && compAvg > 0) {
    compScore = compAvg / currentRate;
    compScore = Math.min(1.15, Math.max(0.85, compScore));
  }
  
  // Step 3: DOW Score (0.85 to 1.15)
  let dowScore = 1.0;
  if (overallAvgOcc > 0) {
    dowScore = 1 + ((dowFactor - overallAvgOcc) / overallAvgOcc);
    dowScore = Math.min(1.15, Math.max(0.85, dowScore));
  }
  
  // Step 4: Calculate Suggested Rate
  let suggestedRate = currentRate * demandScore * compScore * dowScore;
  
  // Step 5: Apply bounds
  suggestedRate = Math.min(currentRate * 1.25, Math.max(currentRate * 0.85, suggestedRate));
  
  return Math.round(suggestedRate / 10) * 10;
}

// ─────────────────────────────────────────────
// CONFIDENCE SCORE (0-100%)
// ─────────────────────────────────────────────
function calculateConfidenceScore(hasCompData, compCount, historicalDataPoints, hasDOWData) {
  let confidence = 50;
  
  if (hasCompData && compCount >= 5) {
    confidence += 30;
  } else if (hasCompData && compCount >= 3) {
    confidence += 20;
  } else if (hasCompData && compCount >= 1) {
    confidence += 10;
  }
  
  if (historicalDataPoints >= 30) {
    confidence += 20;
  } else if (historicalDataPoints >= 15) {
    confidence += 15;
  } else if (historicalDataPoints >= 7) {
    confidence += 10;
  } else if (historicalDataPoints >= 3) {
    confidence += 5;
  }
  
  if (hasDOWData) {
    confidence += 10;
  }
  
  return Math.min(95, Math.max(30, confidence));
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
// Rate Recommendations
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
  
  if (dowAnalysis.weekdayOcc < 60) {
    recommendations.push({
      dayType: "Weekdays (Mon-Thu)",
      recommendation: "Historically lower occupancy. Let demand come naturally - avoid deep discounts.",
      action: "📊 Monitor Only",
      suggestedRate: kpis.adr * 0.98,
      type: "neutral"
    });
  } else if (dowAnalysis.weekdayOcc > 75) {
    recommendations.push({
      dayType: "Weekdays (Mon-Thu)",
      recommendation: "Historically strong weekday occupancy. Push rates on these days.",
      action: "📈 Rate Increase",
      suggestedRate: kpis.adr * 1.08,
      type: "increase"
    });
  } else {
    recommendations.push({
      dayType: "Weekdays (Mon-Thu)",
      recommendation: "Balanced historical occupancy. Maintain current strategy.",
      action: "⚖️ Maintain",
      suggestedRate: kpis.adr,
      type: "neutral"
    });
  }
  
  if (dowAnalysis.weekendOcc > 85) {
    recommendations.push({
      dayType: "Weekends (Fri-Sun)",
      recommendation: "Historically very high weekend demand. Maximize revenue.",
      action: "📈 Aggressive Increase",
      suggestedRate: kpis.adr * 1.15,
      type: "increase"
    });
  } else if (dowAnalysis.weekendOcc > 70) {
    recommendations.push({
      dayType: "Weekends (Fri-Sun)",
      recommendation: "Historically good weekend demand. Slight rate increase possible.",
      action: "📈 Moderate Increase",
      suggestedRate: kpis.adr * 1.05,
      type: "increase"
    });
  } else {
    recommendations.push({
      dayType: "Weekends (Fri-Sun)",
      recommendation: "Historical weekend demand is soft. Consider value-adds, not rate cuts.",
      action: "🎁 Add Value",
      suggestedRate: kpis.adr * 0.98,
      type: "neutral"
    });
  }
  
  const priceVsComp = ((kpis.adr - competitorRates.avgCompetitorRate) / competitorRates.avgCompetitorRate) * 100;
  if (priceVsComp < -15 && dowAnalysis.weekdayOcc > 70) {
    recommendations.push({
      dayType: "Competitor Positioning",
      recommendation: "You're significantly below competitors on strong demand days.",
      action: "📈 Raise Rates",
      suggestedRate: competitorRates.avgCompetitorRate * 0.95,
      type: "increase"
    });
  } else if (priceVsComp > 15 && kpis.occupancy < 65) {
    recommendations.push({
      dayType: "Competitor Positioning",
      recommendation: "You're priced above competitors on soft demand days.",
      action: "📉 Adjust Downward",
      suggestedRate: competitorRates.avgCompetitorRate * 0.98,
      type: "decrease"
    });
  }
  
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
// Demand Calendar
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
// Day Strategy Table - COMPLETE WITH ALL FIXES
// ─────────────────────────────────────────────
function renderDayStrategy(monthPerf, monthComp, roomsAvailable, isCurrentFuture) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const futureDates = monthPerf.filter(r => {
    const checkDate = new Date(r.stay_date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate >= today;
  }).sort((a, b) => a.stay_date.localeCompare(b.stay_date));
  
  const overallAvgOcc = monthPerf.reduce((sum, r) => sum + (r.rooms_sold / roomsAvailable) * 100, 0) / monthPerf.length;
  
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
  
  let html = `
    <table class="detailed-table" style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th>Date</th>
          <th>DOW</th>
          <th>Your Current Rate</th>
          <th>Comp Avg</th>
          <th>AI Recommendation</th>
          <th>Suggested Rate</th>
          <th>Confidence</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  futureDates.forEach(day => {
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
    
    const dayOfWeekName = getDayOfWeekName(date);
    const dowFactor = getDOWFactor(dayOfWeekName, monthPerf, roomsAvailable);
    
    let suggestedRate = null;
    let confidenceScore = 0;
    let recommendation = "";
    let bgColor = "";
    let rateDisplay = "";
    
    const isToday = new Date(date).toDateString() === new Date().toDateString();
    const todayBadge = isToday ? ' <span style="color: #3b82f6;">(TODAY)</span>' : '';
    
    // CASE 1: Sold Out
    if (isSoldOut) {
      rateDisplay = '<span style="color: #dc2626; font-weight: 600;">SOLD OUT</span>';
      
      if (compAvg) {
        suggestedRate = Math.round(compAvg * 1.15 / 10) * 10;
        recommendation = "Property sold out on this date. Consider increasing rate by 15% for future similar dates.";
        confidenceScore = 60;
        bgColor = "#fef3c7";
      } else if (historicalOcc > 75) {
        suggestedRate = Math.round((historicalOcc * 15) / 10) * 10;
        recommendation = "High historical demand. Property sold out - consider rate increase for future dates.";
        confidenceScore = 50;
        bgColor = "#fef3c7";
      } else {
        suggestedRate = null;
        recommendation = "Sold out - insufficient data for rate suggestion.";
        confidenceScore = 30;
        bgColor = "#f1f5f9";
      }
    }
    // CASE 2: Have both current rate and competitor data
    else if (currentRate && compAvg) {
      rateDisplay = formatCurrency(currentRate);
      suggestedRate = calculateSuggestedRate(currentRate, compAvg, historicalOcc, dowFactor, overallAvgOcc);
      
      const compCount = compData.comps ? compData.comps.length : 0;
      const historicalDataPoints = monthPerf.length;
      confidenceScore = calculateConfidenceScore(true, compCount, historicalDataPoints, true);
      
      const percentDiff = ((suggestedRate - currentRate) / currentRate) * 100;
      
      if (percentDiff > 5) {
        recommendation = `AI suggests +${Math.round(percentDiff)}% increase based on strong demand and competitor positioning`;
        bgColor = "#f0fdf4";
      } else if (percentDiff < -5) {
        recommendation = `AI suggests ${Math.round(percentDiff)}% decrease to stay competitive on soft demand days`;
        bgColor = "#fef2f2";
      } else if (percentDiff > 2) {
        recommendation = `AI suggests slight increase (${Math.round(percentDiff)}%) - good demand expected`;
        bgColor = "#f0fdf9";
      } else if (percentDiff < -2) {
        recommendation = `AI suggests slight decrease to improve competitiveness`;
        bgColor = "#fef3c7";
      } else {
        recommendation = `AI suggests maintaining current rate - balanced market position`;
        bgColor = "#f8fafc";
      }
    }
    // CASE 3: Have current rate but no competitor data
    else if (currentRate && !compAvg) {
      rateDisplay = formatCurrency(currentRate);
      
      let demandAdjustment = 0;
      if (historicalOcc > 75) {
        demandAdjustment = 0.05;
        recommendation = "High historical demand. Consider +5% rate increase (no competitor data available).";
        bgColor = "#f0fdf4";
        confidenceScore = 45;
      } else if (historicalOcc < 50) {
        demandAdjustment = -0.05;
        recommendation = "Soft historical demand. Consider -5% rate adjustment (no competitor data available).";
        bgColor = "#fef2f2";
        confidenceScore = 45;
      } else {
        demandAdjustment = 0;
        recommendation = "Moderate demand. Maintain current rate (no competitor data available).";
        bgColor = "#fef3c7";
        confidenceScore = 40;
      }
      
      suggestedRate = Math.round(currentRate * (1 + demandAdjustment) / 10) * 10;
    }
    // CASE 4: No current rate and no competitor data
    else if (!currentRate && !compAvg) {
      rateDisplay = '<span style="color: #94a3b8;">—</span>';
      suggestedRate = null;
      recommendation = "Insufficient data: No current rate and no competitor data available.";
      confidenceScore = 0;
      bgColor = "#f1f5f9";
    }
    // CASE 5: No current rate but have competitor data
    else if (!currentRate && compAvg) {
      rateDisplay = '<span style="color: #94a3b8;">—</span>';
      
      let demandAdjustment = 0;
      if (historicalOcc > 75) {
        demandAdjustment = 0.08;
        recommendation = "High demand expected. Use competitor average +8% as guide.";
        bgColor = "#f0fdf4";
        confidenceScore = 50;
      } else if (historicalOcc < 50) {
        demandAdjustment = -0.05;
        recommendation = "Soft demand expected. Use competitor average -5% as guide.";
        bgColor = "#fef2f2";
        confidenceScore = 50;
      } else {
        demandAdjustment = 0;
        recommendation = "Use competitor average as rate guide (no current rate provided).";
        bgColor = "#fef3c7";
        confidenceScore = 45;
      }
      
      suggestedRate = Math.round(compAvg * (1 + demandAdjustment) / 10) * 10;
    }
    
    let confidenceColor = "#94a3b8";
    let confidenceDisplay = "—";
    
    if (confidenceScore >= 80) {
      confidenceColor = "#10b981";
      confidenceDisplay = `High ${confidenceScore}%`;
    } else if (confidenceScore >= 60) {
      confidenceColor = "#f59e0b";
      confidenceDisplay = `Medium ${confidenceScore}%`;
    } else if (confidenceScore >= 30) {
      confidenceColor = "#ef4444";
      confidenceDisplay = `Low ${confidenceScore}%`;
    } else if (confidenceScore > 0) {
      confidenceColor = "#94a3b8";
      confidenceDisplay = `Very Low ${confidenceScore}%`;
    }
    
    html += `
      <tr style="background: ${bgColor};">
        <td class="date-cell">${displayDate}${todayBadge}</td>
        <td class="dow-cell">${dow}</td>
        <td class="number-cell">${rateDisplay}</td>
        <td class="number-cell">${compAvg ? formatCurrency(compAvg) : '-'}</td>
        <td style="text-align: left; font-size: 11px; padding: 8px;">${recommendation}</td>
        <td class="number-cell"><strong>${suggestedRate ? formatCurrency(suggestedRate) : '—'}</strong></td>
        <td class="number-cell">${confidenceScore > 0 ? `<span style="background: ${confidenceColor}20; color: ${confidenceColor}; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600;">${confidenceDisplay}</span>` : '—'}</td>
      </tr>
    `;
  });
  
  html += '</tbody></table>';
  document.getElementById("strategyTable").innerHTML = html;
}

// ─────────────────────────────────────────────
// Analysis Functions
// ─────────────────────────────────────────────
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
