console.log("upload.js loaded");

document.addEventListener("DOMContentLoaded", function () {

  document.getElementById("btnUpload").addEventListener("click", function () {

    var hotelFile = document.getElementById("hotelFile").files[0];
    var compFile  = document.getElementById("compFile").files[0];

    if (!hotelFile) { alert("Please select a Hotel Data file."); return; }
    if (!compFile)  { alert("Please select a Comp Data file.");  return; }

    // Add this after the compFile check
const roomsInput = parseInt(document.getElementById("roomsAvailable").value, 10);
if (!roomsInput || roomsInput < 1) {
  alert("Please enter the total number of rooms available.");
  return;
}
localStorage.setItem("roomsAvailable", roomsInput);

    // Hotel file: NO headers — read as raw arrays
    readExcelAsArrays(hotelFile, function (hotelRows) {
      // Comp file: HAS headers — read as key/value objects
      readExcel(compFile, function (compRows) {

        console.log("Hotel rows parsed:", hotelRows.length);
        console.log("Comp rows parsed:",  compRows.length);
        console.log("Hotel sample row:", hotelRows[0]);
        console.log("Comp sample row:",  compRows[0]);

        var token   = localStorage.getItem("ownerToken");
        var hotelId = localStorage.getItem("hotelId") || "HOTEL001";

        if (!token) {
          alert("No owner token found. Please log in again.");
          window.location.href = "index.html";
          return;
        }

        // ── HOTEL FILE ────────────────────────────────────────────
        // No headers. Each row is a plain array: [date, rooms_sold, room_revenue]
        var performanceData = hotelRows.map(function (r) {
          return {
            date        : formatDate(r[0]),
            rooms_sold  : parseInt(r[1] || 0, 10),
            room_revenue: parseFloat(r[2] || 0)
          };
        }).filter(function (r) {
          return r.date !== "" && (r.rooms_sold > 0 || r.room_revenue > 0);
        });

        console.log("Performance rows after filter:", performanceData.length);
        console.log("Performance sample:", performanceData[0]);

        // ── COMP FILE ─────────────────────────────────────────────
        // Has headers: Stay Date | My Hotel | Comp1 | Comp2 ...
        // Rates like "7 083" (space thousands sep), "Sold out", "LOS2"
        var compsetData = compRows.map(function (r) {
          var vals     = Object.values(r);
          var compVals = vals.slice(2);
          return {
            date     : formatDate(vals[0]),
            your_rate: parseRate(vals[1]),
            comps    : compVals.map(parseRate).filter(function (v) { return v !== null; })
          };
        }).filter(function (r) { return r.date !== ""; });

        console.log("Compset rows after filter:", compsetData.length);
        console.log("Compset sample:", compsetData[0]);

        // ── BUILD PAYLOAD ─────────────────────────────────────────
        var dates = performanceData.map(function (r) { return r.date; }).sort();

        var payload = {
          hotel_id        : hotelId,
          period_start    : dates[0],
          period_end      : dates[dates.length - 1],
          rooms_available : parseInt(localStorage.getItem("roomsAvailable") || "100", 10),
          performance_data: performanceData,
          compset_data    : compsetData,
          period_type     : "monthly"
        };

        console.log("Period:", payload.period_start, "->", payload.period_end);
        console.log("Perf rows:", payload.performance_data.length);
        console.log("Comp rows:", payload.compset_data.length);

        // ── POST TO BACKEND ───────────────────────────────────────
        fetch("http://localhost:8000/calculate_and_store", {
          method : "POST",
          headers: {
            "Content-Type" : "application/json",
            "X-Owner-Token": token
          },
          body: JSON.stringify(payload)
        })
        .then(function (res) {
          if (!res.ok) {
            return res.json().then(function (e) {
              throw new Error(JSON.stringify(e));
            });
          }
          return res.json();
        })
        .then(function (data) {
          if (data.snapshot_id) {
            console.log("Snapshot stored:", data.snapshot_id);
            localStorage.setItem("autoLoad", "1");
            window.location.href = "dashboard.html";
          } else {
            alert("Upload failed: " + JSON.stringify(data));
          }
        })
        .catch(function (err) {
          alert("Error: " + err.message);
          console.error(err);
        });

      }); // end readExcel compFile
    }); // end readExcelAsArrays hotelFile

  }); // end btnUpload click

}); // end DOMContentLoaded


// ─── Read Excel with headers → array of row OBJECTS ──────────────
function readExcel(file, callback) {
  var reader = new FileReader();
  reader.onload = function (e) {
    var data     = new Uint8Array(e.target.result);
    var workbook = XLSX.read(data, { type: "array", cellDates: true });
    var sheet    = workbook.Sheets[workbook.SheetNames[0]];
    var rows     = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
    callback(rows);
  };
  reader.readAsArrayBuffer(file);
}

// ─── Read Excel without headers → array of RAW ARRAYS ────────────
function readExcelAsArrays(file, callback) {
  var reader = new FileReader();
  reader.onload = function (e) {
    var data     = new Uint8Array(e.target.result);
    var workbook = XLSX.read(data, { type: "array", cellDates: true });
    var sheet    = workbook.Sheets[workbook.SheetNames[0]];
    // header:1 returns each row as a plain array, no key mapping
    var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
    // Drop completely empty rows
    rows = rows.filter(function (r) { return r.some(function (v) { return v !== null; }); });
    callback(rows);
  };
  reader.readAsArrayBuffer(file);
}


// ─── Format date from any source ─────────────────────────────────
// Handles: JS Date, Excel serial, "Fri, 10 Apr 2026", "2026-03-01", etc.
function formatDate(val) {
  if (!val) return "";

  // JS Date object (cellDates:true)
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = String(val.getMonth() + 1).padStart(2, "0");
    var d = String(val.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  // Excel serial number
  if (typeof val === "number") {
    var utcDays = Math.floor(val - 25569);
    var dt = new Date(utcDays * 86400 * 1000);
    var y = dt.getUTCFullYear();
    var m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    var d = String(dt.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  var s = String(val).trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Strip leading weekday e.g. "Fri, " from comp file dates
  s = s.replace(/^[A-Za-z]{3},\s*/, "");

  // Native parse using UTC parts to avoid timezone shift
  var parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    var y = parsed.getUTCFullYear();
    var m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
    var d = String(parsed.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  return "";
}


// ─── Parse rate values ────────────────────────────────────────────
// Handles "7 083" (space-thousands), "Sold out", "LOS2", null, numbers
function parseRate(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return val;
  var s = String(val).trim();
  var cleaned = s.replace(/[^0-9.]/g, "");
  var n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}