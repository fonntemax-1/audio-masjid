/**
 * CACHE JADWAL SHOLAT SEMUA KOTA — branch migration
 *
 * Memperbarui kota-kota yang sudah terdaftar di data/prayer-cache.json
 * secara bertahap melalui API Indonesia. Kota yang gagal ditandai tidak tersedia
 * agar jadwal lama dari penyedia lain tidak tetap disajikan sebagai data aktif.
 *
 * Tidak mengubah scheduler audio atau alur getPrayerSchedule() yang aktif.
 */

const PRAYER_CACHE_ALL_CITIES_BATCH_SIZE_ = 15;
const PRAYER_CACHE_ALL_CITIES_HANDLER_ = "processPrayerCacheAllCitiesBatch_";
const PRAYER_CACHE_ALL_CITIES_PROGRESS_KEY_ = "PRAYER_CACHE_ALL_CITIES_PROGRESS_V1";
const PRAYER_CACHE_ALL_CITIES_DAY_KEY_ = "PRAYER_CACHE_ALL_CITIES_UTC_DAY_V1";

function normalizePrayerCacheCityName_(value) {
  return String(value || "").toUpperCase()
    .replace(/^(KOTA\s+ADM\.?\s*|KOTA\s+|KABUPATEN\s+|KABUP\.?\s+|KAB\.?\s+)/, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getPrayerCacheAllCitiesApiList_() {
  const cache = CacheService.getScriptCache();
  const cacheKey = "APIID_SHOLAT_CITIES_V1";
  const cached = cache.get(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (ignore) {}
  }

  const apiKey = String(PropertiesService.getScriptProperties().getProperty("API_INDONESIA_KEY") || "").trim();
  if (!apiKey) throw new Error("Script Property API_INDONESIA_KEY belum diisi.");
  const response = UrlFetchApp.fetch("https://use.apiindonesia.id/api/v1/sholat/list-kota", {
    method: "get",
    muteHttpExceptions: true,
    headers: { "x-api-key": apiKey, "Accept": "application/json" }
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error("API Indonesia daftar kota HTTP " + response.getResponseCode() + ".");
  }
  const payload = JSON.parse(response.getContentText() || "{}");
  const list = payload && Array.isArray(payload.data) ? payload.data : [];
  if (!list.length) throw new Error("API Indonesia tidak mengembalikan daftar kota.");
  try { cache.put(cacheKey, JSON.stringify(list), 21600); } catch (ignorePut) {}
  return list;
}

function fetchPrayerCacheAllCitiesEntry_(prior, apiCities, apiKey) {
  const cityName = normalizePrayerCacheCityName_(prior.kota);
  const provinceName = normalizePrayerCacheCityName_(prior.provinsi);
  // Gunakan ID API sebagai kunci utama; nama hanya fallback untuk cache lama.
  let matches = prior.regency_id
    ? apiCities.filter(function(item) {
        return String(item.regency_id || "").trim() === String(prior.regency_id).trim();
      })
    : apiCities.filter(function(item) {
        return normalizePrayerCacheCityName_(item.regency_name) === cityName;
      });
  if (matches.length > 1 && provinceName) {
    const byProvince = matches.filter(function(item) {
      return normalizePrayerCacheCityName_(item.province_name) === provinceName;
    });
    if (byProvince.length) matches = byProvince;
  }
  if (!matches.length) throw new Error("Kota tidak ditemukan pada daftar API Indonesia: " + prior.kota);
  const regencyId = String(matches[0].regency_id || "").trim();
  if (!regencyId) throw new Error("regency_id kosong untuk " + prior.kota);

  const timezone = String(prior.timezone || "Asia/Makassar");
  const date = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");
  const cacheKey = "PRAYER_CACHE_ALL_CITY_" + regencyId + "_" + date.replace(/-/g, "");
  const cache = CacheService.getScriptCache();
  let payload;
  const cached = cache.get(cacheKey);
  if (cached) {
    try { payload = JSON.parse(cached); } catch (ignoreCached) { payload = null; }
  }
  if (!payload) {
    const url = "https://use.apiindonesia.id/api/v1/sholat?kabupaten_id=" +
      encodeURIComponent(regencyId) + "&tanggal=" + encodeURIComponent(date);
    const response = UrlFetchApp.fetch(url, {
      method: "get",
      muteHttpExceptions: true,
      headers: { "x-api-key": apiKey, "Accept": "application/json" }
    });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      throw new Error("API Indonesia jadwal HTTP " + response.getResponseCode() + " untuk " + prior.kota);
    }
    payload = JSON.parse(response.getContentText() || "{}");
    try { cache.put(cacheKey, JSON.stringify(payload), 21600); } catch (ignoreSchedulePut) {}
  }

  const data = payload && payload.data;
  if (!data || typeof data !== "object") throw new Error("Data jadwal kosong untuk " + prior.kota);
  function time(value) {
    const m = String(value == null ? "" : value).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    return m ? ("0" + m[1]).slice(-2) + ":" + m[2] : "";
  }
  const jadwal = {
    subuh: time(data.shubuh),
    terbit: time(data.terbit),
    dzuhur: time(data.dzuhur),
    ashar: time(data.ashr),
    maghrib: time(data.maghrib),
    isya: time(data.isya)
  };
  if (!Object.keys(jadwal).every(function(key) { return /^\d{2}:\d{2}$/.test(jadwal[key]); })) {
    throw new Error("Jadwal tidak lengkap/format salah untuk " + prior.kota);
  }
  if (String(data.date || date) !== date) {
    throw new Error("Tanggal respons tidak cocok untuk " + prior.kota + ": " + String(data.date || ""));
  }

  return {
    success: true,
    tanggal: date,
    kota: prior.kota,
    provinsi: prior.provinsi || String(matches[0].province_name || ""),
    regency_id: String(matches[0].regency_id || prior.regency_id || ""),
    slug: prior.slug,
    zona: prior.zona || (timezone === "Asia/Jakarta" ? "WIB" : timezone === "Asia/Jayapura" ? "WIT" : "WITA"),
    timezone: timezone,
    gmt: prior.gmt || (timezone === "Asia/Jakarta" ? "GMT+7" : timezone === "Asia/Jayapura" ? "GMT+9" : "GMT+8"),
    source: "API Indonesia / Kemenag",
    jadwal: jadwal,
    generatedAt: new Date().toISOString()
  };
}

/**
 * MEMBANGUN ULANG CACHE DARI DAFTAR RESMI API INDONESIA.
 * Mengganti daftar kota lama dengan seluruh wilayah yang dikembalikan API.
 * Jalankan sekali sebelum memulai batch baru. Jadwal kemudian diisi bertahap
 * oleh runPrayerCacheAllCitiesBatchNow(); tidak menyentuh scheduler audio.
 */
function startPrayerCacheRebuildFromApiIndonesia() {
  throw new Error("FUNGSI LAMA DINONAKTIFKAN. Jangan membangun ulang jadwal 514 kota. Daftar kota disinkronkan melalui refreshDaftarKotaAPIIndonesia(); jadwal bulanan hanya diambil untuk kota aktif oleh getPrayerSchedule().");
}

/**
 * Handler pemicu berkala. Memproses maksimal 15 kota per eksekusi.
 * Setelah seluruh kota selesai, menunggu hari UTC berikutnya sebelum mengulang.
 */
function processPrayerCacheAllCitiesBatch_() {
  // Dinonaktifkan: batch semua kota boros kuota API dan tidak diperlukan.
  // Handler dipertahankan agar trigger lama aman sampai dihapus manual.
  Logger.log("CACHE SEMUA KOTA DINONAKTIFKAN: tidak ada jadwal kota yang diunduh.");
  return {
    success: true,
    disabled: true,
    message: "Batch seluruh kota dinonaktifkan. Jadwal bulanan hanya diambil untuk kota aktif."
  };
}

/**
 * Jalankan satu kali secara manual untuk memasang pemicu batch tiap 10 menit.
 * Hanya mengganti pemicu milik processPrayerCacheAllCitiesBatch_.
 * Tidak menghapus atau mengubah pemicu audio, cache satu kota, maupun pemicu lain.
 */
function setupPrayerCacheAllCitiesBatchTrigger() {
  throw new Error("Pemicu batch semua kota tidak boleh dipasang lagi. Gunakan setupDropdownKotaAPIIndonesia() untuk sinkronisasi daftar wilayah dan cache bulanan kota aktif.");
}

/**
 * Hentikan pemicu lama yang sebelumnya mengunduh jadwal untuk semua kota.
 * Aman: hanya menghapus trigger processPrayerCacheAllCitiesBatch_.
 */
function stopPrayerCacheAllCitiesBatchTrigger() {
  const handler = PRAYER_CACHE_ALL_CITIES_HANDLER_;
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  Logger.log("PEMICU BATCH SEMUA KOTA DIHENTIKAN: " + removed + " trigger dihapus.");
  return { success: true, triggersRemoved: removed };
}

/** Status ringkas batch terakhir; aman dijalankan manual dari editor Apps Script. */
function getPrayerCacheAllCitiesBatchStatus() {
  const props = PropertiesService.getScriptProperties();
  const progress = Number(props.getProperty(PRAYER_CACHE_ALL_CITIES_PROGRESS_KEY_) || 0);
  let lastResult = null;
  try { lastResult = JSON.parse(props.getProperty("PRAYER_CACHE_ALL_CITIES_LAST_RESULT") || "null"); } catch (ignore) {}
  return {
    utcDay: props.getProperty(PRAYER_CACHE_ALL_CITIES_DAY_KEY_) || "",
    progress: progress,
    lastResult: lastResult
  };
}


/**
 * Wrapper publik untuk menjalankan satu batch manual dari editor Apps Script.
 * Tidak memasang atau mengubah trigger apa pun.
 */
function runPrayerCacheAllCitiesBatchNow() {
  Logger.log("FUNGSI DINONAKTIFKAN: batch semua kota tidak lagi mengunduh jadwal.");
  return {
    success: true,
    disabled: true,
    message: "Tidak ada pemanggilan jadwal API untuk 514 kota."
  };
}
