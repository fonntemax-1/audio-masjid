/**
 * VALIDASI HARIAN CACHE JADWAL SHOLAT + KALENDER HIJRIAH ALADHAN
 *
 * Aturan:
 * - Setiap hari validasi data tanggal berjalan melalui AlAdhan.
 * - Cache bulanan diperbarui hanya jika data tanggal berjalan berubah.
 * - Jika tanggal Hijriah hari ini berubah, hanya entri tanggal itu yang diperbarui.
 * - Jika AlAdhan gagal atau respons tidak valid, cache terakhir tetap dipakai.
 * - Tidak memakai API alternatif sebagai sumber jadwal sholat atau kalender Hijriah.
 * - Tidak mengubah audio, scheduler sholat, atau trigger yang tidak terkait.
 *
 * Pasang dengan menjalankan setupHijriSeasonCacheTrigger() satu kali.
 * Uji manual dengan runHijriSeasonCacheCheckNow().
 */

var HIJRI_SEASON_CACHE_PATH_ = "data/hijri-calendar-cache.json";
// Cache jadwal bulanan dikelola oleh getPrayerSchedule() pada Code.gs.
var HIJRI_SEASON_TZ_ = "Asia/Makassar";
var HIJRI_SEASON_SPECIAL_MONTHS_ = ["ramadhan", "ramadan", "syawal", "muharam", "muharram"];

