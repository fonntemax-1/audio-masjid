/**
 * CACHE HIJRIAH MUSIMAN + VALIDASI JADWAL BULANAN
 *
 * Aturan:
 * - Trigger harian, tetapi di luar jendela khusus tidak memanggil API kalender.
 * - Kalender Hijriah API Indonesia diperiksa ulang pada H-3, H-2, dan H-1
 *   sebelum 1 Ramadhan, 1 Syawal, dan 1 Muharam berdasarkan kalender GitHub.
 * - Jadwal sholat kota aktif divalidasi ulang sekali pada tanggal 1 setiap bulan.
 * - Hanya kota aktif pada panels!C5:C10; tidak memproses semua kota.
 * - Data GitHub lama dipertahankan bila API gagal atau hasil tidak lengkap.
 * - Tidak mengubah audio, scheduler sholat, atau trigger yang tidak terkait.
 *
 * Pasang dengan menjalankan setupHijriSeasonCacheTrigger() satu kali.
 * Uji manual dengan runHijriSeasonCacheCheckNow().
 */

var HIJRI_SEASON_CACHE_PATH_ = "data/hijri-calendar-cache.json";
var HIJRI_SEASON_MONTHLY_PATH_ = "data/prayer-monthly-cache.json";
var HIJRI_SEASON_TZ_ = "Asia/Makassar";
var HIJRI_SEASON_SPECIAL_MONTHS_ = ["ramadhan", "ramadan", "syawal", "muharam", "muharram"];

function runHijriSeasonCacheCheckNow() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log("Pemeriksaan cache musiman dilewati: proses lain sedang berjalan.");
    return { success: false, skipped: true, reason: "lock_busy" };
  }

  try {
    var ss = getSpreadsheet();
    var panels = ss.getSheetByName("panels");
    if (!panels) throw new Error('Sheet "panels" tidak ditemukan.');

    var loc = panels.getRange("C5:C10").getDisplayValues().map(function(r) {
      return String(r[0] || "").trim();
    });
    var city = loc[0];
    var timezone = loc[3] || HIJRI_SEASON_TZ_;
    if (!city) throw new Error("panels!C5 (kota aktif) kosong.");

    var today = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");
    var hijriRefresh = hijriSeasonRefreshIfNeeded_(today);
    var monthlyRefresh = null;

    // Validasi ulang cache jadwal hanya sekali pada hari pertama bulan Masehi.
    if (today.slice(8, 10) === "01") {
      monthlyRefresh = refreshActiveCityMonthlyPrayerCache_(today);
    } else {
      Logger.log("Validasi jadwal bulanan dilewati; bukan tanggal 1.");
    }

    var result = {
      success: true,
      tanggal: today,
      kotaAktif: city,
      kalenderHijriah: hijriRefresh,
      jadwalSholatBulanan: monthlyRefresh || {
        skipped: true,
        reason: "monthly_validation_runs_on_day_1"
      }
    };
    Logger.log("HASIL PEMERIKSAAN CACHE MUSIMAN: " + JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function hijriSeasonRefreshIfNeeded_(today) {
  var doc;
  var cacheMissing = false;
  try {
    doc = readGithubJsonFile_(HIJRI_SEASON_CACHE_PATH_);
    if (!doc || typeof doc !== "object") throw new Error("format cache tidak valid");
  } catch (e) {
    // Bootstrap aman: file baru ditulis hanya setelah kalender API lengkap tervalidasi.
    cacheMissing = true;
    doc = { success: true, source: "API Indonesia / Kalender Hijriah Kemenag",
      updatedAt: "", yearCount: 0, years: {} };
    Logger.log("Cache kalender Hijriah belum ada; mencoba bootstrap dari API Indonesia: " + e);
  }

  if (!doc.years || typeof doc.years !== "object") doc.years = {};
  var year = today.slice(0, 4);
  var yearEntry = doc.years[year];
  var days = yearEntry && yearEntry.days;
  var annualMissing = !days || typeof days !== "object" || Object.keys(days).length < 350;
  if (!days || typeof days !== "object") days = {};

  var todayMs = hijriSeasonDateMs_(today);
  var target = null;
  Object.keys(days).forEach(function(date) {
    var row = days[date] || {};
    var dayNum = Number(row.hijri_day || 0);
    var monthName = hijriSeasonNormalizeMonth_(row.hijri_month_name || row.hijri_formatted || "");
    if (dayNum !== 1 || HIJRI_SEASON_SPECIAL_MONTHS_.indexOf(monthName) < 0) return;
    var delta = Math.round((hijriSeasonDateMs_(date) - todayMs) / 86400000);
    if (delta >= 1 && delta <= 3 && (!target || delta < target.daysUntil)) {
      target = { date: date, month: monthName, daysUntil: delta };
    }
  });

  if (!target && !annualMissing) {
    Logger.log("Kalender Hijriah: di luar jendela H-3 sampai H-1 Ramadhan/Syawal/Muharam; tidak memanggil API.");
    return { checked: false, reason: "outside_special_window" };
  }

  if (annualMissing) {
    Logger.log("Cache kalender Hijriah tahunan belum ada/tidak lengkap; bootstrap kalender tahun " + year + " dari API Indonesia.");
  } else {
    Logger.log("Jendela khusus Hijriah aktif: " + target.month + ", perkiraan 1 Hijriah=" +
      target.date + ", H-" + target.daysUntil + ". Memeriksa kalender tahunan API Indonesia.");
  }

  var props = PropertiesService.getScriptProperties();
  var apiKey = String(props.getProperty("API_INDONESIA_KEY") || "").trim();
  if (!apiKey) throw new Error("Script Property API_INDONESIA_KEY belum diisi.");

  var url = HIJRI_API_BASE_URL + "/kalender?tahun=" + encodeURIComponent(year);
  var response = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    headers: { "x-api-key": apiKey, "Accept": "application/json" }
  });
  var http = response.getResponseCode();
  if (http < 200 || http >= 300) {
    return { checked: true, updated: false, reason: "api_http_" + http, target: target };
  }

  var payload;
  try { payload = JSON.parse(response.getContentText() || "{}"); }
  catch (e) { return { checked: true, updated: false, reason: "invalid_json", target: target }; }
  var rows = payload && Array.isArray(payload.data) ? payload.data : [];
  var freshDays = {};
  rows.forEach(function(row) {
    var date = String(row.gregorian_date || row.date || "").trim();
    var formatted = hijriSeasonFormatRow_(row);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 4) !== year ||
        !row.hijri_day || !row.hijri_month_name || !row.hijri_year || !formatted) return;
    freshDays[date] = {
      gregorian_date: date,
      hijri_day: row.hijri_day,
      hijri_month_name: String(row.hijri_month_name),
      hijri_year: row.hijri_year,
      hijri_formatted: formatted
    };
  });

  // Kalender tahunan harus mencakup setidaknya 350 tanggal sebelum dapat menggantikan cache.
  if (Object.keys(freshDays).length < 350) {
    return { checked: true, updated: false, reason: "annual_calendar_incomplete", receivedDays: Object.keys(freshDays).length, target: target };
  }

  var changed = cacheMissing || annualMissing || JSON.stringify(freshDays) !== JSON.stringify(days);
  if (!changed) {
    return { checked: true, updated: false, reason: "no_change", target: target, receivedDays: Object.keys(freshDays).length };
  }

  doc.years[year] = {
    year: Number(year),
    source: "API Indonesia / Kalender Hijriah Kemenag",
    updatedAt: new Date().toISOString(),
    dayCount: Object.keys(freshDays).length,
    days: freshDays
  };
  doc.success = true;
  doc.source = "API Indonesia / Kalender Hijriah Kemenag";
  doc.updatedAt = new Date().toISOString();
  doc.yearCount = Object.keys(doc.years).length;
  writeGithubJsonFile_(HIJRI_SEASON_CACHE_PATH_, doc,
    "Validasi kalender Hijriah musiman " + year + " dari API Indonesia");
  return { checked: true, updated: true, target: target, receivedDays: Object.keys(freshDays).length };
}

