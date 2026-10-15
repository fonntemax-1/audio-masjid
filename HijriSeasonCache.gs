/**
 * VALIDASI HARIAN CACHE HIJRIAH + VALIDASI JADWAL BULANAN
 *
 * Aturan:
 * - Kalender Hijriah divalidasi setiap hari menggunakan AlAdhan saja.
 * - Hanya tanggal hari ini yang dibandingkan; cache ditulis hanya jika data hari ini berubah.
 * - Jadwal sholat kota aktif divalidasi ulang sekali pada tanggal 1 setiap bulan.
 * - Hanya kota aktif pada panels!C5:C10; tidak memproses semua kota.
 * - Data GitHub lama dipertahankan bila API gagal atau hasil tidak lengkap.
 * - Tidak mengubah audio, scheduler sholat, atau trigger yang tidak terkait.
 *
 * Pasang dengan menjalankan setupHijriSeasonCacheTrigger() satu kali.
 * Uji manual dengan runHijriSeasonCacheCheckNow().
 */

// Cache kalender Hijriah dikelola Code.gs pada folder WIB/WITA/WIT.
var HIJRI_SEASON_MONTHLY_PATH_ = "data/prayer-monthly-cache.json";
var HIJRI_SEASON_TZ_ = "Asia/Makassar";

function runHijriSeasonCacheCheckNow() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log("Validasi cache Hijriah harian dilewati: proses lain sedang berjalan.");
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
    Logger.log("HASIL VALIDASI HARIAN ALADHAN: " + JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function hijriSeasonRefreshIfNeeded_(today) {
  // Kompatibilitas pemanggil lama; semua baca/tulis cache diarahkan ke format zona baru.
  return validateHijriCalendarCacheDaily();
}

/**
 * Kompatibilitas fungsi lama: hanya boleh membuat cache untuk tahun berjalan,
 * melalui satu-satunya implementasi baru di Code.gs.
 */
function refreshHijriCalendarCacheYearFromAlAdhan_(year) {
  var loc = getLokasiPanels();
  if (!loc || loc.success !== true || !loc.kota) throw new Error('Lokasi panels!C5:C10 belum lengkap.');
  var timezone = loc.timezone || HIJRI_SEASON_TZ_;
  var currentYear = Number(Utilities.formatDate(new Date(), timezone, 'yyyy'));
  if (Number(year) !== currentYear) {
    throw new Error('Cache kalender hanya menyimpan tahun berjalan (' + currentYear + ').');
  }
  return refreshHijriCalendarCacheFromAlAdhan();
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
    updated: String(schedule.cacheSource || "").indexOf("tanpa perubahan") < 0,
    source: schedule.source || "AlAdhan API / method 20 (Indonesia)",
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

function runPrayerMonthlyCacheCheckNow() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log("Validasi cache jadwal sholat bulanan dilewati: proses lain sedang berjalan.");
    return { success: false, skipped: true, reason: "lock_busy" };
  }
  try {
    var loc = getLokasiPanels();
    if (!loc || loc.success !== true || !loc.kota) throw new Error('Lokasi panels!C5:C10 belum lengkap.');
    var timezone = loc.timezone || HIJRI_SEASON_TZ_;
    var today = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");
    if (today.slice(8, 10) !== "01") {
      Logger.log("Validasi cache jadwal sholat bulanan dilewati; bukan tanggal 1 di zona lokasi aktif.");
      return { success: true, skipped: true, reason: "not_first_day", date: today };
    }
    var result = refreshActiveCityMonthlyPrayerCache_(today);
    Logger.log("VALIDASI BULANAN CACHE JADWAL SHOLAT: " + JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

/** Nama setup lama tetap didukung, tetapi memasang pemicu zona baru. */
function setupHijriSeasonCacheTrigger() {
  return setupHijriCalendarCacheAutoTriggers();
}