function runHijriSeasonCacheCheckNow() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log("Validasi harian cache AlAdhan dilewati: proses lain sedang berjalan.");
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
    var prayerCheck = refreshActiveCityMonthlyPrayerCache_(today);
    var hijriCheck = {
      checked: false, updated: false,
      source: "AlAdhan / Kalender Hijriah"
    };

    if (prayerCheck.alAdhanValidated === true && prayerCheck.schedule) {
      hijriCheck = refreshHijriCalendarCacheDateFromAlAdhan_(today, prayerCheck.schedule);
    } else {
      hijriCheck.reason = "aladhan_unavailable_cache_retained";
      Logger.log("Validasi kalender Hijriah hari ini dilewati karena AlAdhan tidak tersedia; cache lama dipertahankan.");
    }

    var result = {
      success: true,
      tanggal: today,
      kotaAktif: city,
      sumberUtama: "AlAdhan",
      kalenderHijriah: hijriCheck,
      jadwalSholatBulanan: prayerCheck
    };
    Logger.log("HASIL VALIDASI HARIAN CACHE ALADHAN: " + JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

// Alias kompatibilitas untuk pemanggil lama; tidak lagi memakai jendela musiman.
function hijriSeasonRefreshIfNeeded_(today) {
  var check = refreshActiveCityMonthlyPrayerCache_(today);
  if (check.alAdhanValidated === true && check.schedule) {
    return refreshHijriCalendarCacheDateFromAlAdhan_(today, check.schedule);
  }
  return {
    checked: false, updated: false,
    reason: "aladhan_unavailable_cache_retained",
    source: "AlAdhan / Kalender Hijriah"
  };
}

function refreshHijriCalendarCacheDateFromAlAdhan_(today, schedule) {
  var source = "AlAdhan / Kalender Hijriah";
  var year = String(today || "").slice(0, 4);
  var hijriDay = String(schedule && schedule.hijri_day || "").trim();
  var hijriMonthRaw = String(schedule && schedule.hijri_month_name || "").trim();
  var hijriYear = String(schedule && schedule.hijri_year || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !hijriDay || !hijriMonthRaw || !hijriYear) {
    Logger.log("Validasi Hijriah AlAdhan gagal: data tanggal berjalan tidak lengkap; cache lama dipertahankan.");
    return { checked: true, updated: false, reason: "invalid_aladhan_hijri_response", source: source };
  }

  var localMonth = normalizeHijriMonthNameIndonesia_(hijriMonthRaw);
  var freshRow = {
    gregorian_date: today,
    hijri_day: hijriDay,
    hijri_month_name: localMonth,
    hijri_year: hijriYear,
    hijri_formatted: hijriDay + " " + localMonth + " " + hijriYear + " H",
    source: source
  };

  var doc;
  try { doc = readGithubJsonFile_(HIJRI_SEASON_CACHE_PATH_); }
  catch (error) {
    Logger.log("Cache kalender Hijriah tidak dapat dibaca; tidak ditimpa: " + String(error && error.message || error));
    return { checked: true, updated: false, reason: "hijri_cache_read_failed", source: source };
  }
  var yearEntry = doc && doc.years && doc.years[year];
  if (!doc || String(doc.source || "") !== source ||
      !yearEntry || String(yearEntry.source || "") !== source ||
      !hijriAnnualDaysComplete_(yearEntry.days, year) || !yearEntry.days[today]) {
    Logger.log("Cache kalender Hijriah tahunan tidak valid/lengkap; cache lama dipertahankan.");
    return { checked: true, updated: false, reason: "existing_hijri_cache_invalid", source: source };
  }

  var priorRow = yearEntry.days[today] || {};
  var same = String(priorRow.hijri_day || "") === freshRow.hijri_day &&
    String(priorRow.hijri_month_name || "") === freshRow.hijri_month_name &&
    String(priorRow.hijri_year || "") === freshRow.hijri_year &&
    String(priorRow.hijri_formatted || "") === freshRow.hijri_formatted &&
    String(priorRow.source || "") === source;
  if (same) {
    Logger.log("VALIDASI HIJRIAH ALADHAN: " + today + " tidak berubah; commit dilewati.");
    return { checked: true, updated: false, reason: "no_change", source: source,
      tanggal: today, hijri: freshRow.hijri_formatted };
  }

  yearEntry.days[today] = freshRow;
  yearEntry.updatedAt = new Date().toISOString();
  doc.updatedAt = yearEntry.updatedAt;
  doc.source = source;
  writeGithubJsonFile_(HIJRI_SEASON_CACHE_PATH_, doc,
    "Validasi kalender Hijriah AlAdhan " + today);
  Logger.log("CACHE HIJRIAH ALADHAN DIPERBARUI UNTUK TANGGAL BERJALAN: " + today);
  return { checked: true, updated: true, source: source, tanggal: today,
    hijri: freshRow.hijri_formatted };
}

/**
 * Refresh kalender Hijriah satu tahun hanya dari AlAdhan.
 * Memanggil calendarByCity untuk setiap bulan dan tidak memakai sumber alternatif.
 * Jalankan manual setelah file ini diperbarui agar cache lama AlAdhan diganti.
 */
function refreshHijriCalendarCacheYearFromAlAdhan_(year) {
  var targetYear = Number(year || Utilities.formatDate(new Date(), HIJRI_SEASON_TZ_, "yyyy"));
  if (!Number.isInteger(targetYear) || targetYear < 1900 || targetYear > 2200) {
    throw new Error("Tahun kalender Hijriah tidak valid.");
  }

  var ss = getSpreadsheet();
  var panels = ss.getSheetByName("panels");
  if (!panels) throw new Error('Sheet "panels" tidak ditemukan.');
  var loc = panels.getRange("C5:C10").getDisplayValues().map(function(r) {
    return String(r[0] || "").trim();
  });
  var city = loc[0], province = loc[1], timezone = loc[3] || HIJRI_SEASON_TZ_;
  if (!city) throw new Error("panels!C5 (kota aktif) kosong.");

  var apiCity = typeof normalizePrayerLocationName_ === "function"
    ? (normalizePrayerLocationName_(city) || city) : city;
  var source = "AlAdhan / Kalender Hijriah";
  var freshDays = {};
  var expectedCount = ((targetYear % 4 === 0 && targetYear % 100 !== 0) || targetYear % 400 === 0) ? 366 : 365;

  for (var month = 1; month <= 12; month++) {
    var url = "https://api.aladhan.com/v1/calendarByCity/" + targetYear + "/" + month +
      "?city=" + encodeURIComponent(apiCity) +
      "&country=" + encodeURIComponent("Indonesia") +
      (province ? "&state=" + encodeURIComponent(province) : "") +
      "&method=20&school=0&timezonestring=" + encodeURIComponent(timezone);
    var response = UrlFetchApp.fetch(url, {
      method: "get",
      muteHttpExceptions: true,
      headers: { "Accept": "application/json" }
    });
    var http = response.getResponseCode();
    if (http < 200 || http >= 300) {
      throw new Error("AlAdhan kalender Hijriah HTTP " + http + " pada bulan " + month + ".");
    }
    var payload = JSON.parse(response.getContentText() || "{}");
    var rows = payload && Array.isArray(payload.data) ? payload.data : [];
    var expectedMonthDays = new Date(targetYear, month, 0).getDate();
    if (rows.length !== expectedMonthDays) {
      throw new Error("Respons AlAdhan bulan " + month + " tidak lengkap: " + rows.length +
        " dari " + expectedMonthDays + " tanggal.");
    }

    rows.forEach(function(row) {
      var dateInfo = row && row.date || {};
      var gregorian = dateInfo.gregorian || {};
      var iso = String(gregorian.iso || "").slice(0, 10);
      var rawDate = String(gregorian.date || "");
      var parts = rawDate.split("-");
      var date = /^\d{4}-\d{2}-\d{2}$/.test(iso)
        ? iso
        : (parts.length === 3 ? parts[2] + "-" + parts[1] + "-" + parts[0] : "");
      var hijri = dateInfo.hijri || {};
      var hijriMonth = hijri.month && hijri.month.en || "";
      var day = String(hijri.day || "");
      var hijriYear = String(hijri.year || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 4) !== String(targetYear) ||
          !day || !hijriMonth || !hijriYear) return;

      var localMonth = normalizeHijriMonthNameIndonesia_(hijriMonth);
      freshDays[date] = {
        gregorian_date: date,
        hijri_day: day,
        hijri_month_name: localMonth,
        hijri_year: hijriYear,
        hijri_formatted: day + " " + localMonth + " " + hijriYear + " H",
        source: source
      };
    });
  }

  if (Object.keys(freshDays).length !== expectedCount ||
      !hijriAnnualDaysComplete_(freshDays, String(targetYear))) {
    throw new Error("Kalender tahunan AlAdhan tidak lengkap: " + Object.keys(freshDays).length +
      " dari " + expectedCount + " tanggal. Cache lama dipertahankan.");
  }

  var doc;
  try { doc = readGithubJsonFile_(HIJRI_SEASON_CACHE_PATH_); } catch (ignoreRead) { doc = null; }
  if (!doc || typeof doc !== "object") doc = { success: true, years: {} };
  if (!doc.years || typeof doc.years !== "object") doc.years = {};
  var freshText = JSON.stringify(freshDays);
  var oldEntry = doc.years[String(targetYear)];
  var changed = !oldEntry || String(oldEntry.source || "") !== source ||
    JSON.stringify(oldEntry.days || {}) !== freshText;

  if (!changed) {
    Logger.log("CACHE KALENDER HIJRIAH ALADHAN SUDAH TERBARU: " + targetYear);
    return { checked: true, updated: false, reason: "no_change", source: source, year: targetYear, receivedDays: expectedCount };
  }

  doc.years[String(targetYear)] = {
    year: targetYear,
    source: source,
    updatedAt: new Date().toISOString(),
    dayCount: expectedCount,
    days: freshDays
  };
  doc.success = true;
  doc.source = source;
  doc.updatedAt = new Date().toISOString();
  doc.yearCount = Object.keys(doc.years).length;
  writeGithubJsonFile_(HIJRI_SEASON_CACHE_PATH_, doc,
    "Refresh kalender Hijriah " + targetYear + " dari AlAdhan");
  Logger.log("KALENDER HIJRIAH ALADHAN DISIMPAN KE GITHUB: tahun=" + targetYear + ", tanggal=" + expectedCount);
  return { checked: true, updated: true, source: source, year: targetYear, receivedDays: expectedCount };
}

