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
  const apiKey = String(PropertiesService.getScriptProperties().getProperty("API_INDONESIA_KEY") || "").trim();
  if (!apiKey) throw new Error("Script Property API_INDONESIA_KEY belum diisi.");

  // Tarik daftar langsung dari API (bukan CacheService) agar daftar baru benar-benar segar.
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
  if (!list.length) throw new Error("Daftar wilayah API kosong; cache lama tidak diubah.");

  const oldDocument = readGithubJsonFile_("data/prayer-cache.json") || {};
  const oldCities = oldDocument.cities && typeof oldDocument.cities === "object" ? oldDocument.cities : {};
  const oldByName = {};
  Object.keys(oldCities).forEach(function(key) {
    const item = oldCities[key] || {};
    const nameKey = normalizePrayerCacheCityName_(item.kota) + "|" + normalizePrayerCacheCityName_(item.provinsi);
    if (nameKey !== "|") oldByName[nameKey] = { key: key, item: item };
  });

  function slugify(value) {
    return String(value || "").toLowerCase()
      .replace(/^(kota|kabupaten|kab\.?|kabup\.?|kota adm\.?)\s+/i, "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "wilayah";
  }
  function timezoneFromProvince(province) {
    const p = normalizePrayerCacheCityName_(province);
    const wit = ["MALUKU", "MALUKU UTARA", "PAPUA", "PAPUA BARAT", "PAPUA BARAT DAYA",
      "PAPUA TENGAH", "PAPUA PEGUNUNGAN", "PAPUA SELATAN"];
    const wita = ["BALI", "NUSA TENGGARA BARAT", "NUSA TENGGARA TIMUR",
      "KALIMANTAN SELATAN", "KALIMANTAN TIMUR", "KALIMANTAN TENGAH", "KALIMANTAN UTARA",
      "SULAWESI UTARA", "GORONTALO", "SULAWESI TENGAH", "SULAWESI BARAT",
      "SULAWESI SELATAN", "SULAWESI TENGGARA"];
    if (wit.indexOf(p) >= 0) return "Asia/Jayapura";
    if (wita.indexOf(p) >= 0) return "Asia/Makassar";
    return "Asia/Jakarta";
  }

  const freshCities = {};
  const usedKeys = {};
  list.forEach(function(apiCity) {
    const regencyId = String(apiCity.regency_id || "").trim();
    const officialName = String(apiCity.regency_name || "").trim();
    const province = String(apiCity.province_name || "").trim();
    if (!regencyId || !officialName) return;
    const nameKey = normalizePrayerCacheCityName_(officialName) + "|" + normalizePrayerCacheCityName_(province);
    const legacy = oldByName[nameKey] || null;
    let key = legacy ? legacy.key : slugify(officialName);
    if (usedKeys[key]) key = key + "-" + regencyId;
    usedKeys[key] = true;
    const timezone = legacy && legacy.item.timezone ? legacy.item.timezone : timezoneFromProvince(province);
    freshCities[key] = {
      success: false,
      kota: officialName,
      provinsi: province,
      slug: legacy && legacy.item.slug ? legacy.item.slug : key,
      zona: timezone === "Asia/Jakarta" ? "WIB" : timezone === "Asia/Jayapura" ? "WIT" : "WITA",
      timezone: timezone,
      gmt: timezone === "Asia/Jakarta" ? "GMT+7" : timezone === "Asia/Jayapura" ? "GMT+9" : "GMT+8",
      regency_id: regencyId,
      source: "API Indonesia",
      pending: true
    };
  });
  const count = Object.keys(freshCities).length;
  if (!count) throw new Error("Daftar API tidak memiliki wilayah dengan regency_id dan regency_name; cache lama tidak diubah.");

  const now = new Date().toISOString();
  const freshDocument = {
    success: true,
    source: "API Indonesia",
    generatedAt: now,
    updatedAt: now,
    cityCount: count,
    cities: freshCities
  };
  writeGithubJsonFile_("data/prayer-cache.json", freshDocument,
    "Ganti cache wilayah lama dengan daftar terbaru API Indonesia (" + count + " wilayah)");
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(PRAYER_CACHE_ALL_CITIES_DAY_KEY_);
  props.setProperty(PRAYER_CACHE_ALL_CITIES_PROGRESS_KEY_, "0");
  props.deleteProperty("PRAYER_CACHE_ALL_CITIES_LAST_RESULT");
  // Bersihkan cache sementara daftar kota agar pemanggilan berikutnya mengambil daftar baru.
  CacheService.getScriptCache().remove("APIID_SHOLAT_CITIES_V1");
  Logger.log("CACHE LAMA DIGANTI DENGAN DAFTAR API INDONESIA: " + JSON.stringify({
    wilayahApi: list.length, wilayahDisimpan: count, jadwal: "menunggu batch",
    langkahBerikutnya: "jalankan runPrayerCacheAllCitiesBatchNow() berulang sampai selesai"
  }));
  return { success: true, wilayahApi: list.length, wilayahDisimpan: count, jadwal: "menunggu batch" };
}

/**
 * Handler pemicu berkala. Memproses maksimal 15 kota per eksekusi.
 * Setelah seluruh kota selesai, menunggu hari UTC berikutnya sebelum mengulang.
 */