function refreshActiveCityMonthlyPrayerCache_(today) {
  // Gunakan satu jalur operasional yang sama dengan aplikasi: getPrayerSchedule.
  // Refresh eksplisit meminta API Indonesia dan memublikasikan cache per kota.
  var schedule = getPrayerSchedule(today, { forceRefresh: true });
  if (!schedule || schedule.success !== true || !schedule.regency_id ||
      !schedule.jadwal || !isCompletePrayerScheduleSafe_(schedule.jadwal)) {
    var detail = schedule && (schedule.error || schedule.apiIndonesiaError);
    Logger.log("Validasi cache jadwal API Indonesia gagal: " + (detail || "respons tidak lengkap"));
    return { checked: true, updated: false, reason: "api_indonesia_refresh_failed",
      detail: detail || "Respons jadwal tidak lengkap" };
  }
  return {
    checked: true,
    updated: true,
    source: schedule.source || "API Indonesia / Kemenag",
    month: String(schedule.regency_id) + "_" + today.slice(0, 4) + today.slice(5, 7),
    kota: schedule.kota,
    tanggal: today,
    cacheSource: schedule.cacheSource || "",
    note: "Cache operasional per kota divalidasi melalui API Indonesia."
  };
}

function hijriSeasonFormatRow_(row) {
  if (!row) return "";
  var day = row.hijri_day;
  var month = String(row.hijri_month_name || "").trim();
  var year = row.hijri_year;
  return day && month && year ? String(day) + " " + month + " " + String(year) + " H" : "";
}

function hijriSeasonNormalizeMonth_(value) {
  var s = String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  // hijri_formatted bisa berbentuk "1 Ramadhan 1448 H"; ambil nama bulan.
  var known = ["ramadhan", "ramadan", "syawal", "muharam", "muharram"];
  for (var i = 0; i < known.length; i++) {
    if (s.indexOf(known[i]) >= 0) return known[i];
  }
  return s;
}

function hijriSeasonDateMs_(date) {
  var p = String(date).split("-");
  return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function setupHijriSeasonCacheTrigger() {
  var handler = "runHijriSeasonCacheCheckNow";
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(3).inTimezone("Asia/Makassar").create();
  Logger.log("Trigger aktif: pemeriksaan harian sekitar pukul 03.00 WITA; API kalender hanya dipanggil pada H-3 s.d. H-1 Ramadhan/Syawal/Muharam, jadwal bulanan diperiksa tanggal 1.");
}