function refreshActiveCityMonthlyPrayerCache_(today) {
  // Memvalidasi tanggal berjalan melalui AlAdhan. Code.gs membandingkan
  // entri tanggal ini dan hanya menulis cache bulanan bila datanya berubah.
  var fresh = getPrayerSchedule(today, { forceRefresh: true });
  if (fresh && fresh.success === true &&
      String(fresh.tanggal || "") === String(today) &&
      String(fresh.source || "").indexOf("AlAdhan") >= 0 &&
      isCompletePrayerScheduleSafe_(fresh.jadwal)) {
    var changed = String(fresh.cacheSource || "").indexOf("perubahan tersimpan") >= 0;
    return {
      checked: true, updated: changed, alAdhanValidated: true,
      source: fresh.source, month: String(today).slice(0, 7),
      kota: fresh.kota, tanggal: today, cacheSource: fresh.cacheSource || "",
      schedule: fresh, reason: changed ? "current_date_changed" : "no_change"
    };
  }

  var detail = fresh && (fresh.alAdhanError || fresh.error) || "Respons AlAdhan tidak valid.";
  Logger.log("VALIDASI ALADHAN GAGAL; menggunakan cache bulanan terakhir jika valid: " + detail);
  var cached = getPrayerSchedule(today);
  if (cached && cached.success === true &&
      String(cached.tanggal || "") === String(today) &&
      String(cached.source || "").indexOf("AlAdhan") >= 0 &&
      isCompletePrayerScheduleSafe_(cached.jadwal)) {
    return {
      checked: true, updated: false, alAdhanValidated: false, cacheFallback: true,
      source: cached.source, month: String(today).slice(0, 7),
      kota: cached.kota, tanggal: today, cacheSource: cached.cacheSource || "Cache",
      reason: "aladhan_unavailable_cache_retained", detail: detail
    };
  }

  Logger.log("AlAdhan gagal dan cache tidak dapat dibaca; tidak ada cache yang ditimpa.");
  return {
    checked: true, updated: false, alAdhanValidated: false,
    cacheFallback: false, reason: "aladhan_unavailable_and_cache_unavailable",
    detail: detail
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
  Logger.log("Trigger aktif: validasi harian tanggal berjalan melalui AlAdhan; cache diperbarui hanya bila data berubah dan cache lama dipertahankan jika API gagal.");
}