function processPrayerCacheAllCitiesBatch_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    Logger.log("CACHE SEMUA KOTA: eksekusi lain masih berjalan; batch dilewati.");
    return;
  }
  try {
    const props = PropertiesService.getScriptProperties();
    const utcDay = Utilities.formatDate(new Date(), "Etc/UTC", "yyyy-MM-dd");
    const savedDay = String(props.getProperty(PRAYER_CACHE_ALL_CITIES_DAY_KEY_) || "");
    let start = savedDay === utcDay ? Number(props.getProperty(PRAYER_CACHE_ALL_CITIES_PROGRESS_KEY_) || 0) : 0;
    if (savedDay === utcDay && isFinite(start) && start > 0) {
      // Semua kota sudah diproses hari ini: jangan mengulang batch dari awal.
      const previousResult = String(props.getProperty("PRAYER_CACHE_ALL_CITIES_LAST_RESULT") || "");
      try {
        const parsedPrevious = JSON.parse(previousResult);
        if (parsedPrevious && parsedPrevious.selesai === true) {
          Logger.log("CACHE SEMUA KOTA: seluruh batch hari UTC " + utcDay + " sudah selesai.");
          return;
        }
      } catch (ignorePreviousResult) {}
    }

    const document = readGithubJsonFile_("data/prayer-cache.json");
    if (!document || !document.cities || typeof document.cities !== "object") {
      throw new Error("data/prayer-cache.json tidak memiliki objek cities yang valid.");
    }
    const keys = Object.keys(document.cities).sort();
    if (!keys.length) throw new Error("Tidak ada kota dalam data/prayer-cache.json.");
    if (!isFinite(start) || start < 0 || start >= keys.length) start = 0;

    const apiKey = String(props.getProperty("API_INDONESIA_KEY") || "").trim();
    if (!apiKey) throw new Error("Script Property API_INDONESIA_KEY belum diisi.");
    const apiCities = getPrayerCacheAllCitiesApiList_();
    const end = Math.min(start + PRAYER_CACHE_ALL_CITIES_BATCH_SIZE_, keys.length);
    let updated = 0;
    let failed = 0;
    const failures = [];

    for (let i = start; i < end; i++) {
      const key = keys[i];
      const prior = document.cities[key];
      if (!prior || !prior.kota) {
        failed++;
        failures.push(key + ": entri lama tidak lengkap");
        continue;
      }
      try {
        const entry = fetchPrayerCacheAllCitiesEntry_(prior, apiCities, apiKey);
        document.cities[key] = entry;
        updated++;
      } catch (cityError) {
        failed++;
        failures.push(key + ": " + (cityError && cityError.message ? cityError.message : cityError));
        const errorText = cityError && cityError.message ? cityError.message : String(cityError);
        Logger.log("CACHE SEMUA KOTA GAGAL [" + key + "]: " +
          (cityError && cityError.stack ? cityError.stack : cityError));
        // Pertahankan metadata kota untuk batch berikutnya, tetapi buang jadwal lama
        // supaya data dari penyedia lain tidak disajikan sebagai cache API Indonesia.
        document.cities[key] = {
          success: false,
          kota: String(prior.kota || ""),
          provinsi: String(prior.provinsi || ""),
          regency_id: String(prior.regency_id || ""),
          slug: String(prior.slug || key),
          zona: String(prior.zona || ""),
          timezone: String(prior.timezone || "Asia/Makassar"),
          gmt: String(prior.gmt || ""),
          source: "API Indonesia",
          error: errorText,
          attemptedAt: new Date().toISOString()
        };
      }
    }

    document.success = true;
    document.cityCount = Object.keys(document.cities).length;
    document.generatedAt = new Date().toISOString();
    document.updatedAt = document.generatedAt;
    writeGithubJsonFile_("data/prayer-cache.json", document,
      "Batch cache jadwal sholat semua kota " + utcDay + " (" + (start + 1) + "-" + end + ")");

    const next = end >= keys.length ? keys.length : end;
    props.setProperty(PRAYER_CACHE_ALL_CITIES_DAY_KEY_, utcDay);
    props.setProperty(PRAYER_CACHE_ALL_CITIES_PROGRESS_KEY_, String(next));
    props.setProperty("PRAYER_CACHE_ALL_CITIES_LAST_RESULT", JSON.stringify({
      utcDay: utcDay, mulai: start + 1, sampai: end, total: keys.length,
      diperbarui: updated, gagal: failed, selesai: next >= keys.length,
      failures: failures.slice(0, 20), timestamp: new Date().toISOString()
    }));
    Logger.log("CACHE SEMUA KOTA: " + JSON.stringify({
      mulai: start + 1, sampai: end, total: keys.length, diperbarui: updated,
      gagal: failed, selesai: next >= keys.length, failures: failures.slice(0, 20)
    }));
  } finally {
    lock.releaseLock();
  }
}

/**
 * Jalankan satu kali secara manual untuk memasang pemicu batch tiap 10 menit.
 * Hanya mengganti pemicu milik processPrayerCacheAllCitiesBatch_.
 * Tidak menghapus atau mengubah pemicu audio, cache satu kota, maupun pemicu lain.
 */
function setupPrayerCacheAllCitiesBatchTrigger() {
  const handler = PRAYER_CACHE_ALL_CITIES_HANDLER_;
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handler) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger(handler).timeBased().everyMinutes(10).create();
  Logger.log("PEMICU CACHE SEMUA KOTA AKTIF: batch setiap 10 menit; maksimal " +
    PRAYER_CACHE_ALL_CITIES_BATCH_SIZE_ + " kota per eksekusi.");
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
  processPrayerCacheAllCitiesBatch_();
  return getPrayerCacheAllCitiesBatchStatus();
}
