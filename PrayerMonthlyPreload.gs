/**
 * PRELOAD CACHE JADWAL SHOLAT BULAN BERIKUTNYA
 * API Indonesia tetap sumber utama.
 * Hanya memproses kota aktif pada panels!C5:C10.
 * Tidak menyentuh audio, scheduler sholat, atau cache semua kota.
 *
 * Setelah file ini ditambahkan ke Apps Script, jalankan
 * setupPrayerNextMonthCacheTrigger() SATU KALI untuk memasang trigger.
 * Untuk uji manual, jalankan autoPrepareNextMonthPrayerCache().
 */

function autoPrepareNextMonthPrayerCache() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log("PRELOAD BULAN DEPAN dilewati: proses cache lain sedang berjalan.");
    return { success: false, skipped: true, reason: "lock_busy" };
  }

  try {
    const ss = getSpreadsheet();
    const panels = ss.getSheetByName("panels");
    if (!panels) throw new Error('Sheet "panels" tidak ditemukan.');

    const loc = panels.getRange("C5:C10").getDisplayValues().map(function(row) {
      return String(row[0] || "").trim();
    });
    const city = loc[0];
    const province = loc[1];
    const timezone = loc[3] || "Asia/Makassar";
    if (!city) throw new Error("panels!C5 (kota aktif) kosong.");

    // Hitung tanggal berdasarkan kalender lokal kota aktif, bukan zona waktu server.
    const today = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");
    let year = Number(today.slice(0, 4));
    let month = Number(today.slice(5, 7)) + 1;
    if (month > 12) {
      month = 1;
      year++;
    }
    const monthText = ("0" + month).slice(-2);
    const targetDate = year + "-" + monthText + "-01";

    Logger.log("PRELOAD JADWAL BULAN BERIKUTNYA: kota=" + city +
      ", provinsi=" + province + ", tanggal_target=" + targetDate +
      ", timezone=" + timezone);

    // getPrayerSchedule memvalidasi seluruh tanggal pada respons bulanan dan
    // menyimpan bulan yang belum ada ke data/prayer-monthly-cache.json di GitHub.
    const result = getPrayerSchedule(targetDate, { forceRefresh: true });
    if (!result || result.success !== true || result.tanggal !== targetDate ||
        !result.jadwal || !isCompletePrayerScheduleSafe_(result.jadwal)) {
      const reason = result && (result.error || result.apiIndonesiaError || result.fallbackReason);
      throw new Error("Preload jadwal bulan berikutnya gagal/hasil tidak lengkap." +
        (reason ? " Detail: " + reason : ""));
    }

    const output = {
      success: true,
      kota: result.kota || city,
      regency_id: String(result.regency_id || ""),
      targetDate: targetDate,
      month: targetDate.slice(0, 7),
      source: result.source || "API Indonesia / Kemenag",
      note: "Cache bulanan API Indonesia berhasil diperiksa/ditulis ke GitHub."
    };
    Logger.log("PRELOAD JADWAL BULAN BERIKUTNYA BERHASIL: " + JSON.stringify(output));
    return output;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Jalankan SATU KALI untuk memasang trigger bulanan tanggal 25 pukul 03.00.
 * Trigger hanya dihapus/dibuat untuk handler preload ini; trigger lain,
 * termasuk audio dan scheduler sholat, tidak disentuh.
 */
function setupPrayerNextMonthCacheTrigger() {
  const handler = "autoPrepareNextMonthPrayerCache";
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Seluruh kota di Indonesia berada di rentang zona waktu ini.
  // Jam 03.00 WIB setara 04.00 WITA atau 05.00 WIT; tanggal tetap tanggal 25.
  ScriptApp.newTrigger(handler)
    .timeBased()
    .onMonthDay(25)
    .atHour(3)
    .inTimezone("Asia/Jakarta")
    .create();

  Logger.log("TRIGGER PRELOAD AKTIF: setiap tanggal 25, pukul sekitar 03.00 WIB; " +
    "hanya kota aktif dan hanya cache bulan berikutnya.");
}
