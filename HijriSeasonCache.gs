/**
 * CACHE HIJRIAH MUSIMAN + VALIDASI JADWAL BULANAN
 *
 * Aturan:
 * - Trigger harian, tetapi di luar jendela khusus tidak memanggil API kalender.
 * - Kalender Hijriah AlAdhan diperiksa ulang pada H-3, H-2, dan H-1
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
  var year = String(today || '').slice(0, 4);
  var doc = null;
  var yearEntry = null;
  var days = null;
  try {
    doc = readGithubJsonFile_(HIJRI_SEASON_CACHE_PATH_);
    yearEntry = doc && doc.years && doc.years[year];
    days = yearEntry && yearEntry.days;
  } catch (error) {
    Logger.log("Cache kalender Hijriah AlAdhan tidak dapat dibaca: " + String(error && error.message || error));
  }

  var trusted = String(doc && doc.source || '') === 'AlAdhan / Kalender Hijriah' &&
    String(yearEntry && yearEntry.source || '') === 'AlAdhan / Kalender Hijriah' &&
    days && hijriAnnualDaysComplete_(days, year);
  if (!trusted) {
    Logger.log("Cache kalender Hijriah belum valid dari AlAdhan; melakukan refresh tahunan tanpa fallback.");
    return refreshHijriCalendarCacheFromAlAdhan(Number(year));
  }

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

  if (!target) {
    Logger.log("Kalender Hijriah AlAdhan: di luar jendela H-3 sampai H-1 Ramadhan/Syawal/Muharam; tidak memanggil API.");
    return { checked: false, updated: false, reason: "outside_special_window", source: "AlAdhan / Kalender Hijriah" };
  }
  Logger.log("Jendela khusus Hijriah AlAdhan aktif: " + target.month + ", tanggal=" + target.date +
    ", H-" + target.daysUntil + ". Memperbarui kalender tahunan dari AlAdhan.");
  var result = refreshHijriCalendarCacheFromAlAdhan(Number(year));
  result.target = target;
  return result;
}

/**
 * Refresh kalender Hijriah satu tahun hanya dari AlAdhan.
 * Memanggil calendarByCity untuk setiap bulan dan tidak memakai sumber alternatif.
 * Jalankan manual setelah file ini diperbarui agar cache lama AlAdhan diganti.
 */
function refreshHijriCalendarCacheFromAlAdhan(year) {
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

      var monthMap = {
        "muharram": "Muharam", "safar": "Safar", "rabi' al-awwal": "Rabiul Awal",
        "rabi al-awwal": "Rabiul Awal", "rabi' al-thani": "Rabiul Akhir",
        "rabi al-thani": "Rabiul Akhir", "jumada al-awwal": "Jumadil Awal",
        "jumada al-thani": "Jumadil Akhir", "rajab": "Rajab", "sha'ban": "Syaban",
        "shaban": "Syaban", "ramadan": "Ramadhan", "shawwal": "Syawal",
        "dhu al-qi'dah": "Dzulkaidah", "dhu al-qidah": "Dzulkaidah",
        "dhu al-hijjah": "Dzulhijjah"
      };
      var localMonth = monthMap[String(hijriMonth).toLowerCase()] || hijriMonth;
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
  // Gunakan satu jalur operasional yang sama dengan aplikasi: getPrayerSchedule.
  // Refresh eksplisit meminta AlAdhan dan memublikasikan cache per kota.
  var schedule = getPrayerSchedule(today, { forceRefresh: true });
  if (!schedule || schedule.success !== true ||
      !schedule.jadwal || !isCompletePrayerScheduleSafe_(schedule.jadwal)) {
    var detail = schedule && (schedule.error || schedule.alAdhanError);
    Logger.log("Validasi cache jadwal AlAdhan gagal: " + (detail || "respons tidak lengkap"));
    return { checked: true, updated: false, reason: "aladhan_refresh_failed",
      detail: detail || "Respons jadwal tidak lengkap" };
  }
  return {
    checked: true,
    updated: true,
    source: schedule.source || "AlAdhan / Kemenag",
    month: today.slice(0, 7),
    kota: schedule.kota,
    tanggal: today,
    cacheSource: schedule.cacheSource || "",
    note: "Cache operasional per kota divalidasi melalui AlAdhan."
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
