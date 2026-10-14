
// =========================================================
// TV MASJID DISPLAY SIGNAGE 
// CODE.GS
// =========================================================


// =========================================================
// WEB APP
// =========================================================

function doPost(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = String(params.action || '');
  var isLogo = action === 'uploadLogo';
  if (action !== 'uploadQris' && !isLogo) {
    return qrisUploadResultPage_(false, 'Permintaan upload tidak dikenal.');
  }
  var resultType = isLogo ? 'logoUploadResult' : 'qrisUploadResult';
  var label = isLogo ? 'Logo' : 'QRIS';
  try {
    var props = PropertiesService.getScriptProperties();
    var expectedPin = String(props.getProperty('REMOTE_CONTROL_PIN') || '');
    var suppliedPin = String(params.pin || '');
    if (!expectedPin || expectedPin.length < 6 || suppliedPin !== expectedPin) {
      throw new Error('PIN remote tidak valid.');
    }
    var token = String(props.getProperty('GITHUB_UPLOAD_TOKEN') || '').trim();
    if (!token) {
      throw new Error('Token GitHub belum dikonfigurasi pada Script Properties.');
    }
    var mimeType = String(params.mimeType || '').trim().toLowerCase();
    var base64 = String(params.imageBase64 || '').replace(/\\s/g, '');
    if (mimeType !== 'image/png') throw new Error('Format gambar harus PNG.');
    if (!base64 || base64.length > 1400000 || !/^[A-Za-z0-9+/]+=*$/.test(base64)) {
      throw new Error('Data gambar kosong atau melebihi batas 1 MB.');
    }
    var bytes = Utilities.base64Decode(base64);
    if (!bytes || !bytes.length || bytes.length > 1024 * 1024) {
      throw new Error('Ukuran gambar maksimal 1 MB.');
    }
    if (bytes.length < 8 || (bytes[0] & 255) !== 137 || (bytes[1] & 255) !== 80 ||
        (bytes[2] & 255) !== 78 || (bytes[3] & 255) !== 71) {
      throw new Error('Isi file bukan gambar PNG yang valid.');
    }

    var filePath = isLogo ? 'image/logo.png' : 'image/QRIS.png';
    var apiUrl = 'https://api.github.com/repos/fonntemax-1/audio-masjid/contents/' + filePath + '?ref=main';
    var headers = {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    var getResponse = UrlFetchApp.fetch(apiUrl, {
      method: 'get', headers: headers, muteHttpExceptions: true
    });
    var getCode = getResponse.getResponseCode();
    if (getCode !== 200) {
      throw new Error('Tidak dapat membaca ' + filePath + ' di GitHub (HTTP ' + getCode + '). Pastikan file sudah ada dan token memiliki izin Contents.');
    }
    var existing = JSON.parse(getResponse.getContentText());
    var payload = {
      message: 'Update ' + label + ' signage via remote control',
      content: base64,
      sha: existing.sha,
      branch: 'main'
    };
    var putResponse = UrlFetchApp.fetch(apiUrl, {
      method: 'put',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var putCode = putResponse.getResponseCode();
    if (putCode < 200 || putCode >= 300) {
      var detail = '';
      try { detail = JSON.parse(putResponse.getContentText()).message || ''; } catch (ignore) {}
      throw new Error('GitHub menolak upload ' + label + ' (HTTP ' + putCode + ')' +
        (detail ? ': ' + detail : '') + '.');
    }
    var version = String(new Date().getTime());
    props.setProperty(isLogo ? 'LOGO_IMAGE_VERSION' : 'QRIS_IMAGE_VERSION', version);
    return qrisUploadResultPage_(true, label + ' berhasil diunggah.', version, resultType);
  } catch (error) {
    return qrisUploadResultPage_(false, error && error.message ? error.message : String(error), '', resultType);
  }
}

function qrisUploadResultPage_(success, message, version, resultType) {
  var result = {
    type: String(resultType || 'qrisUploadResult'),
    success: success === true,
    message: String(message || ''),
    version: String(version || '')
  };
  var encoded = JSON.stringify(result).replace(/</g, '\\u003c');
  var html = '<!doctype html><html><head><meta charset="utf-8"></head><body><script>window.top.postMessage(' +
    encoded + ', "https://fonntemax-1.github.io");</script>Upload selesai.</body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doGet(e) {
  // API GitHub Pages ditangani oleh API.gs.
  const params = e && e.parameter ? e.parameter : {};

  // =====================================================
  // THEME DISPLAY - panels!C18
  // Ditangani langsung di Code.gs agar tidak bergantung pada
  // router API.gs terpisah. Tidak menyentuh audio/scheduler.
  // =====================================================
  if (String(params.action || '').trim() === 'getDisplayThemeSetting') {
    return createDisplayThemeJsonpResponse_(params.callback, getDisplayThemeSetting());
  }

  // =====================================================
  // PANEL C22 - FALLBACK ROUTE LANGSUNG DI CODE.GS
  // =====================================================
  // API.gs juga memiliki action ini. Route langsung di doGet
  // memastikan deployment yang masih memakai router Code.gs lama
  // tetap dapat membaca panels!C22 tanpa mengganggu audio/scheduler.
  if (String(params.action || '').trim() === 'getPanelIqomahBlackMode') {
    return createPanelIqomahBlackModeJsonpResponse_(
      params.callback,
      getPanelIqomahBlackMode()
    );
  }

  // Jalur realtime khusus KEUANGAN / QURBAN / PETUGAS SHOLAT.
  if (String(params.action || '').trim() === 'getRealtimePanelsFast') {
    return createRealtimePanelsFastJsonpResponse_(
      params.callback,
      getRealtimePanelsFast()
    );
  }

  if (String(params.api || '') === '1' || params.action) {
    return handleGithubApiRequest_(params);
  }

  // =====================================================
  // GITHUB PAGES ONLY
  // =====================================================
  // Code.gs tidak lagi menyajikan Index.html.
  // Tampilan/signage dijalankan dari GitHub Pages.
  //
  // Request tanpa parameter API hanya mengembalikan
  // respons informasi dan TIDAK menjalankan UI Apps Script.
  // Jalur API di atas tetap dipertahankan.
  // =====================================================
  return ContentService
    .createTextOutput('Digital Signage API - GitHub Pages')
    .setMimeType(ContentService.MimeType.TEXT);
}


// =========================================================
// JSONP KHUSUS REALTIME PANEL CEPAT
// =========================================================
function createRealtimePanelsFastJsonpResponse_(callback, data) {
  const cb = String(callback || '').trim();

  if (!/^[A-Za-z_$][A-Za-z0-9_$]*(?:\\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(cb)) {
    return ContentService
      .createTextOutput('Invalid JSONP callback.')
      .setMimeType(ContentService.MimeType.TEXT);
  }

  return ContentService
    .createTextOutput(
      cb + '(' + JSON.stringify(data || { success: false, error: 'Data kosong.' }) + ');'
    )
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// =========================================================
// JSONP KHUSUS THEME DISPLAY
// =========================================================
// Dipakai oleh index.html untuk membaca panels!C18 secara langsung.
// Callback divalidasi agar tetap aman. Tidak mengubah fungsi API lain.
// =========================================================
function createDisplayThemeJsonpResponse_(callback, theme) {
  const cb = String(callback || '').trim();

  if (!/^[A-Za-z_$][A-Za-z0-9_$]*(?:\\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(cb)) {
    return ContentService
      .createTextOutput('Invalid JSONP callback.')
      .setMimeType(ContentService.MimeType.TEXT);
  }

  return ContentService
    .createTextOutput(
      cb + '(' + JSON.stringify({
        success: true,
        data: theme
      }) + ');'
    )
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}


// =========================================================
// KONFIGURASI
// =========================================================

function getServerTime() {

  const now = new Date();

  const epochMs = now.getTime();

  return {
    success: true,
    epochMs: epochMs,
    iso: now.toISOString(),
    source: 'Google Apps Script server'
  };
}



function getSpreadsheet() {
  // SINGLE MASJID MODE
  // Spreadsheet utama selalu menggunakan ID original.
  // Sistem tenant/master/license/routing sudah dihapus.
  const spreadsheetId =
    '1NIWXjwnImmjAwXtnIDHa1quFEQyoQC7vOwH4t3vnucs';

  return SpreadsheetApp.openById(spreadsheetId);
}

function getLokasiPanels() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('panels');

    if (!sheet) {
      return {
        success: false,
        error: 'Sheet panels tidak ditemukan.',
        kota: '', provinsi: '', zona: '', timezone: '', gmt: '', slug: ''
      };
    }

    const values = sheet.getRange('C5:C10').getDisplayValues().map(function(row) {
      return String(row[0] || '').trim();
    });

    return {
      success: true,
      kota: values[0] || '',
      provinsi: values[1] || '',
      zona: values[2] || '',
      timezone: values[3] || '',
      gmt: values[4] || '',
      slug: values[5] || ''
    };
  } catch (error) {
    Logger.log('LOKASI PANELS ERROR: ' + error.message);
    return {
      success: false,
      error: error.message,
      kota: '', provinsi: '', zona: '', timezone: '', gmt: '', slug: ''
    };
  }
}

// =========================================================
// AMBIL DATA SHEET
// =========================================================

// Script Property:
// RAMADAN_DISPLAY = TRUE   -> tampilkan mode Ramadan
// RAMADAN_DISPLAY = FALSE  -> tampilkan mode normal
function getRamadanDisplaySetting() {
  const raw =
    PropertiesService
      .getScriptProperties()
      .getProperty('RAMADAN_DISPLAY');

  const value =
    String(raw === null || raw === undefined ? '' : raw)
      .trim()
      .toLowerCase();

  const enabled =
    value === 'true' ||
    value === '1' ||
    value === 'yes' ||
    value === 'ya' ||
    value === 'on' ||
    value === 'aktif';

  Logger.log(
    'RAMADAN_DISPLAY Script Property = [' +
    value +
    '] => ' +
    enabled
  );

  return enabled;
}


// =========================================================
// PANEL DISPLAY MODE - API TERPISAH UNTUK GITHUB PAGES
// =========================================================
// Hanya membaca panels!C2.
// AUTO = layar hitam saat countdown aktif.
// OFF  = tampilan normal.
// TIDAK menyentuh audio, YouTube, scheduler, Ramadan,
// Event, keuangan, Jumat, khutbah, atau data display lain.
// =========================================================
// UPDATED: panels!C18 menjadi sumber tema tampilan (HIJAU/MERAH/KUNING).
function getDisplayThemeSetting() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('panels');

  if (!sheet) {
    Logger.log('THEME: sheet panels tidak ditemukan => HIJAU');
    return 'HIJAU';
  }

  const raw = String(
    sheet.getRange('C18').getDisplayValue() || ''
  ).trim().toUpperCase();

  const theme =
    raw === 'MERAH' ? 'MERAH' :
    raw === 'KUNING' ? 'KUNING' :
    'HIJAU';

  Logger.log(
    'PANELS THEME C18 = [' + raw + '] => theme = [' + theme + ']'
  );

  return theme;
}


function getPanelDisplayMode() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('panels');

  if (!sheet) {
    Logger.log('PANELS: sheet panels tidak ditemukan => OFF');
    return {
      success: true,
      mode: 'OFF'
    };
  }

  const raw = String(
    sheet.getRange('C2').getDisplayValue() || ''
  ).trim().toUpperCase();

  const mode = raw === 'AUTO' ? 'AUTO' : 'OFF';

  Logger.log(
    'PANELS API TERPISAH C2 = [' +
    raw +
    '] => mode = [' +
    mode +
    ']'
  );

  return {
    success: true,
    mode: mode
  };
}


function createPanelIqomahBlackModeJsonpResponse_(callback, data) {
  const cb = String(callback || '').trim();

  if (!/^[A-Za-z_$][A-Za-z0-9_$]*(?:\\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(cb)) {
    return ContentService
      .createTextOutput('Invalid JSONP callback.')
      .setMimeType(ContentService.MimeType.TEXT);
  }

  return ContentService
    .createTextOutput(
      cb + '(' + JSON.stringify({
        success: true,
        data: data
      }) + ');'
    )
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}


/**
 * Jalankan SATU KALI dari Apps Script editor untuk menyelaraskan
 * validasi dropdown panels!C22 ke AUTO / OFF saja.
 * Nilai lama yang tidak valid (termasuk SLEEP, ON, dan STOP) diubah menjadi OFF.
 */
function repairPanelC22ValidationModes() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('panels');
  if (!sheet) throw new Error('Sheet panels tidak ditemukan.');

  const cell = sheet.getRange('C22');
  const previous = String(cell.getDisplayValue() || '').trim().toUpperCase();
  const allowedModes = ['AUTO', 'OFF'];

  if (allowedModes.indexOf(previous) < 0) {
    cell.setValue('OFF');
  }

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(allowedModes, true)
    .setAllowInvalid(false)
    .build();

  cell.setDataValidation(rule);
  SpreadsheetApp.flush();

  const current = String(cell.getDisplayValue() || '').trim().toUpperCase();
  Logger.log('PANELS C22 VALIDATION: previous=[' + previous + '] current=[' + current + '] options=' + allowedModes.join(','));

  return {
    success: true,
    previous: previous,
    current: current,
    options: allowedModes
  };
}

function getPanelIqomahBlackMode() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('panels');

    if (!sheet) {
      return { success: true, mode: 'OFF' };
    }

    const raw = String(
      sheet.getRange('C22').getDisplayValue() || ''
    ).trim().toUpperCase();

    const mode = raw === 'AUTO' || raw === 'OFF' ? raw : 'OFF';

    Logger.log(
      'PANELS API C22 = [' +
      raw + '] => mode = [' + mode + ']'
    );

    return {
      success: true,
      mode: mode
    };

  } catch (error) {
    Logger.log(
      'PANELS C22 IQOMAH BLACK ERROR: ' +
      error.message
    );

    return {
      success: false,
      error: error.message,
      mode: 'NORMAL'
    };
  }
}


function getYoutubeControl() {
  // Kontrak tunggal kontrol YouTube untuk GitHub Pages.
  // URL di panels!C20; mode di panels!F20.
  // Tidak membaca/menulis konfigurasi audio dan tidak menjalankan scheduler.
  const muteBeforeQiroahSeconds = 120;
  const muteAfterIqomahMinutes = 20;

  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('panels');

    if (!sheet) {
      return {
        success: true,
        Youtube: '',
        YoutubeStatus: 'AUTO',
        YoutubeMuteBeforeQiroahSeconds: muteBeforeQiroahSeconds,
        YoutubeMuteAfterIqomahMinutes: muteAfterIqomahMinutes
      };
    }

    const url = String(
      sheet.getRange('C20').getDisplayValue() || ''
    ).trim();

    const rawStatus = String(
      sheet.getRange('F20').getDisplayValue() || ''
    ).trim().toUpperCase();

    const status =
      ['ON', 'OFF', 'AUTO', 'STOP'].indexOf(rawStatus) >= 0
        ? rawStatus
        : 'AUTO';

    Logger.log(
      'YOUTUBE CONTROL C20/F20: mode=[' + status +
      '], muteBeforeQiroahSeconds=' + muteBeforeQiroahSeconds +
      ', muteAfterIqomahMinutes=' + muteAfterIqomahMinutes
    );

    return {
      success: true,
      Youtube: url,
      YoutubeStatus: status,
      YoutubeMuteBeforeQiroahSeconds: muteBeforeQiroahSeconds,
      YoutubeMuteAfterIqomahMinutes: muteAfterIqomahMinutes
    };

  } catch (error) {
    Logger.log(
      'YOUTUBE CONTROL CEPAT ERROR: ' + error.message
    );

    return {
      success: false,
      error: error.message,
      Youtube: '',
      YoutubeStatus: 'AUTO',
      YoutubeMuteBeforeQiroahSeconds: muteBeforeQiroahSeconds,
      YoutubeMuteAfterIqomahMinutes: muteAfterIqomahMinutes
    };
  }
}


// =========================================================
// LOOKUP SHEET CASE-INSENSITIVE
// =========================================================
// Google Sheets mempertahankan nama tab persis seperti dibuat di
// Spreadsheet tenant. Template M0002 menggunakan beberapa nama tab
// huruf kecil (mis. keuangan, adzan, running_text), sedangkan API lama
// memakai kapitalisasi berbeda (Keuangan, Adzan, Running_Text).
// Lookup ini membuat API tidak bergantung pada kapitalisasi nama tab.
// Tidak mengubah nama tab dan tidak menulis data.
function getSheetCaseInsensitive_(ss, sheetName) {
  if (!ss) return null;

  const wanted = String(sheetName || '').trim().toLowerCase();
  if (!wanted) return null;

  const sheets = ss.getSheets();

  for (let i = 0; i < sheets.length; i++) {
    const actualName = String(sheets[i].getName() || '').trim().toLowerCase();

    if (actualName === wanted) {
      return sheets[i];
    }
  }

  return null;
}


function getDataFromSheet() {
  try {
    const ss = getSpreadsheet();
    const result = {};

    // Audio sekarang sepenuhnya berasal dari panels!B46:Q55.
    const panelAudioConfig = buildAudioScheduleFromPanels_(ss);
    result.Audio = {};
    result.AudioSchedule = panelAudioConfig.schedule;
    result.AudioFriday = panelAudioConfig.friday;
    result.AudioScheduleJSON = JSON.stringify(panelAudioConfig.schedule);
    result.AudioFridayJSON = JSON.stringify(panelAudioConfig.friday);
    result.AudioDurations = {};

    // =====================================================
    // KONTROL TAMPILAN RAMADAN
    // Dibaca dari Script Properties:
    // RAMADAN_DISPLAY = true / false
    //
    // Pengaturan ini hanya memengaruhi DISPLAY Ramadan.
    // Tidak mengubah schedule, durasi, urutan, atau proses AUDIO.
    // =====================================================

    result.RamadanDisplay = getRamadanDisplaySetting();

    // Tema tampilan global dari panels!C18. Tidak memengaruhi audio/scheduler.
    result.DisplayTheme = getDisplayThemeSetting();

    // Lokasi aktif dari panels!C5:C10 untuk timezone/date di GitHub Pages.
    // Tidak mengubah scheduler audio.
    result.Lokasi = getLokasiPanels();

    Logger.log('LOKASI API = ' + JSON.stringify(result.Lokasi));

    // =====================================================
    // HEADER MASJID - SUMBER LANGSUNG SPREADSHEET
    // Field dikenali berdasarkan label kolom B pada sheet panels.
    // Nilai kosong selalu dikembalikan sebagai ''.
    // Tidak menyentuh scheduler/audio.
    // =====================================================
    const headerSheet = ss.getSheetByName('panels');
    if (headerSheet) {
      const headerValues = headerSheet.getRange('B12:C30').getDisplayValues();
      const headerData = {};

      headerValues.forEach(function(row) {
        const key = String(row[0] || '').trim().toUpperCase();
        const value = String(row[1] || '').trim();

        if (
          key === 'NAMA' ||
          key === 'ALAMAT' ||
          key === 'KOTA' ||
          key === 'NO HP' ||
          key === 'SLOGAN' ||
          key === 'WEBSITE' ||
          key === 'INFO LAINNYA'
        ) {
          headerData[key] = value;
        }
      });

      // Nama header MASJID selalu langsung dari panels!C12.
      // Tidak menggunakan label B12 agar C12 menjadi single source of truth.
      result.Nama = String(
        headerSheet.getRange('C12').getDisplayValue() || ''
      ).trim();

      // Header utama selalu mengambil langsung dari panels!C13:C15.
      result.Alamat = String(headerSheet.getRange('C13').getDisplayValue() || '').trim();
      result.Kota = String(headerSheet.getRange('C14').getDisplayValue() || '').trim();
      result['No. Telp'] = String(headerSheet.getRange('C15').getDisplayValue() || '').trim();
      result.Slogan = headerData.SLOGAN || '';
      result.Website = headerData.WEBSITE || '';
      result.InfoLainnya = headerData['INFO LAINNYA'] || '';

      Logger.log('PANELS HEADER = ' + JSON.stringify({
        Nama: result.Nama,
        Alamat: result.Alamat,
        Kota: result.Kota,
        NoTelp: result['No. Telp'],
        Website: result.Website,
        InfoLainnya: result.InfoLainnya,
        Slogan: result.Slogan
      }));
    }

    // =====================================================
    // KONTROL MODE DISPLAY COUNTDOWN
    // Sumber: sheet "panels"!C2
    // AUTO   = layar hitam saat countdown sholat aktif
    //          sampai 15 menit setelah IQOMAH selesai.
    // NORMAL = tampilan display tetap normal.
    // =====================================================
    // ============================================================
  // MODE DISPLAY COUNTDOWN - panels!C2
  // Dibaca langsung, terpisah dari RAMADAN_DISPLAY.
  // AUTO/NORMAL hanya mengatur tampilan layar; audio tidak berubah.
  // ============================================================
  const panelsSheetDirect = ss.getSheetByName('panels');
  if (panelsSheetDirect) {
    const panelModeDirect = String(
      panelsSheetDirect.getRange('C2').getDisplayValue() || ''
    ).trim().toUpperCase();

    result.PanelMode =
      panelModeDirect === 'AUTO'
        ? 'AUTO'
        : 'OFF';

    Logger.log(
      'PANELS DIRECT C2 = [' +
      panelModeDirect +
      '] => PanelMode = [' +
      result.PanelMode +
      ']'
    );
  } else {
    result.PanelMode = 'OFF';
    Logger.log('PANELS: sheet panels tidak ditemukan => OFF');
  }

    // =====================================================
    // KONFIGURASI YOUTUBE - PANELS
    // panels!C20 = LINK YOUTUBE
    // panels!F20 = SELECTOR: ON / OFF / AUTO / STOP
    //
    // ON   = video berjalan, suara aktif
    // OFF  = video berjalan, suara mute
    // AUTO = mute mulai 120 detik sebelum Qiroah-1 s.d. Qiroah-5,
    //        tetap mute sampai 20 menit setelah waktu iqomah,
    //        lalu suara mengikuti aturan AUTO kembali
    // STOP = pemutaran video dihentikan (bukan sekadar mute)
    // =====================================================

    result.Youtube = '';
    result.YoutubeStatus = 'AUTO';
    result.YoutubeMute = false;
    result.YoutubeMuteBeforeQiroahSeconds = 120;
    result.YoutubeControlLocked = false;

    const youtubePanelsSheet = ss.getSheetByName('panels');
    if (youtubePanelsSheet) {
      result.Youtube = String(
        youtubePanelsSheet.getRange('C20').getDisplayValue() || ''
      ).trim();

      const youtubeSelector = String(
        youtubePanelsSheet.getRange('F20').getDisplayValue() || ''
      ).trim().toUpperCase();

      result.YoutubeStatus =
        ['ON', 'OFF', 'AUTO', 'STOP'].indexOf(youtubeSelector) >= 0
          ? youtubeSelector
          : 'AUTO';

      Logger.log(
        'YOUTUBE PANELS C20/F20 = LINK=[' +
        result.Youtube +
        '] SELECTOR=[' +
        youtubeSelector +
        '] => STATUS=[' +
        result.YoutubeStatus +
        ']'
      );
    } else {
      Logger.log('YOUTUBE: sheet panels tidak ditemukan => AUTO');
    }

    // =====================================================
    // DEFAULT AUDIO ADZAN SUBUH LAMA
    // =====================================================

    result.AdzanSubuh = '';

    // =====================================================
    // AUDIO ADZAN
    // =====================================================

    result.Audio = {
      'beep': '',
      'adzan-subuh': '',
      'adzan-biasa': '',
      'tarhim-subuh': '',
      'tarhim-biasa': '',
      'iqomah': '',
      'doa': '',
      'sirine': ''
    };

    // =====================================================
    // KONFIGURASI URUTAN + DURASI AUDIO DARI SHEET ADZAN
    // 0 = AUDIO/GAP DILEWATI
    // =====================================================

    result.AudioSchedule = {
      SUBUH_RAMADHAN: [],
      SUBUH_BIASA: [],
      DZUHUR: [],
      ASHAR: [],
      MAGHRIB_RAMADHAN: [],
      MAGHRIB_BIASA: [],
      ISYA: []
    };

    result.AudioDurations = {};
    result.AudioFriday = [];
    // Jalur string untuk JSONP/bridge GitHub Pages.
    result.AudioScheduleJSON = '';
    result.AudioFridayJSON = '';

    // =====================================================
    // STATUS SUARA AUDIO DARI SHEET ADZAN T/U
    // ON  = audio tetap berjalan + terdengar (UNMUTE)
    // OFF = audio tetap berjalan sesuai durasi + HENING (MUTE)
    // Status T/U TIDAK mengubah urutan maupun durasi.
    // =====================================================
    result.AudioStatus = {
      qiroah: 'ON',
      tarhim: 'ON',
      beep: 'ON',
      adzan: 'ON',
      doa: 'ON',
      iqomah: 'ON',
      sirine: 'ON'
    };


    // =====================================================
    // PASTIKAN KEUANGAN SELALU ADA
    // =====================================================

    result.Keuangan = [];
    result.KeuanganTanggal = '';
    result.KeuanganJudul = '';

    // =====================================================
    // INFAQ & SHADAQAH
    // Sumber: sheet "infaq", range B1:B3
    // =====================================================
    result.Infaq = [];
    
function normalizePanelCountdownDate_(raw, display, spreadsheetTimezone) {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return Utilities.formatDate(raw, spreadsheetTimezone, 'yyyy-MM-dd');
  }

  const text = String(display || raw || '').trim();
  if (!text) return '';

  let m = text.match(/^(\d{1,2})[\\/.-](\d{1,2})[\\/.-](\d{4})$/);
  if (m) {
    return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  }

  m = text.match(/^(\d{4})[\\/.-](\d{1,2})[\\/.-](\d{1,2})$/);
  if (m) {
    return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
  }

  return '';
}

function getPanelEventCountdownConfig_() {
  const result = [];
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('panels');
    if (!sheet) return result;

    const range = sheet.getRange('C60:E63');
    const values = range.getValues();
    const displays = range.getDisplayValues();
    const spreadsheetTimezone =
      ss.getSpreadsheetTimeZone() ||
      Session.getScriptTimeZone() ||
      'Asia/Makassar';

    values.forEach(function(row, index) {
      const sheetRow = 60 + index;
      const displayRow = displays[index] || [];
      const start = normalizePanelCountdownDate_(row[0], displayRow[0], spreadsheetTimezone);
      const end = normalizePanelCountdownDate_(row[1], displayRow[1], spreadsheetTimezone);
      const status = String(row[2] == null ? displayRow[2] || '' : row[2]).trim().toUpperCase();

      result.push({
        row: sheetRow,
        start: start,
        end: end,
        status: status === 'ON' ? 'ON' : 'OFF'
      });
    });
  } catch (error) {
    Logger.log('PANELS COUNTDOWN C60:E63 ERROR: ' + (error && error.message ? error.message : error));
  }
  return result;
}


/**
 * Normalisasi tanggal untuk konfigurasi video hari raya.
 * Dipakai bersama oleh konfigurasi Idul Fitri dan Idul Adha.
 */
function normalizeVideoConfigDate_(value, timeZone) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, timeZone, 'yyyy-MM-dd');
  }
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  let m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return text;
}

/**
 * Membaca rentang tanggal animasi Idul Fitri dari panels!C68:E68.
 * C68 = tanggal mulai, D68 = tanggal berhenti, E68 = ON/OFF.
 * Tidak mengubah atau membaca ulang konfigurasi audio/scheduler.
 */
function getEidFitriVideoConfig() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('panels');
    if (!sheet) {
      return { success: false, error: 'Sheet panels tidak ditemukan.', startDate: '', stopDate: '', status: 'OFF' };
    }

    // Baca nilai asli agar tanggal tidak bergantung pada format tampilan
    // atau bahasa lokal spreadsheet (mis. 10 Okt 2026 vs 10/10/2026).
    const values = sheet.getRange('C68:E68').getValues()[0] || [];
    const timeZone = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone() || 'Asia/Makassar';
    const startDate = normalizeVideoConfigDate_(values[0], timeZone);
    const stopDate = normalizeVideoConfigDate_(values[1], timeZone);
    const rawStatus = String(values[2] == null ? '' : values[2]).trim().toUpperCase();
    const status = rawStatus === 'ON' ? 'ON' : 'OFF';
    return { success: true, startDate: startDate, stopDate: stopDate, status: status };
  } catch (error) {
    Logger.log('IDUL FITRI VIDEO CONFIG ERROR: ' + (error && error.message ? error.message : error));
    return { success: false, error: String(error && error.message ? error.message : error), startDate: '', stopDate: '', status: 'OFF' };
  }
}


function getEidAdhaVideoConfig() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('panels');
    if (!sheet) {
      return { success: false, error: 'Sheet panels tidak ditemukan.', startDate: '', stopDate: '', status: 'OFF' };
    }

    // Baca nilai asli agar tanggal tidak bergantung pada format tampilan
    // atau bahasa lokal spreadsheet (mis. 10 Okt 2026 vs 10/10/2026).
    const values = sheet.getRange('C69:E69').getValues()[0] || [];
    const timeZone = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone() || 'Asia/Makassar';
    const startDate = normalizeVideoConfigDate_(values[0], timeZone);
    const stopDate = normalizeVideoConfigDate_(values[1], timeZone);
    const rawStatus = String(values[2] == null ? '' : values[2]).trim().toUpperCase();
    const status = rawStatus === 'ON' ? 'ON' : 'OFF';
    return { success: true, startDate: startDate, stopDate: stopDate, status: status };
  } catch (error) {
    Logger.log('IDUL ADHA VIDEO CONFIG ERROR: ' + (error && error.message ? error.message : error));
    return { success: false, error: String(error && error.message ? error.message : error), startDate: '', stopDate: '', status: 'OFF' };
  }
}

function getPanelEventCountdownCustomConfig_() {
  const result = [];
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('panels');
    if (!sheet) return result;

    const lastRow = Math.max(sheet.getLastRow(), 64);
    const numRows = lastRow - 63;
    if (numRows <= 0) return result;

    const range = sheet.getRange(64, 2, numRows, 4); // B:E
    const values = range.getValues();
    const displays = range.getDisplayValues();
    const spreadsheetTimezone =
      ss.getSpreadsheetTimeZone() ||
      Session.getScriptTimeZone() ||
      'Asia/Makassar';

    values.forEach(function(row, index) {
      const sheetRow = 64 + index;

      // B68:E72 adalah penanda/konfigurasi animasi video, bukan teks countdown web.
      // File video idul-fitri.webm ditampilkan oleh index.html; C68:E68 mengatur jadwalnya.
      if (sheetRow >= 68 && sheetRow <= 72) return;

      const displayRow = displays[index] || [];
      const event = String(displayRow[0] || row[0] || '').trim();
      const start = normalizePanelCountdownDate_(row[1], displayRow[1], spreadsheetTimezone);
      const end = normalizePanelCountdownDate_(row[2], displayRow[2], spreadsheetTimezone);
      const status = String(row[3] == null ? displayRow[3] || '' : row[3]).trim().toUpperCase();

      if (!event && !start && !end && !status) return;

      result.push({
        row: sheetRow,
        event: event,
        start: start,
        end: end,
        status: status === 'ON' ? 'ON' : 'OFF'
      });
    });
  } catch (error) {
    Logger.log('PANELS COUNTDOWN CUSTOM B64:E ERROR: ' + (error && error.message ? error.message : error));
  }
  return result;
}

// Event: A=EVENT, B=ANGKA DURASI HITUNGAN HARI, C=STATUS, D=KETERANGAN.
    // Kolom B adalah angka konfigurasi; kolom D hanya keterangan.
    result.Event = [];

    // Countdown baru: panels!C60:E63 adalah satu-satunya sumber konfigurasi.
    result.EventCountdown = getPanelEventCountdownConfig_();
    result.EventCountdownCustom = getPanelEventCountdownCustomConfig_();

    const targetSheets = [
      'Nama_Mesjid',
      'Keuangan',
      'infaq',
      "Jum'at",
      'Event',
      'Running_Text',
      'Adzan',
      'panels'
    ];

    // -------------------------------------------------------
    // BACA SHEET YANG DIBUTUHKAN
    // -------------------------------------------------------

    targetSheets.forEach(
      function(sheetName) {

        const sheet =
          getSheetCaseInsensitive_(
            ss,
            sheetName
          );

        if (!sheet) {

          Logger.log(
            'Sheet tidak ditemukan: ' +
            sheetName
          );

          return;
        }

        // Event dan panels mempunyai pembacaan khusus.
        // Hindari getDataRange() untuk keduanya agar startup lebih ringan.
        if (sheetName === 'Event') {
          result.Event = getEventSheetData_(ss);
          return;
        }

        if (sheetName === 'panels') {
          const panelMode = String(
            sheet.getRange('C2').getDisplayValue() || ''
          ).trim().toUpperCase();

          result.PanelMode = panelMode === 'AUTO' ? 'AUTO' : 'OFF';

          Logger.log(
            'PANELS!C2 = [' + panelMode + '] => PanelMode = [' +
            result.PanelMode + ']'
          );

          return;
        }

        // =====================================================
        // SHEET KHUSUS: proses langsung tanpa getDataRange()
        // getDataRange() sebelumnya membuat startup sangat lambat,
        // terutama jika sheet memiliki banyak baris/kolom kosong terformat.
        // =====================================================

        if (sheetName === 'infaq') {
          const infaqResult = [];

          const textValues = sheet
            .getRange('B1:B2')
            .getDisplayValues();

          textValues.forEach(function(row) {
            const value = row && row.length > 0
              ? String(row[0] || '').trim()
              : '';

            if (value !== '') {
              infaqResult.push(value);
            }
          });

          const imageCell = sheet.getRange('B3');
          let imageUrl = '';

          try {
            const imageValue = imageCell.getValue();

            if (
              imageValue &&
              typeof imageValue.getContentUrl === 'function'
            ) {
              imageUrl = String(
                imageValue.getContentUrl() || ''
              ).trim();
            }
          } catch (imageError) {
            Logger.log(
              'INFAQ B3 CellImage URL gagal dibaca: ' +
              imageError.message
            );
          }

          if (!imageUrl) {
            try {
              const displayValue = imageCell.getDisplayValue();

              if (
                displayValue &&
                /^https?:\/\//i.test(displayValue.trim())
              ) {
                imageUrl = displayValue.trim();
              }
            } catch (displayError) {
              Logger.log(
                'INFAQ B3 display value gagal dibaca: ' +
                displayError.message
              );
            }
          }

          if (imageUrl) {
            infaqResult.push(imageUrl);
          }

          result.Infaq = infaqResult.map(function(value) {
            return String(value == null ? '' : value);
          });

          return;
        }

        if (sheetName === 'Keuangan') {
          result.Keuangan = [];

          result.KeuanganJudul = String(
            sheet.getRange('A1').getDisplayValue() || ''
          ).trim();

          const keuanganTanggalDisplay = String(
            sheet.getRange('A2').getDisplayValue() || ''
          );

          result.KeuanganTanggal =
            keuanganTanggalDisplay.replace(
              /^(0)(\d)(\\s)/,
              '$2$3'
            );

          const keuanganLastRow = sheet.getLastRow();

          if (keuanganLastRow >= 4) {
            const keuanganRows = sheet
              .getRange(4, 1, keuanganLastRow - 3, 2)
              .getDisplayValues();

            keuanganRows.forEach(function(displayRow) {
              const row = [
                String(displayRow[0] == null ? '' : displayRow[0]).trim(),
                String(displayRow[1] == null ? '' : displayRow[1]).trim()
              ];

              if (row[0] !== '' || row[1] !== '') {
                result.Keuangan.push(row);
              }
            });
          }

          return;
        }

        if (sheetName === "Jum'at") {
          // Jum'at tetap memakai parser lama karena struktur key/value.
          // Namun hanya sheet ini yang masih membutuhkan getDataRange().
          const data = sheet.getDataRange().getValues();

          if (!data || data.length === 0) {
            Logger.log('Sheet kosong: ' + sheetName);
            return;
          }

          processJumatSheet(data, result);
          return;
        }

        if (sheetName === 'Running_Text') {
          processRunningTextSheet(sheet, result);
          return;
        }

        if (sheetName === 'Adzan') {
          // Sheet Adzan hanya dibaca untuk key/URL kompatibilitas.
          // Urutan + ON/OFF audio aktif berasal dari panels!B46:Q55.
          Logger.log('SHEET ADZAN: URL kompatibilitas dibaca; SCHEDULE AKTIF = PANELS B46:Q55.');
        }

        // Hanya sheet yang benar-benar memakai parser generik
        // yang menggunakan getDataRange().
        const data = sheet.getDataRange().getValues();

        if (!data || data.length === 0) {
          Logger.log('Sheet kosong: ' + sheetName);
          return;
        }


        // =====================================================
        // KHUSUS SHEET INFAQ
        // Sumber: B1:B3
        //
        // HASIL AKHIR SELALU ARRAY STRING:
        // [ B1, B2, URL_GAMBAR_B3 ]
        // =====================================================

        if (
          sheetName === 'infaq'
        ) {

          const infaqResult = [];

          // B1 dan B2 selalu diambil sebagai teks tampilan.
          const textValues =
            sheet
              .getRange('B1:B2')
              .getDisplayValues();

          textValues.forEach(function(row) {

            const value =
              row && row.length > 0
                ? String(row[0] || '').trim()
                : '';

            if (value !== '') {
              infaqResult.push(value);
            }
          });

          // B3 = gambar.
          // Prioritas: CellImage.getContentUrl().
          // Jika bukan CellImage, coba URL teks/formula.
          const imageCell =
            sheet.getRange('B3');

          let imageUrl = '';

          try {
            const imageValue =
              imageCell.getValue();

            if (
              imageValue &&
              typeof imageValue.getContentUrl === 'function'
            ) {
              imageUrl =
                String(imageValue.getContentUrl() || '').trim();
            }
          } catch (imageError) {
            Logger.log(
              'INFAQ B3 CellImage URL gagal dibaca: ' +
              imageError.message
            );
          }

          if (!imageUrl) {
            try {
              const displayValue =
                imageCell.getDisplayValue();

              if (
                displayValue &&
                /^https?:\/\//i.test(displayValue.trim())
              ) {
                imageUrl =
                  displayValue.trim();
              }
            } catch (displayError) {
              Logger.log(
                'INFAQ B3 display value gagal dibaca: ' +
                displayError.message
              );
            }
          }

          if (imageUrl) {
            infaqResult.push(imageUrl);
          }

          // PENTING: hanya kirim primitive string ke browser.
          result.Infaq =
            infaqResult.map(function(value) {
              return String(value == null ? '' : value);
            });

          return;
        }

        // =====================================================
        // KHUSUS SHEET KEUANGAN
        // =====================================================

        if (
          sheetName === 'Keuangan'
        ) {

          // RESET DATA KEUANGAN
          result.Keuangan = [];

          // Judul laporan langsung dari Keuangan!A1, tanpa hardcode.
          result.KeuanganJudul =
            String(
              sheet.getRange('A1').getDisplayValue() || ''
            ).trim();

          // ---------------------------------------------------
          // JUDUL + TANGGAL LAPORAN LANGSUNG DARI SHEET KEUANGAN
          // ---------------------------------------------------

          // Keuangan!A2 adalah sumber tanggal laporan.
          // Jika API Sheets mengembalikan nol di depan hari (mis. 02 Oktober
          // 2026) padahal tampilan Spreadsheet adalah 2 Oktober 2026,
          // hilangkan HANYA nol di depan angka hari. Bagian tanggal lainnya
          // tidak diubah. Tidak menyentuh scheduler/audio.
          const keuanganTanggalDisplay =
            String(
              sheet.getRange('A2').getDisplayValue() || ''
            );

          result.KeuanganTanggal =
            keuanganTanggalDisplay.replace(
              /^(0)(\d)(\\s)/,
              '$2$3'
            );


          // DATA SCROLL LAPORAN KEUANGAN: HANYA Keuangan!A4:B∞.
          // Ambil langsung mulai baris 4 agar A1:B3 MUSTAHIL masuk payload.
          // A1 = judul, A2 = tanggal, A3 = header/pemisah.
          // Hanya kolom A dan B yang dikirim ke website.
          // Tidak mengubah sumber judul/tanggal maupun scheduler/audio.
          const keuanganLastRow = sheet.getLastRow();

          if (keuanganLastRow >= 4) {
            const keuanganRows = sheet
              .getRange(4, 1, keuanganLastRow - 3, 2)
              .getDisplayValues();

            keuanganRows.forEach(function(displayRow) {
              const row = [
                String(displayRow[0] == null ? '' : displayRow[0]).trim(),
                String(displayRow[1] == null ? '' : displayRow[1]).trim()
              ];

              const hasContent = row.some(function(cell) {
                return cell !== '';
              });

              if (hasContent) {
                result.Keuangan.push(row);
              }
            });
          }

          return;
        }


        // =====================================================
        // KHUSUS SHEET JUM'AT
        // =====================================================

        if (
          sheetName === "Jum'at"
        ) {

          processJumatSheet(
            data,
            result
          );

          return;
        }


        // =====================================================
        // KHUSUS SHEET RUNNING TEXT
        // =====================================================

        if (
          sheetName === 'Running_Text'
        ) {

          processRunningTextSheet(
            sheet,
            result
          );

          return;
        }


        // =====================================================
        // KHUSUS SHEET PANELS
        // C2 = MODE DISPLAY: AUTO / NORMAL
        // =====================================================

        if (
          sheetName === 'panels'
        ) {

          const panelMode =
            String(
              sheet
                .getRange('C2')
                .getDisplayValue() || ''
            )
            .trim()
            .toUpperCase();

          result.PanelMode =
            panelMode === 'AUTO'
              ? 'AUTO'
              : 'OFF';

          Logger.log(
            'PANELS!C2 = [' +
            panelMode +
            '] => PanelMode = [' +
            result.PanelMode +
            ']'
          );

          return;
        }


        // =====================================================
        // KHUSUS SHEET ADZAN
        // FORMAT:
        // KOLOM A = KEY
        // KOLOM B = URL AUDIO
        // =====================================================

        if (
          sheetName === 'Adzan'
        ) {

          // URL/key audio dari Adzan hanya untuk kompatibilitas.
          processKeyAudioSheet(
            sheet,
            result
          );

          // JADWAL AKTIF TIDAK dibaca dari kolom sequence Sheet Adzan.
          // Satu-satunya sumber urutan + ON/OFF adalah panels!B46:Q55.
          // Ini penting karena frontend memerlukan array schedule yang
          // tidak kosong untuk membangun timeline audio harian.
          const panelAudioFinal = buildAudioScheduleFromPanels_(ss);
          result.AudioSchedule = panelAudioFinal.schedule;
          result.AudioFriday = panelAudioFinal.friday;
          result.AudioScheduleJSON = JSON.stringify(panelAudioFinal.schedule);
          result.AudioFridayJSON = JSON.stringify(panelAudioFinal.friday);
          result.AudioDurations = {};

          Logger.log(
            'AUDIO FINAL: SCHEDULE=' +
            Object.keys(result.AudioSchedule).map(function(k) {
              return k + '=' + (result.AudioSchedule[k] || []).length;
            }).join(', ') +
            ' | SOURCE=PANELS B46:Q55'
          );

          // Bangun ulang ringkasan AudioStatus berdasarkan status final
          // dari panels, bukan dari Adzan!T:U.
          result.AudioStatus = {
            qiroah: 'ON',
            tarhim: 'ON',
            beep: 'ON',
            adzan: 'ON',
            doa: 'ON',
            iqomah: 'ON',
            sirine: 'ON'
          };

          const applyAudioStatusSummary_ = function(items) {
            (Array.isArray(items) ? items : []).forEach(function(item) {
              const event = String(item && item.event || '').toLowerCase();
              const status = String(item && item.status || 'ON').toUpperCase();
              if (status !== 'OFF') return;

              const category =
                /^qiroah/.test(event) ? 'qiroah' :
                event === 'tarhim' ? 'tarhim' :
                event === 'beep' ? 'beep' :
                /^adzan/.test(event) ? 'adzan' :
                /^doa/.test(event) ? 'doa' :
                event === 'iqomah' ? 'iqomah' :
                event === 'sirine' ? 'sirine' : '';

              if (category) result.AudioStatus[category] = 'OFF';
            });
          };

          Object.keys(result.AudioSchedule || {}).forEach(function(sequenceName) {
            applyAudioStatusSummary_(result.AudioSchedule[sequenceName]);
          });
          applyAudioStatusSummary_(result.AudioFriday);

          Logger.log(
            'AUDIO FINAL SOURCE = PANELS B46:Q55; ' +
            'DURASI/URL = ADZAN; STATUS = PANELS'
          );

          return;
        }


        // =====================================================
        // SHEET LAIN
        // =====================================================

        if (
          data[0] &&
          data[0].length === 2 &&
          data.length > 1 &&
          data[0][0] !== ''
        ) {

          for (
            let i = 0;
            i < data.length;
            i++
          ) {

            processKeyValue(
              data[i][0],
              data[i][1],
              result
            );
          }

        } else if (
          data.length >= 2
        ) {

          const headers =
            data[0];

          const values =
            data[1];

          for (
            let j = 0;
            j < headers.length;
            j++
          ) {

            processKeyValue(
              headers[j],
              values[j],
              result
            );
          }
        }
      }
    );


    // =====================================================
    // SUMBER PANEL KEUANGAN DARI PANELS!C26
    // C26 = KEUANGAN -> sheet Keuangan
    // C26 = QUR'BAN -> sheet Qurb'an
    // Hanya mengganti sumber data panel kanan.
    // Tidak menyentuh scheduler, audio, YouTube, atau data sholat.
    // KEUANGAN: data detail A4:B sampai baris terakhir.
    // QUR'BAN: A1 header, A2 nama masjid, A3 header, A4 kosong,
    // scrolling A5:A sampai baris terakhir.
    // =====================================================
    try {
      const panelsSelectorSheet = ss.getSheetByName('panels');
      const rawSelector = panelsSelectorSheet
        ? String(panelsSelectorSheet.getRange('C26').getDisplayValue() || '').trim()
        : 'KEUANGAN';

      const selectorKey = rawSelector
        .toUpperCase()
        .replace(/[\s’‘'\`]/g, '');

      const selectedKey =
        selectorKey === 'QURBAN'
          ? 'QURBAN'
          : selectorKey === 'PENGURUS'
            ? 'PENGURUS'
            : 'KEUANGAN';

      result.KeuanganSelector = selectedKey;

      const selectedSheet = ss.getSheets().find(function(candidate) {
        const key = String(candidate.getName() || '')
          .toUpperCase()
          .replace(/[\s’‘'\`]/g, '');
        return key === selectedKey;
      });

      if (selectedSheet) {
        result.Keuangan = [];
        result.KeuanganJudul = String(
          selectedSheet.getRange('A1').getDisplayValue() || ''
        ).trim();
        result.KeuanganTanggal = String(
          selectedSheet.getRange('A2').getDisplayValue() || ''
        ).replace(/^(0)(\d)(\s)/, '$2$3');
        result.KeuanganA3 = String(
          selectedSheet.getRange('A3').getDisplayValue() || ''
        ).trim();

        const lastRow = selectedSheet.getLastRow();

        if (selectedKey === 'QURBAN') {
          // QUR'BAN: A1, A2, A3 adalah header tetap. A4 dilewati.
          // Scrolling dimulai dari A5.
          if (lastRow >= 5) {
            selectedSheet
              .getRange(5, 1, lastRow - 4, 1)
              .getDisplayValues()
              .forEach(function(displayRow) {
                const text = String(
                  displayRow[0] == null ? '' : displayRow[0]
                ).trim();
                result.Keuangan.push([text, '']);
              });
          }
        } else if (selectedKey === 'PENGURUS') {
          // PENGURUS: A1:A4 adalah header tetap; data dimulai dari A5.
          // Batas bawah dinamis mengikuti getLastRow(), tanpa batas jumlah
          // baris dari sisi program dan tanpa membaca getMaxRows().
          const lastPengurusRow = selectedSheet.getLastRow();
          if (lastPengurusRow >= 5) {
            const pengurusRows = selectedSheet
              .getRange(5, 1, lastPengurusRow - 4, 1)
              .getDisplayValues();

            pengurusRows.forEach(function(displayRow) {
              const text = String(
                displayRow[0] == null ? '' : displayRow[0]
              ).trim();
              result.Keuangan.push([text, '']);
            });
          }
        } else if (lastRow >= 4) {
          const rows = selectedSheet
            .getRange(4, 1, lastRow - 3, 2)
            .getDisplayValues();

          rows.forEach(function(displayRow) {
            const row = [
              String(displayRow[0] == null ? '' : displayRow[0]).trim(),
              String(displayRow[1] == null ? '' : displayRow[1]).trim()
            ];

            if (row[0] !== '' || row[1] !== '') {
              result.Keuangan.push(row);
            }
          });
        }

        Logger.log(
          'PANEL KEUANGAN C26 = [' + rawSelector +
          '] => SHEET [' + selectedSheet.getName() +
          '] => ROWS [' + result.Keuangan.length + ']'
        );
      } else {
        result.Keuangan = [];
        result.KeuanganJudul = '';
        result.KeuanganTanggal = '';
        result.KeuanganA3 = '';
        Logger.log(
          'PANEL KEUANGAN: sheet untuk selector [' + rawSelector + '] tidak ditemukan.'
        );
      }
    } catch (selectorError) {
      Logger.log(
        'PANEL KEUANGAN C26 ERROR: ' + selectorError.message
      );
    }


    // =====================================================
    // FINALISASI MODE PANEL DISPLAY
    // =====================================================
    // panels!C2 adalah sumber tunggal kontrol layar hitam.
    // Normalisasi ulang setelah seluruh pembacaan sheet agar
    // PanelMode tidak pernah hilang/tertindih oleh parser lain.
    // AUTO = layar hitam saat countdown aktif.
    // Selain AUTO = OFF.
    // Tidak menyentuh audio, YouTube, scheduler, atau durasi.
    // =====================================================
    try {
      const panelsFinal = ss.getSheetByName('panels');
      const panelFinalRaw = panelsFinal
        ? String(panelsFinal.getRange('C2').getDisplayValue() || '')
            .trim()
            .toUpperCase()
        : '';

      result.PanelMode =
        panelFinalRaw === 'AUTO'
          ? 'AUTO'
          : 'OFF';

      Logger.log(
        'PANELS FINAL C2 = [' +
        panelFinalRaw +
        '] => PanelMode = [' +
        result.PanelMode +
        ']'
      );
    } catch (panelFinalError) {
      result.PanelMode = 'OFF';
      Logger.log(
        'PANELS FINAL ERROR => OFF: ' +
        panelFinalError.message
      );
    }


    // =====================================================
    // PASTIKAN KEUANGAN TIDAK HILANG
    // =====================================================

    if (
      !Array.isArray(
        result.Keuangan
      )
    ) {

      result.Keuangan = [];
    }

    if (
      result.KeuanganTanggal ===
      undefined
    ) {

      result.KeuanganTanggal =
        '';
    }


    // =====================================================
    // EVENT
    // =====================================================
    // Sudah dibaca sekali secara dinamis di loop targetSheets.
    // Jangan baca ulang karena akan menambah latency Spreadsheet.

    // =====================================================
    // PASTIKAN EVENT SELALU ADA
    // =====================================================

    if (!Array.isArray(result.Event)) {
      result.Event = [];
    }


    // =====================================================
    // PASTIKAN STATUS YOUTUBE MUTE SELALU ADA
    // =====================================================

    if (
      result.YoutubeMute ===
      undefined
    ) {

      result.YoutubeMute =
        false;
    }


    // =====================================================
    // PASTIKAN AUDIO SELALU ADA
    // =====================================================

    if (
      !result.Audio ||
      typeof result.Audio !== 'object'
    ) {

      result.Audio = {};
    }

    const audioKeys = [
      'beep',
      'adzan-subuh',
      'adzan-biasa',
      'tarhim-subuh',
      'tarhim-biasa',
      'iqomah',
      'doa',
      'sirine'
    ];

    audioKeys.forEach(
      function(key) {

        if (
          result.Audio[key] ===
          undefined
        ) {

          result.Audio[key] =
            '';
        }
      }
    );


    if (
      result.AdzanSubuh ===
      undefined
    ) {

      result.AdzanSubuh =
        '';
    }


    // =====================================================
    // PETUGAS SHOLAT - panels!C28 + C29:C32
    // =====================================================
    try {
      const kegiatanSheet = ss.getSheetByName('panels');
      if (kegiatanSheet) {
        result.PanelKegiatan = getPanelKegiatan();
      } else {
        result.PanelKegiatan = { success: false, jenis: '', fields: {} };
      }
    } catch (kegiatanError) {
      Logger.log('PANEL KEGIATAN GET DATA ERROR: ' + kegiatanError.message);
      result.PanelKegiatan = { success: false, jenis: '', fields: {} };
    }

    // =====================================================
    // DEBUG HASIL AKHIR
    // =====================================================

    // =====================================================
    // HEADER MASJID FINAL - panels!B12:C16
    // WAJIB dilakukan sebelum logging dan return result.
    // panels!B12:C16 adalah sumber tunggal header web.
    // =====================================================
    try {
      const headerSheetFinal = ss.getSheetByName('panels');

      if (headerSheetFinal) {
        const headerValuesFinal =
          headerSheetFinal.getRange('B12:C30').getDisplayValues();

        const headerFinal = {};

        headerValuesFinal.forEach(function(row) {
          const key = String(row[0] || '').trim().toUpperCase();
          const value = String(row[1] || '').trim();

          if (
            key === 'NAMA' ||
            key === 'ALAMAT' ||
            key === 'KOTA' ||
            key === 'NO HP' ||
            key === 'SLOGAN' ||
            key === 'WEBSITE' ||
            key === 'INFO LAINNYA'
          ) {
            headerFinal[key] = value;
          }
        });

        result.Nama = headerFinal.NAMA || result.Nama || '';
        result.Alamat = headerFinal.ALAMAT || '';
        result.Kota = headerFinal.KOTA || '';
        result['No. Telp'] = headerFinal['NO HP'] || '';
        result.Website = headerFinal.WEBSITE || '';
        result.InfoLainnya = headerFinal['INFO LAINNYA'] || '';
        result.Slogan = headerFinal.SLOGAN || '';

        Logger.log(
          'PANELS HEADER FINAL = ' +
          JSON.stringify({
            Nama: result.Nama,
            Alamat: result.Alamat,
            Kota: result.Kota,
            NoTelp: result['No. Telp'],
            Slogan: result.Slogan
          })
        );
      }
    } catch (headerFinalError) {
      Logger.log(
        'PANELS HEADER FINAL ERROR: ' +
        headerFinalError.message
      );
    }

    // =====================================================
    // DEBUG HASIL AKHIR
    // =====================================================
    Logger.log(
      '=== GET DATA SHEET SELESAI ==='
    );

    Logger.log(
      'Data result FINAL: ' +
      JSON.stringify({
        Nama: result.Nama,
        Alamat: result.Alamat,
        Kota: result.Kota,
        'No. Telp': result['No. Telp'],
        Website: result.Website,
        InfoLainnya: result.InfoLainnya,
        Slogan: result.Slogan
      })
    );

    return result;

  } catch (error) {

    Logger.log(
      'Error pada getDataFromSheet: ' +
      error.message
    );

    return {
      error: error.message,
      Keuangan: [],
      KeuanganTanggal: '',
      Event: [],
      Youtube: '',
      YoutubeMute: false,
      PanelMode: 'OFF',
      YoutubeMuteBeforeQiroahSeconds: 0,
      YoutubeControlLocked: false,
      AdzanSubuh: '',
      Audio: {
        'beep': '',
        'adzan-subuh': '',
        'adzan-biasa': '',
        'tarhim-subuh': '',
        'tarhim-biasa': '',
        'iqomah': '',
        'doa': ''
      },
      AudioStatus: {
        qiroah: 'ON',
        tarhim: 'ON',
        beep: 'ON',
        adzan: 'ON',
        doa: 'ON',
        iqomah: 'ON'
      },
      Running_Text: ''
    };
  }
}



// =========================================================
// DIAGNOSTIC: TEST GET DATA M0002 TANPA JSONP
// =========================================================
// Fungsi ini hanya untuk diagnosis backend. Tidak mengubah Spreadsheet,
// tidak mengubah Script Properties, dan tidak mengubah scheduler/audio.

// =========================================================
// EVENT - PEMBACAAN EKSPLISIT UNTUK GITHUB API
// =========================================================
// A = EVENT
// B = ANGKA DURASI HITUNGAN HARI
// C = STATUS
// D = KETERANGAN
//
// Dibaca terpisah dari loop targetSheets agar result.Event
// selalu tersedia untuk getDataFromSheet().
// =========================================================
function getEventSheetData_(ss) {
  const output = [];
  const sheet = getSheetCaseInsensitive_(ss, 'Event');

  if (!sheet) {
    Logger.log('EVENT: Sheet Event tidak ditemukan.');
    return output;
  }

  // Baca seluruh kolom yang dipakai, bukan hanya A:D. Ini membuat
  // pembacaan tetap bekerja bila kolom Event bergeser atau ada kolom
  // tambahan di Spreadsheet. Tidak melakukan penulisan ke Spreadsheet.
  const lastRow = sheet.getLastRow();
  const lastColumn = Math.max(sheet.getLastColumn(), 4);
  if (lastRow < 1) {
    Logger.log('EVENT: sheet kosong.');
    return output;
  }

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const displays = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  const normalizeHeader = function(value) {
    return String(value == null ? '' : value)
      .trim()
      .toUpperCase()
      .replace(/[\s_./-]+/g, ' ');
  };

  // Default format lama tetap dipertahankan: A=EVENT, B=HARI, C=STATUS, D=KETERANGAN.
  let eventCol = 0;
  let daysCol = 1;
  let statusCol = 2;
  let descriptionCol = 3;
  let headerRow = -1;

  // Cari baris header pada 10 baris pertama supaya nama kolom tidak
  // harus selalu berada di baris pertama atau di kolom A.
  const eventHeaders = ['EVENT', 'NAMA EVENT', 'NAMA EVENT KEGIATAN', 'KEGIATAN', 'NAMA KEGIATAN'];
  const dayHeaders = ['HARI', 'DURASI HARI', 'JUMLAH HARI', 'ANGKA DURASI HITUNGAN HARI', 'DURASI', 'DAYS'];
  const statusHeaders = ['STATUS', 'AKTIF', 'ON OFF', 'ON/OFF'];
  const descriptionHeaders = ['KETERANGAN', 'DESKRIPSI', 'CATATAN', 'INFO'];

  for (let r = 0; r < Math.min(values.length, 10); r++) {
    const headers = (displays[r] || []).map(normalizeHeader);
    const e = headers.findIndex(function(v) { return eventHeaders.indexOf(v) >= 0; });
    const d = headers.findIndex(function(v) { return dayHeaders.indexOf(v) >= 0; });
    const st = headers.findIndex(function(v) { return statusHeaders.indexOf(v) >= 0; });
    const desc = headers.findIndex(function(v) { return descriptionHeaders.indexOf(v) >= 0; });
    if (e >= 0 && (d >= 0 || st >= 0 || desc >= 0)) {
      eventCol = e;
      if (d >= 0) daysCol = d;
      if (st >= 0) statusCol = st;
      if (desc >= 0) descriptionCol = desc;
      headerRow = r;
      break;
    }
  }

  for (let r = 0; r < values.length; r++) {
    if (r === headerRow) continue;
    const row = values[r] || [];
    const displayRow = displays[r] || [];
    let eventValue = row[eventCol];
    let eventName = String(eventValue == null ? '' : eventValue).trim();

    // Kompatibilitas untuk sheet tanpa header: jika kolom A kosong,
    // temukan nama event teks pada baris tersebut. Kolom durasi/status
    // tetap dikenali dari nilai yang tersisa.
    let rowDays = row[daysCol];
    let rowStatus = row[statusCol];
    let rowDescription = row[descriptionCol];
    if (!eventName && headerRow < 0) {
      const nonEmpty = [];
      for (let c = 0; c < row.length; c++) {
        const shown = String(displayRow[c] == null ? '' : displayRow[c]).trim();
        if (shown !== '') nonEmpty.push({ index: c, raw: row[c], shown: shown });
      }
      const candidate = nonEmpty.find(function(item) {
        const text = item.shown.toUpperCase();
        return !/^[-+]?\d+(?:[.,]\d+)?$/.test(item.shown) &&
          ['ON', 'OFF', 'AKTIF', 'NONAKTIF', 'STATUS', 'EVENT', 'NAMA EVENT'].indexOf(text) < 0;
      });
      if (candidate) {
        eventName = candidate.shown;
        const rest = nonEmpty.filter(function(item) { return item.index !== candidate.index; });
        const duration = rest.find(function(item) {
          return /^[-+]?\d+(?:[.,]\d+)?$/.test(item.shown);
        });
        const status = rest.find(function(item) {
          return ['ON', 'OFF', 'AKTIF', 'NONAKTIF'].indexOf(item.shown.toUpperCase()) >= 0;
        });
        const descriptions = rest.filter(function(item) {
          return (!duration || item.index !== duration.index) &&
            (!status || item.index !== status.index);
        });
        if (duration) rowDays = duration.raw;
        if (status) rowStatus = status.shown;
        if (descriptions.length) rowDescription = descriptions.map(function(item) { return item.shown; }).join(' ');
      }
    }

    if (!eventName) continue;
    const headerKey = normalizeHeader(eventName);
    if (eventHeaders.indexOf(headerKey) >= 0) continue;

    const daysRaw = rowDays == null ? '' : rowDays;
    const status = String(rowStatus == null ? '' : rowStatus).trim().toUpperCase();
    const description = String(rowDescription == null ? '' : rowDescription).trim();
    let days = Number(String(daysRaw).replace(',', '.').trim());
    if (!Number.isFinite(days)) days = 0;

    output.push({
      row: r + 1,
      event: eventName,
      days: days,
      status: status,
      description: description
    });
  }

  Logger.log(
    'EVENT DINAMIS READ: sheet=' + sheet.getName() +
    ' lastRow=' + lastRow +
    ' lastColumn=' + lastColumn +
    ' headerRow=' + (headerRow >= 0 ? headerRow + 1 : 'tidak ditemukan') +
    ' rows=' + output.length +
    ' data=' + JSON.stringify(output)
  );

  if (output.length === 0) {
    Logger.log(
      'EVENT DIAGNOSTIK: contoh isi 5 baris pertama=' +
      JSON.stringify(displays.slice(0, 5))
    );
  }

  return output;
}

// =========================================================
// PROSES SHEET ADZAN
//
// FORMAT SHEET ADZAN:
//
// A1 = beep
// B1 = URL beep
//
// A2 = adzan-subuh
// B2 = URL adzan subuh
//
// A3 = adzan-biasa
// B3 = URL adzan biasa
//
// A4 = tarhim-subuh
// B4 = URL tarhim subuh
//
// A5 = tarhim-biasa
// B5 = URL tarhim biasa
//
// A6 = iqomah
// B6 = URL iqomah
//
// A7 = doa
// B7 = URL doa
// =========================================================

function processKeyAudioSheet(
  sheet,
  resultObj
) {

  if (!sheet) {

    Logger.log(
      'ERROR: Sheet Adzan tidak ditemukan.'
    );

    return;
  }

  Logger.log(
    '=== PROCESS AUDIO SHEET ADZAN ==='
  );

  const lastRow =
    sheet.getLastRow();

  if (
    lastRow < 1
  ) {

    Logger.log(
      'Sheet Adzan kosong.'
    );

    return;
  }

  const data =
    sheet
      .getRange(
        1,
        1,
        lastRow,
        2
      )
      .getDisplayValues();


  for (
    let r = 0;
    r < data.length;
    r++
  ) {

    const key =
      data[r][0]
        ? data[r][0]
            .toString()
            .trim()
            .toLowerCase()
        : '';

    const value =
      data[r][1]
        ? data[r][1]
            .toString()
            .trim()
        : '';

    if (!key) {
      continue;
    }

    resultObj.Audio[key] =
      value;

    Logger.log(
      'Audio[' +
      key +
      '] = [' +
      value +
      ']'
    );
  }


  Logger.log(
    'AUDIO RESULT = ' +
    JSON.stringify(
      resultObj.Audio
    )
  );
}


// =========================================================
// PROSES URUTAN + DURASI AUDIO SHEET ADZAN
//
// Struktur yang dibaca:
// D = No
// E:F = Subuh / detik
// G:H = Dzuhur / detik
// I:J = Ashar / detik
// K:L = Maghrib / detik
// M:N = Isya / detik
// P = No Jumat
// Q:R = Jum'at / detik
//
// Contoh:
// qiroah | 1800
// gap    | 3
// tarhim | 315
// ...
// iqomah | 45
//
// DURASI TIDAK MENGGUNAKAN FALLBACK.
// 0 = event/gap dilewati.
// kosong = 0 (dilewati).
// =========================================================

// =========================================================
// PARSER SHEET ADZAN V7 - DETEKSI STRUKTUR OTOMATIS
// =========================================================
// Tujuan:
// - Tidak mengunci Sheet pada satu susunan kolom tertentu.
// - Mendukung blok EVENT|DURASI maupun EVENT|DURASI|STATUS.
// - Hanya nama event audio yang sah yang boleh masuk sequence.
// - Nilai ON/OFF/angka tidak pernah dianggap sebagai nama event.
// - getDataFromSheet() dan getRealtimeAudioConfig() memakai parser sama.
// =========================================================

function parseAdzanSheetV7(data) {
  // Sheet Adzan saat ini memakai:
  // EVENT | STATUS
  // URL audio TIDAK berada di blok sequence; URL diambil dari A:B.
  //
  // Struktur:
  // E:F  SUBUH RAMADHAN
  // H:I  SUBUH BIASA
  // J:K  DZUHUR
  // M:N  ASHAR
  // P:Q  MAGRIB RAMADHAN
  // S:T  MAGRIB BIASA
  // V:W  ISYA
  // Y:Z  JUM'AT
  //
  // Durasi TIDAK dibaca dari Sheet sequence.
  // Frontend membaca durasi asli file melalui HTMLAudioElement.metadata.
  const result = {
    schedule: {
      SUBUH_RAMADHAN: [],
      SUBUH_BIASA: [],
      DZUHUR: [],
      ASHAR: [],
      MAGHRIB_RAMADHAN: [],
      MAGHRIB_BIASA: [],
      ISYA: []
    },
    friday: [],
    detected: {},
    warnings: []
  };

  if (!Array.isArray(data) || data.length === 0) return result;

  function cell(r,c) {
    const row=data[r]||[];
    return c>=0 && c<row.length ? row[c] : '';
  }
  function normalize(v) {
    return String(v==null?'':v).trim().toLowerCase()
      .replace(/[’`]/g,"'").replace(/\s+/g,' ');
  }
  function normalizeEvent(v) {
    let x=normalize(v);
    if (!x || x==='on' || x==='off') return '';
    x=x.replace(/_/g,'-').replace(/\s+/g,'-');
    if (/^qiroah-?\d+$/.test(x)) return x.replace(/^qiroah-?(\d+)$/,'qiroah-$1');
    if (/^qiraah-?\d+$/.test(x)) return x.replace(/^qiraah-?(\d+)$/,'qiroah-$1');
    if (x==='qiraah') return 'qiroah';
    if (x==='shalawat-tarhim'||x==='sholawat-tarhim') return 'tarhim';
    if (x==='azan-subuh') return 'adzan-subuh';
    if (x==='azan-biasa'||x==='azan') return x==='azan'?'adzan':'adzan-biasa';
    if (x==="do'a") return 'doa';
    if (x==='iqamah') return 'iqomah';
    if (x==='siren') return 'sirine';
    return x;
  }
  function isStatus(v) {
    const x=normalize(v).toUpperCase();
    return x==='ON'||x==='OFF';
  }
  function buildPair(eventCol,statusCol,name) {
    const items=[];
    const knownEvents = {
      'qiroah':1, 'qiroah-1':1, 'qiroah-2':1, 'qiroah-3':1,
      'qiroah-4':1, 'qiroah-5':1, 'tarhim':1, 'beep':1,
      'adzan':1, 'adzan-subuh':1, 'adzan-biasa':1, 'doa':1,
      'doa-adzan':1, 'doa-puasa':1, 'doa-buka':1, 'iqomah':1,
      'sirine':1
    };

    for(let r=0;r<data.length;r++){
      let event = normalizeEvent(cell(r,eventCol));
      let statusValue = cell(r,statusCol);

      // Toleransi jika EVENT/STATUS pada blok tertukar.
      if(!knownEvents[event]){
        const reverseEvent = normalizeEvent(cell(r,statusCol));
        if(knownEvents[reverseEvent]){
          event = reverseEvent;
          statusValue = cell(r,eventCol);
        }
      }

      // Abaikan header/baris lain yang bukan nama audio.
      if(!knownEvents[event]) continue;

      const status = isStatus(statusValue)
        ? (normalize(statusValue).toUpperCase()==='OFF'?'OFF':'ON')
        : 'ON';

      items.push({event:event,duration:0,status:status});
    }

    result.detected[name]={
      event:eventCol,
      status:statusCol,
      startRow:0,
      count:items.length
    };
    return items;
  }

  // Posisi kolom final Sheet Adzan:
  // E:F = SUBUH RAMADHAN
  // H:I = SUBUH BIASA
  // J:K = DZUHUR
  // M:N = ASHAR
  // P:Q = MAGHRIB RAMADHAN
  // S:T = MAGHRIB BIASA
  // V:W = ISYA
  // Y:Z = JUM'AT
  result.schedule.SUBUH_RAMADHAN = buildPair(4,5,'SUBUH_RAMADHAN');
  result.schedule.SUBUH_BIASA    = buildPair(7,8,'SUBUH_BIASA');
  result.schedule.DZUHUR         = buildPair(9,10,'DZUHUR');
  result.schedule.ASHAR          = buildPair(12,13,'ASHAR');
  result.schedule.MAGHRIB_RAMADHAN = buildPair(15,16,'MAGHRIB_RAMADHAN');
  result.schedule.MAGHRIB_BIASA    = buildPair(18,19,'MAGHRIB_BIASA');
  result.schedule.ISYA           = buildPair(21,22,'ISYA');
  result.friday = buildPair(24,25,'JUMAT');

  Object.keys(result.schedule).forEach(function(name){
    Logger.log('AUDIO SCHEDULE '+name+': '+JSON.stringify(result.schedule[name]));
  });
  Logger.log("AUDIO JUM'AT: "+JSON.stringify(result.friday));
  return result;
}


// =========================================================
// PROSES URUTAN + DURASI AUDIO SHEET ADZAN
// =========================================================
function processAdzanScheduleSheet(sheet, resultObj) {
  if (!sheet) return;

  const lastRow = Math.max(sheet.getLastRow(), 1);
  const data = sheet
    .getRange(1, 1, lastRow, 27)
    .getValues();

  const parsed = parseAdzanSheetV7(data);

  resultObj.AudioSchedule = parsed.schedule;
  resultObj.AudioFriday = parsed.friday;
  resultObj.AudioScheduleJSON = JSON.stringify(parsed.schedule);
  resultObj.AudioFridayJSON = JSON.stringify(parsed.friday);

  const genericDurations = {};

  Object.keys(parsed.schedule).forEach(function(prayerName) {
    parsed.schedule[prayerName].forEach(function(item) {
      let type = item.event;

      if (/^qiroah-\d+$/.test(String(type || '').toLowerCase())) type = 'qiroah';
      else if (type === 'adzan-subuh') type = 'adzanSubuh';
      else if (type === 'adzan-biasa' || type === 'adzan') type = 'adzanBiasa';
      else if (type === 'tarhim') {
        type = /^SUBUH/.test(prayerName) ? 'tarhimSubuh' : 'tarhimBiasa';
      }

      if (genericDurations[type] === undefined) {
        genericDurations[type] = item.duration;
      }
    });
  });

  resultObj.AudioDurations = genericDurations;

  Object.keys(parsed.schedule).forEach(function(prayerName) {
    const d = parsed.detected[prayerName];
    Logger.log(
      'AUDIO SCHEDULE ' + prayerName + ': ' +
      JSON.stringify(parsed.schedule[prayerName])
    );
    Logger.log(
      'AUDIO MAPPING FIX ' + prayerName + ': ' +
      (d
        ? 'event=' + (d.event + 1) +
          ', duration=' + (d.duration + 1) +
          ', status=' + (d.status >= 0 ? (d.status + 1) : '-')
        : 'TIDAK TERDETEKSI')
    );
  });

  Logger.log("AUDIO JUM'AT: " + JSON.stringify(parsed.friday));
}

// =========================================================
// PROSES STATUS SUARA AUDIO SHEET ADZAN
//
// FORMAT KONTROL:
// T = NAMA AUDIO / EVENT
// U = ON / OFF
//
// ON  = audio diputar normal (UNMUTE)
// OFF = audio tetap diputar sesuai durasi, tetapi MUTE
// GAP tidak mempunyai kontrol suara dan tidak dipengaruhi status ini.
// =========================================================

function processAdzanAudioStatusSheet(sheet, resultObj) {
  if (!sheet) return;
  // Status per-event berasal dari kolom STATUS setiap blok.
  // AudioStatus hanya ringkasan kompatibilitas.
  const status = {
    qiroah: 'ON', tarhim: 'ON', beep: 'ON', adzan: 'ON',
    doa: 'ON', iqomah: 'ON', sirine: 'ON'
  };
  function categoryForEvent(event) {
    const e = String(event || '').trim().toLowerCase();
    if (/^qiroah-\d+$/.test(e) || e === 'qiroah') return 'qiroah';
    if (e === 'tarhim') return 'tarhim';
    if (e === 'beep') return 'beep';
    if (e === 'adzan' || e === 'adzan-subuh' || e === 'adzan-biasa') return 'adzan';
    if (e === 'doa') return 'doa';
    if (e === 'iqomah') return 'iqomah';
    if (e === 'sirine') return 'sirine';
    return '';
  }
  Object.keys(resultObj.AudioSchedule || {}).forEach(function(prayerName) {
    (resultObj.AudioSchedule[prayerName] || []).forEach(function(item) {
      const category = categoryForEvent(item && item.event);
      if (category && String(item.status || 'ON').toUpperCase() === 'OFF') status[category] = 'OFF';
    });
  });
  (Array.isArray(resultObj.AudioFriday) ? resultObj.AudioFriday : []).forEach(function(item) {
    const category = categoryForEvent(item && item.event);
    if (category && String(item.status || 'ON').toUpperCase() === 'OFF') status[category] = 'OFF';
  });
  resultObj.AudioStatus = status;
  Logger.log('AUDIO STATUS DARI BLOK SHEET = ' + JSON.stringify(status));
}



// =========================================================
// OVERLAY STATUS AUDIO REALTIME DARI PANELS!B45:Q
//
// panels:
// B/C = SUBUH RAMADHAN
// D/E = SUBUH BIASA
// F/G = DZUHUR
// H/I = ASHAR
// J/K = MAGHRIB RAMADHAN
// L/M = MAGHRIB BIASA
// N/O = ISYA
// P/Q = JUM'AT
//
// HANYA status ON/OFF yang dioverlay ke schedule dari Sheet Adzan.
// Urutan event, durasi, anchor, dan timing scheduler TIDAK diubah.
// =========================================================
function applyPanelAudioStatusRealtime_(ss, audioSchedule, audioFriday) {
  if (!ss || !audioSchedule) return;

  const panels = ss.getSheetByName('panels');
  if (!panels) {
    Logger.log('REALTIME AUDIO PANELS: sheet panels tidak ditemukan, status Adzan dipertahankan.');
    return;
  }

  // =========================================================
  // STRUKTUR FINAL PANELS — JANGAN DIUBAH
  //
  // B:C  = SUBUH RAMADHAN
  // D:E  = SUBUH BIASA
  // F:G  = DZUHUR
  // H:I  = ASHAR
  // J:K  = MAGHRIB RAMADHAN
  // L:M  = MAGHRIB BIASA
  // N:O  = ISYA
  // P:Q  = JUM'AT
  //
  // Data audio panels HANYA berada pada baris 46 s/d 55.
  // Baris 45 dan baris di bawah 55 TIDAK BOLEH ikut terbaca
  // sebagai konfigurasi audio.
  // =========================================================
  const values = panels.getRange('B46:Q55').getDisplayValues();

  const canonicalSelector = function(raw, sequenceName) {
    const e = String(raw == null ? '' : raw).trim().toLowerCase();
    const seq = String(sequenceName || '').trim().toUpperCase();

    if (!e || e === 'gap') return '';

    if (/^qiroah-[1-5]$/.test(e)) return e;
    if (e === 'qiroah') return 'qiroah';

    if (
      e === 'tarhim' ||
      e === 'tarhim-subuh' ||
      e === 'tarhim-biasa'
    ) return 'tarhim';

    if (e === 'beep') return 'beep';
    if (e === 'iqomah') return 'iqomah';
    if (e === 'sirine') return 'sirine';

    if (e === 'doa-adzan') return 'doa-adzan';
    if (e === 'doa-puasa') return 'doa-puasa';
    if (e === 'doa-buka') return 'doa-buka';

    // "doa" generik = doa-adzan saja.
    if (e === 'doa') return 'doa-adzan';

    if (e === 'adzan-subuh') return 'adzan-subuh';
    if (e === 'adzan-biasa') return 'adzan-biasa';

    if (e === 'adzan') {
      return /^SUBUH(?:_|$)/i.test(seq)
        ? 'adzan-subuh'
        : 'adzan-biasa';
    }

    return e;
  };

  // Ambil SATU blok panels lengkap, mempertahankan nomor baris asli.
  const getPanelItems = function(colOffset) {
    const items = [];

    for (let i = 0; i < values.length; i++) {
      const event = String(
        values[i][colOffset] == null ? '' : values[i][colOffset]
      ).trim();

      const status = String(
        values[i][colOffset + 1] == null ? '' : values[i][colOffset + 1]
      ).trim().toUpperCase();

      if (!event) continue;
      if (status !== 'ON' && status !== 'OFF') continue;

      items.push({
        event: event,
        status: status,
        row: 46 + i
      });
    }

    return items;
  };

  // =========================================================
  // PASANG PANEL -> SCHEDULE BERDASARKAN:
  //   1. sequence
  //   2. selector canonical
  //   3. occurrence/urutan kemunculan
  //
  // Jadi:
  //   B47 tarhim ON
  //   B50 tarhim OFF
  //
  // tidak pernah dianggap sebagai satu "tarhim" yang sama.
  //
  // Contoh paling penting:
  //   B52 = adzan-subuh
  //   C52 = OFF
  //
  // hanya mengontrol ADZAN SUBUH pada SUBUH RAMADHAN.
  // =========================================================
  const applyBlock = function(sequenceName, colOffset) {
    const target = Array.isArray(audioSchedule[sequenceName])
      ? audioSchedule[sequenceName]
      : [];

    const panelItems = getPanelItems(colOffset);

    if (!target.length || !panelItems.length) {
      Logger.log(
        'REALTIME AUDIO BLOK KOSONG: ' +
        sequenceName +
        ' target=' + target.length +
        ' panel=' + panelItems.length
      );
      return;
    }

    const usedTarget = {};

    panelItems.forEach(function(panelItem, panelIndex) {
      const wanted = canonicalSelector(
        panelItem.event,
        sequenceName
      );

      if (!wanted) return;

      // Occurrence selector di PANELS.
      let occurrence = 0;

      for (let p = 0; p < panelIndex; p++) {
        if (
          canonicalSelector(
            panelItems[p].event,
            sequenceName
          ) === wanted
        ) {
          occurrence++;
        }
      }

      // Occurrence selector di SCHEDULE.
      let seen = 0;
      let match = -1;

      for (let i = 0; i < target.length; i++) {
        if (usedTarget[i]) continue;

        const targetKey = canonicalSelector(
          target[i] && target[i].event,
          sequenceName
        );

        if (targetKey !== wanted) continue;

        if (seen === occurrence) {
          match = i;
          break;
        }

        seen++;
      }

      if (match < 0) {
        Logger.log(
          'REALTIME AUDIO MAP GAGAL: ' +
          sequenceName +
          ' row=' + panelItem.row +
          ' selector=' + panelItem.event +
          ' canonical=' + wanted +
          ' occurrence=' + occurrence
        );
        return;
      }

      usedTarget[match] = true;

      target[match].status = panelItem.status;

      Logger.log(
        'REALTIME AUDIO PANEL MAP: ' +
        sequenceName +
        ' row=' + panelItem.row +
        ' ' + panelItem.event +
        ' -> schedule[' + match + ']' +
        ' canonical=' + wanted +
        ' status=' + panelItem.status
      );
    });

    // =======================================================
    // PENGAMAN KHUSUS: jika SEMUA selector audio pada blok
    // yang terisi memang OFF, seluruh event schedule juga OFF.
    //
    // Ini mencegah event yang gagal dipasangkan karena variasi
    // nama selector tetap kembali ON.
    // =======================================================
    const allPanelItemsOff =
      panelItems.length > 0 &&
      panelItems.every(function(item) {
        return item.status === 'OFF';
      });

    if (allPanelItemsOff) {
      target.forEach(function(item) {
        if (
          item &&
          canonicalSelector(item.event, sequenceName)
        ) {
          item.status = 'OFF';
        }
      });

      Logger.log(
        'REALTIME AUDIO BLOK FULL OFF: ' +
        sequenceName +
        ' — SEMUA EVENT AUDIO DIPAKSA OFF'
      );
    }
  };

  const blocks = [
    ['SUBUH_RAMADHAN', 0], // B:C
    ['SUBUH_BIASA', 2],    // D:E
    ['DZUHUR', 4],         // F:G
    ['ASHAR', 6],          // H:I
    ['MAGHRIB_RAMADHAN', 8], // J:K
    ['MAGHRIB_BIASA', 10],   // L:M
    ['ISYA', 12]           // N:O
  ];

  blocks.forEach(function(block) {
    applyBlock(block[0], block[1]);
  });

  // =========================================================
  // JUM'AT — P:Q
  // =========================================================
  if (Array.isArray(audioFriday) && audioFriday.length) {
    const panelItems = getPanelItems(14); // P:Q
    const usedTarget = {};

    panelItems.forEach(function(panelItem, panelIndex) {
      const wanted = canonicalSelector(
        panelItem.event,
        'JUMAT'
      );

      if (!wanted) return;

      let occurrence = 0;

      for (let p = 0; p < panelIndex; p++) {
        if (
          canonicalSelector(
            panelItems[p].event,
            'JUMAT'
          ) === wanted
        ) {
          occurrence++;
        }
      }

      let seen = 0;
      let match = -1;

      for (let i = 0; i < audioFriday.length; i++) {
        if (usedTarget[i]) continue;

        const targetKey = canonicalSelector(
          audioFriday[i] && audioFriday[i].event,
          'JUMAT'
        );

        if (targetKey !== wanted) continue;

        if (seen === occurrence) {
          match = i;
          break;
        }

        seen++;
      }

      if (match < 0) {
        Logger.log(
          'REALTIME AUDIO MAP JUMAT GAGAL: ' +
          'row=' + panelItem.row +
          ' selector=' + panelItem.event +
          ' canonical=' + wanted +
          ' occurrence=' + occurrence
        );
        return;
      }

      usedTarget[match] = true;
      audioFriday[match].status = panelItem.status;

      Logger.log(
        "REALTIME AUDIO PANEL MAP JUM'AT: " +
        'row=' + panelItem.row +
        ' ' + panelItem.event +
        ' -> schedule[' + match + ']' +
        ' status=' + panelItem.status
      );
    });

    if (
      panelItems.length > 0 &&
      panelItems.every(function(item) {
        return item.status === 'OFF';
      })
    ) {
      audioFriday.forEach(function(item) {
        if (
          item &&
          canonicalSelector(item.event, 'JUMAT')
        ) {
          item.status = 'OFF';
        }
      });

      Logger.log(
        "REALTIME AUDIO BLOK FULL OFF: JUM'AT — SEMUA EVENT AUDIO DIPAKSA OFF"
      );
    }
  }
}

function buildAudioScheduleFromPanels_(ss) {
  const out = {schedule:{SUBUH_RAMADHAN:[],SUBUH_BIASA:[],DZUHUR:[],ASHAR:[],MAGHRIB_RAMADHAN:[],MAGHRIB_BIASA:[],ISYA:[]},friday:[]};
  const panels = getSheetCaseInsensitive_(ss, 'panels');
  if (!panels) return out;
  // Struktur panel audio final:
  // B45:Q55 = header + 10 baris audio.
  // Baris audio dimulai dari 46 sehingga C52 tetap pasangan
  // B52=event dan C52=status ON/OFF.
  const v = panels.getRange('B46:Q55').getDisplayValues();

  // Baca status dengan getDisplayValue langsung sebagai sumber realtime.
  // Ini sengaja dipisahkan dari parser agar perubahan ON/OFF di Sheet
  // tidak tergantung cache/object schedule lama.
  const directStatus = {
    SUBUH_RAMADHAN: panels.getRange('C46:C55').getDisplayValues().map(function(r){
      return String(r[0] == null ? '' : r[0]).trim().toUpperCase();
    }),
    SUBUH_BIASA: panels.getRange('E46:E55').getDisplayValues().map(function(r){
      return String(r[0] == null ? '' : r[0]).trim().toUpperCase();
    }),
    DZUHUR: panels.getRange('G46:G55').getDisplayValues().map(function(r){
      return String(r[0] == null ? '' : r[0]).trim().toUpperCase();
    }),
    ASHAR: panels.getRange('I46:I55').getDisplayValues().map(function(r){
      return String(r[0] == null ? '' : r[0]).trim().toUpperCase();
    }),
    MAGHRIB_RAMADHAN: panels.getRange('K46:K55').getDisplayValues().map(function(r){
      return String(r[0] == null ? '' : r[0]).trim().toUpperCase();
    }),
    MAGHRIB_BIASA: panels.getRange('M46:M55').getDisplayValues().map(function(r){
      return String(r[0] == null ? '' : r[0]).trim().toUpperCase();
    }),
    ISYA: panels.getRange('O46:O55').getDisplayValues().map(function(r){
      return String(r[0] == null ? '' : r[0]).trim().toUpperCase();
    }),
    JUMAT: panels.getRange('Q46:Q55').getDisplayValues().map(function(r){
      return String(r[0] == null ? '' : r[0]).trim().toUpperCase();
    })
  };
  Logger.log('AUDIO DIRECT STATUS PANELS: ' + JSON.stringify(directStatus));
  // Simpan nilai mentah supaya bila event tidak dikenali, log Apps Script
  // memperlihatkan pasangan kolom yang benar-benar dibaca. Tidak mengubah sel.
  Logger.log('AUDIO PANEL RAW B46:Q55: ' + JSON.stringify(v));
  const norm = function(raw, seq) {
    let e = String(raw == null ? '' : raw).trim().toLowerCase();
    if (!e || e === 'on' || e === 'off' || e === 'gap') return '';
    e = e.replace(/[’`]/g, "'").replace(/_/g,'-').replace(/\s+/g,'-');
    if (/^qiroah-?\d+$/.test(e)) return e.replace(/^qiroah-?(\d+)$/,'qiroah-$1');
    if (e === 'qiraah') return 'qiroah';
    if (e === 'shalawat-tarhim' || e === 'sholawat-tarhim' || e === 'tarhim-subuh' || e === 'tarhim-biasa') return 'tarhim';
    if (e === 'azan-subuh' || /^adzan-subuh-(ramadhan|ramadan|biasa)$/.test(e)) return 'adzan-subuh';
    if (e === 'azan-biasa' || /^adzan-(dzuhur|zuhur|ashar|maghrib|isya|jumat|jum'at)(-(ramadhan|ramadan|biasa))?$/.test(e)) return 'adzan-biasa';
    if (e === 'azan' || e === 'adzan') return /^SUBUH/i.test(String(seq||'')) ? 'adzan-subuh' : 'adzan-biasa';
    if (e === "do'a") return 'doa';
    if (e === 'iqamah') return 'iqomah';
    if (e === 'siren') return 'sirine';
    const allowed = {'qiroah':1,'qiroah-1':1,'qiroah-2':1,'qiroah-3':1,'qiroah-4':1,'qiroah-5':1,'tarhim':1,'beep':1,'adzan-subuh':1,'adzan-biasa':1,'doa':1,'doa-adzan':1,'doa-puasa':1,'doa-buka':1,'iqomah':1,'sirine':1};
    return allowed[e] ? e : '';
  };
  const block = function(offset, seq) {
    const a=[];
    for(let i=0;i<v.length;i++){
      const event=norm(v[i][offset],seq);
      if(!event) continue;
      const raw=String(v[i][offset+1] == null ? '' : v[i][offset+1]).trim().toUpperCase();
      a.push({event:event,duration:0,status:raw==='OFF'?'OFF':'ON'});
    }
    return a;
  };
  [['SUBUH_RAMADHAN',0],['SUBUH_BIASA',2],['DZUHUR',4],['ASHAR',6],['MAGHRIB_RAMADHAN',8],['MAGHRIB_BIASA',10],['ISYA',12]].forEach(function(x){out.schedule[x[0]]=block(x[1],x[0]);});
  out.friday=block(14,'JUMAT');
  out.directStatus = directStatus;
  Logger.log('AUDIO PANEL EVENT COUNTS: ' + JSON.stringify(Object.keys(out.schedule).reduce(function(acc, key) { acc[key] = out.schedule[key].length; return acc; }, {JUMAT: out.friday.length})));
  Logger.log('AUDIO SOURCE PANELS SAJA: '+JSON.stringify(out));
  return out;
}

// ============================================================
// AUDIO STATUS CEPAT - pola terpisah seperti getYoutubeControl()
// Hanya membaca status event pada panels!B46:Q55.
// Tidak membaca durasi, tidak menyusun ulang jadwal, dan tidak
// mengubah scheduler. Dipakai khusus untuk mute/unmute realtime.
// ============================================================
function getRealtimeAudioStatus() {
  try {
    const ss = getSpreadsheet();
    const sheet = getSheetCaseInsensitive_(ss, 'panels');
    if (!sheet) {
      return { success: false, error: 'Sheet panels tidak ditemukan.' };
    }

    SpreadsheetApp.flush();
    const takbiranSetting = String(sheet.getRange('C57').getDisplayValue() || '').trim().toUpperCase();
    const masterAudioSetting = String(sheet.getRange('G57').getDisplayValue() || '').trim().toUpperCase();
    const values = sheet.getRange('B46:Q55').getDisplayValues();
    const build = function(offset) {
      const list = [];
      values.forEach(function(row) {
        const event = String(row[offset] == null ? '' : row[offset]).trim();
        if (!event || /^(ON|OFF|GAP)$/i.test(event)) return;
        const rawStatus = String(row[offset + 1] == null ? '' : row[offset + 1])
          .trim().toUpperCase();
        if (rawStatus !== 'ON' && rawStatus !== 'OFF') return;
        list.push({ event: event, status: rawStatus });
      });
      return list;
    };

    return {
      success: true,
      TakbiranEnabled: takbiranSetting === 'ON',
      MasterAudioMuted: masterAudioSetting === 'MUTED',
      AudioSchedule: {
        SUBUH_RAMADHAN: build(0),
        SUBUH_BIASA: build(2),
        DZUHUR: build(4),
        ASHAR: build(6),
        MAGHRIB_RAMADHAN: build(8),
        MAGHRIB_BIASA: build(10),
        ISYA: build(12)
      },
      AudioFriday: build(14),
      source: 'panels!B46:Q55',
      timestamp: new Date().getTime()
    };
  } catch (error) {
    Logger.log('AUDIO STATUS CEPAT ERROR: ' + (error && error.message ? error.message : error));
    return { success: false, error: error && error.message ? error.message : String(error) };
  }
}

function getRealtimeAudioConfig() {
  try {
    const ss = getSpreadsheet();
    SpreadsheetApp.flush();

    // SUMBER FINAL JADWAL AUDIO:
    //   EVENT + ON/OFF = panels!B46:Q55
    //   URL AUDIO      = lokal ./audio/... (frontend)
    //
    // Sheet Adzan TIDAK dipakai untuk menentukan urutan schedule.
    // Parser lama Adzan pernah mengembalikan schedule=0 karena struktur
    // kolom sequence di Sheet Adzan berbeda dari struktur panels terbaru.
    // Durasi juga memang dibaca browser dari metadata MP3.
    const panelAudio = buildAudioScheduleFromPanels_(ss);

    const audioResult = {
      Audio: {},
      AudioSchedule: panelAudio.schedule || {},
      AudioDurations: {},
      AudioFriday: panelAudio.friday || []
    };

    const adzanSheet = getSheetCaseInsensitive_(ss, 'Adzan');
    if (adzanSheet) {
      // Hanya baca key/URL sebagai kompatibilitas API.
      // Frontend tetap memprioritaskan URL lokal ./audio/...
      processKeyAudioSheet(adzanSheet, audioResult);
    } else {
      Logger.log('REALTIME AUDIO: Sheet Adzan tidak ditemukan; memakai URL lokal frontend.');
    }

    const panelsSheet = ss.getSheetByName('panels');
    const takbiranSetting = panelsSheet
      ? String(panelsSheet.getRange('C57').getDisplayValue() || '').trim().toUpperCase()
      : 'OFF';
    const masterAudioSetting = panelsSheet
      ? String(panelsSheet.getRange('G57').getDisplayValue() || '').trim().toUpperCase()
      : 'UNMUTED';

    const result = {
      success: true,
      RamadanDisplay: getRamadanDisplaySetting(),
      TakbiranEnabled: takbiranSetting === 'ON',
      MasterAudioMuted: masterAudioSetting === 'MUTED',
      Audio: audioResult.Audio || {},
      AudioSchedule: audioResult.AudioSchedule || {},
      AudioDurations: audioResult.AudioDurations || {},
      AudioFriday: audioResult.AudioFriday || [],
      AudioStatus: {
        qiroah:'ON',
        tarhim:'ON',
        beep:'ON',
        adzan:'ON',
        doa:'ON',
        iqomah:'ON',
        sirine:'ON'
      }
    };
    Object.keys(result.AudioSchedule).forEach(function(k){(result.AudioSchedule[k]||[]).forEach(function(x){
      const e=String(x.event||'').toLowerCase(); const s=String(x.status||'ON').toUpperCase();
      const cat=/^qiroah/.test(e)?'qiroah':e==='tarhim'?'tarhim':e==='beep'?'beep':/^adzan/.test(e)?'adzan':/^doa/.test(e)?'doa':e==='iqomah'?'iqomah':e==='sirine'?'sirine':'';
      if(cat && s==='OFF') result.AudioStatus[cat]='OFF';
    });});
    (result.AudioFriday||[]).forEach(function(x){if(String(x.status||'ON').toUpperCase()==='OFF'){const e=String(x.event||'').toLowerCase();const cat=/^qiroah/.test(e)?'qiroah':e==='tarhim'?'tarhim':e==='beep'?'beep':/^adzan/.test(e)?'adzan':/^doa/.test(e)?'doa':e==='iqomah'?'iqomah':e==='sirine'?'sirine':'';if(cat)result.AudioStatus[cat]='OFF';}});
    result.PanelAudioFinal={};
    Object.keys(result.AudioSchedule || {}).forEach(function(seq){
      result.PanelAudioFinal[seq]=(result.AudioSchedule[seq]||[]).map(function(x,i){
        return {index:i,event:x.event||'',status:String(x.status||'ON').toUpperCase()};
      });
    });
    result.PanelAudioDirectStatus = panelAudio.directStatus || {};
    return result;
  } catch(error) {
    Logger.log('ERROR getRealtimeAudioConfig PANELS: '+error);
    return {success:false,error:error&&error.message?error.message:String(error)};
  }
}
// =========================================================
// PROSES SHEET RUNNING TEXT
// =========================================================

function processRunningTextSheet(
  sheet,
  resultObj
) {

  resultObj.Running_Text =
    '';

  if (!sheet) {
    return;
  }

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 1) {
    return;
  }

  const range =
    sheet.getRange(
      1,
      2,
      lastRow,
      1
    );

  const displayValues =
    range.getDisplayValues();

  const richTextValues =
    range.getRichTextValues();

  const runningTexts = [];

  for (
    let r = 0;
    r < displayValues.length;
    r++
  ) {

    const displayText =
      displayValues[r][0];

    if (
      displayText === null ||
      displayText === undefined ||
      displayText
        .toString()
        .trim() === ''
    ) {
      continue;
    }

    const richText =
      richTextValues[r][0];

    if (!richText) {

      runningTexts.push(
        escapeHtml(
          displayText.toString()
        ).replace(
          /\r?\n/g,
          '<br>'
        )
      );

      continue;
    }

    const runs =
      richText.getRuns();

    if (
      !runs ||
      runs.length === 0
    ) {

      runningTexts.push(
        escapeHtml(
          displayText.toString()
        ).replace(
          /\r?\n/g,
          '<br>'
        )
      );

      continue;
    }

    let htmlText =
      '';

    for (
      let i = 0;
      i < runs.length;
      i++
    ) {

      const run =
        runs[i];

      if (!run) {
        continue;
      }

      let text =
        run.getText();

      if (!text) {
        continue;
      }

      text =
        escapeHtml(
          text
        );

      text =
        text.replace(
          /\r?\n/g,
          '<br>'
        );

      const style =
        run.getTextStyle();

      let bold =
        false;

      let italic =
        false;

      let underline =
        false;

      let strike =
        false;

      if (style) {

        try {
          bold =
            style.isBold() === true;
        } catch (e) {
          bold = false;
        }

        try {
          italic =
            style.isItalic() === true;
        } catch (e) {
          italic = false;
        }

        try {
          underline =
            style.isUnderline() === true;
        } catch (e) {
          underline = false;
        }

        try {
          strike =
            style.isStrikethrough() === true;
        } catch (e) {
          strike = false;
        }
      }

      if (bold) {
        text =
          '<strong>' +
          text +
          '</strong>';
      }

      if (italic) {
        text =
          '<em>' +
          text +
          '</em>';
      }

      if (underline) {
        text =
          '<u>' +
          text +
          '</u>';
      }

      if (strike) {
        text =
          '<s>' +
          text +
          '</s>';
      }

      htmlText +=
        text;
    }

    const plainText =
      htmlText
        .replace(
          /<[^>]*>/g,
          ''
        )
        .trim();

    if (
      plainText !== ''
    ) {
      runningTexts.push(
        htmlText
      );
    }
  }

  resultObj.Running_Text =
    runningTexts.join(
      ' ❖ '
    );
}


// =========================================================
// ESCAPE HTML
// =========================================================

function escapeHtml(
  text
) {

  if (
    text === null ||
    text === undefined
  ) {
    return '';
  }

  return text
    .toString()
    .replace(
      /&/g,
      '&amp;'
    )
    .replace(
      /</g,
      '&lt;'
    )
    .replace(
      />/g,
      '&gt;'
    )
    .replace(
      /"/g,
      '&quot;'
    );
}


// =========================================================
// PROSES SHEET YOUTUBE
// =========================================================

function processYoutubeSheet(
  data,
  resultObj
) {

  if (
    !data ||
    data.length === 0
  ) {
    return;
  }

  // =====================================================
  // STRUKTUR FINAL SHEET YOUTUBE
  // B1 = LINK YOUTUBE
  // C1 = STATUS
  //
  // STATUS:
  // ON   = YouTube berjalan + UNMUTE; 5 menit sebelum Qiroah
  //        sistem mengubah C1 ON -> OFF sehingga YouTube MUTE.
  // OFF  = YouTube tetap berjalan tetapi MUTE.
  // AUTO = MUTE 5 menit sebelum Qiroah, tetap MUTE sampai
  //        30 menit setelah IQOMAH selesai, lalu UNMUTE.
  // STOP = YouTube benar-benar dihentikan.
  // =====================================================

  let youtubeUrl = '';

  if (
    data[0] &&
    data[0].length > 1
  ) {
    youtubeUrl =
      data[0][1] !== null &&
      data[0][1] !== undefined
        ? data[0][1].toString().trim()
        : '';
  }

  resultObj.Youtube = youtubeUrl;

  let youtubeStatus = 'AUTO';

  if (
    data[0] &&
    data[0].length > 2
  ) {
    youtubeStatus =
      data[0][2] !== null &&
      data[0][2] !== undefined
        ? data[0][2].toString().trim().toUpperCase()
        : '';
  }

  if (
    youtubeStatus !== 'AUTO' &&
    youtubeStatus !== 'ON' &&
    youtubeStatus !== 'OFF' &&
    youtubeStatus !== 'STOP'
  ) {
    youtubeStatus = 'AUTO';
  }

  resultObj.YoutubeStatus =
    youtubeStatus;

  // Kompatibilitas data lama:
  // AUTO dihitung oleh frontend berdasarkan jadwal.
  // OFF = tetap berjalan tetapi MUTE.
  // STOP = benar-benar dihentikan oleh frontend.
  resultObj.YoutubeMute =
    youtubeStatus === 'OFF';

  resultObj.YoutubeStopped =
    youtubeStatus === 'STOP';

  // AUTO: mute dimulai 2 menit sebelum Qiroah-1 s.d. Qiroah-5.
  // Akhir mute (20 menit setelah waktu iqomah) dihitung frontend dari jadwal.
  resultObj.YoutubeMuteBeforeQiroahSeconds =
    120;

  resultObj.YoutubeControlLocked =
    false;

  Logger.log(
    'YOUTUBE: URL=' + youtubeUrl +
    ' | STATUS=' + youtubeStatus +
    ' | AUTO_MUTE_BEFORE_QIROAH=120 detik'
  );
}


// =========================================================
// SET STATUS YOUTUBE KE OFF OLEH SISTEM
//
// Dipakai HANYA untuk mode C1=ON ketika sistem masuk
// 5 menit sebelum Qiroah.
//
// C1=OFF berarti YouTube tetap berjalan tetapi MUTE.
// Operator dapat mengubah C1 kembali ke ON untuk UNMUTE manual.
// Tidak membuat protection/lock.
// =========================================================

function setYoutubeStatusOff() {

  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('youtube');

  if (!sheet) {
    throw new Error('Sheet youtube tidak ditemukan.');
  }

  const range = sheet.getRange('C1');
  const current =
    range.getDisplayValue()
      .toString()
      .trim()
      .toUpperCase();

  // Jangan menimpa AUTO atau OFF.
  // Hanya ON yang boleh diubah otomatis menjadi OFF.
  if (current === 'ON') {
    range.setValue('OFF');
    SpreadsheetApp.flush();

    Logger.log(
      'YOUTUBE STATUS AUTO-OFF: C1 ON -> OFF'
    );

    return {
      changed: true,
      status: 'OFF'
    };
  }

  return {
    changed: false,
    status: current || 'AUTO'
  };
}


function getYoutubeStatus() {

  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('youtube');

  if (!sheet) {
    return {
      status: 'AUTO'
    };
  }

  let status =
    sheet.getRange('C1')
      .getDisplayValue()
      .toString()
      .trim()
      .toUpperCase();

  if (
    status !== 'AUTO' &&
    status !== 'ON' &&
    status !== 'OFF' &&
    status !== 'STOP'
  ) {
    status = 'AUTO';
  }

  return {
    status: status
  };
}


// =========================================================
// PROSES SHEET JUM'AT
// =========================================================

function processJumatSheet(
  data,
  resultObj
) {

  if (
    !data ||
    data.length === 0
  ) {
    return;
  }

  for (
    let r = 0;
    r < data.length;
    r++
  ) {

    if (
      data[r].length < 2
    ) {
      continue;
    }

    let key =
      data[r][0];

    let value =
      data[r][1];

    if (
      !key
    ) {
      continue;
    }

    key =
      key
        .toString()
        .trim()
        .toLowerCase();

    if (
      [
        'tanggal',
        'tgl',
        'tgl khotbah',
        'tgl_khotbah',
        'tanggal khotbah'
      ].includes(key)
    ) {

      if (
        value instanceof Date
      ) {
        value =
          formatTanggalIndonesia(
            value
          );
      } else {
        value =
          value !== null &&
          value !== undefined
            ? value
                .toString()
                .trim()
            : '';
      }

      resultObj.Tgl_Khotbah =
        value;

    } else if (
      [
        'khatib',
        'khotib'
      ].includes(key)
    ) {

      resultObj.Khotib =
        value !== null &&
        value !== undefined
          ? value
              .toString()
              .trim()
          : '';

    } else if (
      key === 'imam'
    ) {

      resultObj.Imam =
        value !== null &&
        value !== undefined
          ? value
              .toString()
              .trim()
          : '';

    } else if (
      [
        'muadzin',
        'muazin'
      ].includes(key)
    ) {

      resultObj.Muadzin =
        value !== null &&
        value !== undefined
          ? value
              .toString()
              .trim()
          : '';
    }
  }
}


// =========================================================
// FORMAT TANGGAL INDONESIA
// =========================================================

function formatTanggalIndonesia(
  date
) {

  const timezone =
    'Asia/Makassar';

  const bulan = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember'
  ];

  const tanggal =
    String(
      parseInt(
        Utilities.formatDate(
          date,
          timezone,
          'dd'
        ),
        10
      )
    );

  const bulanIndex =
    parseInt(
      Utilities.formatDate(
        date,
        timezone,
        'MM'
      ),
      10
    ) - 1;

  const tahun =
    Utilities.formatDate(
      date,
      timezone,
      'yyyy'
    );

  return (
    tanggal +
    ' ' +
    bulan[bulanIndex] +
    ' ' +
    tahun
  );
}


// =========================================================
// PROSES KEY VALUE
// =========================================================

function processKeyValue(
  key,
  value,
  resultObj
) {

  if (
    key !== '' &&
    key !== null &&
    key !== undefined
  ) {

    key =
      key
        .toString()
        .trim();

    if (
      value instanceof Date
    ) {

      value =
        Utilities.formatDate(
          value,
          Session.getScriptTimeZone(),
          'dd MMM yyyy'
        );
    }

    resultObj[key] =
      value !== undefined
        ? value
        : '';
  }
}


// ============================================================
// JADWAL SHOLAT - API INDONESIA SEBAGAI SUMBER TUNGGAL
// API key dibaca dari Script Properties: API_INDONESIA_KEY.
// Jika API Indonesia gagal, fungsi mengembalikan error; tidak
// mengambil jadwal dari penyedia lain agar sumber tetap konsisten.
// Kontrak respons tetap kompatibel dengan index.html / API.gs.
// Tidak mengubah audio, scheduler, atau pemicu sholat.
// ============================================================
 function getPrayerSchedule(dateString) {
   var timezoneDefault = 'Asia/Makassar';
   var ss = getSpreadsheet();
   var panels = ss.getSheetByName('panels');
   if (!panels) return { success: false, error: 'Sheet panels tidak ditemukan.' };

   var loc = panels.getRange('C5:C10').getDisplayValues().map(function(row) {
     return String(row[0] || '').trim();
   });
   var kota = loc[0] || '';
   var provinsi = loc[1] || '';
   var timezone = loc[3] || timezoneDefault;
   if (!kota) return { success: false, error: 'panels!C5 (kota) kosong.' };

   if (!dateString) dateString = Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd');
   dateString = String(dateString).trim();
   if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
     return { success: false, error: 'Format tanggal harus YYYY-MM-DD.' };
   }

   var fallbackReason = '';
   try {
     var props = PropertiesService.getScriptProperties();
     var apiKey = String(props.getProperty('API_INDONESIA_KEY') || '').trim();
     if (!apiKey) throw new Error('Script Property API_INDONESIA_KEY belum diisi.');

     var cache = CacheService.getScriptCache();
     var cityCacheKey = 'APIID_SHOLAT_CITIES_V1';
     var cityListText = cache.get(cityCacheKey);
     var cityList;
     if (cityListText) {
       try { cityList = JSON.parse(cityListText); } catch (ignoreCityCache) { cityList = null; }
     }
     // Daftar resmi dibaca dari GitHub terlebih dahulu; API daftar kota hanya dipanggil
     // jika file belum tersedia. Ini mencegah pemanggilan API berulang tiap cache sementara habis.
     if (!Array.isArray(cityList) || !cityList.length) {
       try {
         var githubCityDoc = readGithubJsonFile_("data/daftar-kota.json");
         if (githubCityDoc && Array.isArray(githubCityDoc.cities) && githubCityDoc.cities.length) {
           cityList = githubCityDoc.cities.map(function(city) {
             return {
               regency_id: String(city.regency_id || city.id || ""),
               regency_name: String(city.name || city.regency_name || ""),
               province_name: String(city.province || city.province_name || "")
             };
           }).filter(function(city) { return city.regency_id && city.regency_name; });
         }
       } catch (githubCityReadError) {
         Logger.log("DAFTAR KOTA GITHUB TIDAK DAPAT DIBACA: " +
           (githubCityReadError && githubCityReadError.message ? githubCityReadError.message : githubCityReadError));
       }
     }
     if (!Array.isArray(cityList) || !cityList.length) {
       var listResponse = UrlFetchApp.fetch('https://use.apiindonesia.id/api/v1/sholat/list-kota', {
         method: 'get',
         muteHttpExceptions: true,
         headers: { 'x-api-key': apiKey, 'Accept': 'application/json' }
       });
       if (listResponse.getResponseCode() < 200 || listResponse.getResponseCode() >= 300) {
         throw new Error('API Indonesia daftar kota HTTP ' + listResponse.getResponseCode() + '.');
       }
       var listJson = JSON.parse(listResponse.getContentText() || '{}');
       cityList = listJson && Array.isArray(listJson.data) ? listJson.data : [];
       if (!cityList.length) throw new Error('API Indonesia tidak mengembalikan daftar kota.');
       try { cache.put(cityCacheKey, JSON.stringify(cityList), 21600); } catch (ignoreCityPut) {}
       // Simpan daftar API ke GitHub supaya request berikutnya tidak perlu mengambil ulang daftar.
       try {
         var cityDoc = {
           success: true,
           version: 1,
           generatedAt: new Date().toISOString(),
           source: "API Indonesia /api/v1/sholat/list-kota",
           cityCount: cityList.length,
           cities: cityList.map(function(city) {
             return {
               name: String(city.regency_name || city.name || ""),
               province: String(city.province_name || city.province || ""),
               regency_id: String(city.regency_id || city.id || ""),
               zone: "",
               timezone: "",
               gmt: "",
               slug: ""
             };
           })
         };
         writeGithubJsonFile_("data/daftar-kota.json", cityDoc, "Simpan daftar kota API Indonesia ke GitHub");
       } catch (githubCityWriteError) {
         Logger.log("SIMPAN DAFTAR KOTA GITHUB GAGAL: " +
           (githubCityWriteError && githubCityWriteError.message ? githubCityWriteError.message : githubCityWriteError));
       }
     }
     try { cache.put(cityCacheKey, JSON.stringify(cityList), 21600); } catch (ignoreCityPutFinal) {}

     function normalizeCityName_(value) {
       return String(value || '').toUpperCase()
         .replace(/^(KOTA\s+ADM\.?\s*|KOTA\s+|KABUPATEN\s+|KABUP\.?\s+|KAB\.?\s+)/, '')
         .replace(/[^A-Z0-9]+/g, ' ')
         .trim()
         .replace(/\s+/g, ' ');
     }
     var wantedCity = normalizeCityName_(kota);
     var wantedProvince = normalizeCityName_(provinsi);
     var matches = cityList.filter(function(item) {
       var apiCityName = item && (item.regency_name || item.name || item.alt_name);
       return normalizeCityName_(apiCityName) === wantedCity;
     });
     if (matches.length > 1 && wantedProvince) {
       var provinceMatches = matches.filter(function(item) {
         return normalizeCityName_(item.province_name || item.province) === wantedProvince;
       });
       if (provinceMatches.length) matches = provinceMatches;
     }
     if (!matches.length) {
       throw new Error('Kota "' + kota + '" tidak ditemukan pada daftar kota API Indonesia. Jalankan refreshDaftarKotaAPIIndonesia() dan periksa panels!C5:C6.');
     }
     if (matches.length > 1) {
       throw new Error('Nama kota "' + kota + '" cocok dengan lebih dari satu wilayah API Indonesia; periksa provinsi pada panels!C6.');
     }
     var regencyId = String(matches[0].regency_id || matches[0].id || matches[0].code || '').trim();
     if (!regencyId) throw new Error('ID kabupaten/kota API Indonesia kosong.');

     var year = Number(dateString.slice(0, 4));
     var month = Number(dateString.slice(5, 7));
     var monthText = ('0' + month).slice(-2);
     var monthId = regencyId + '_' + year + monthText;
     var apiCacheKey = 'PRAYER_APIID_' + regencyId + '_' + dateString.replace(/-/g, '');
     var monthlyCacheKey = 'PRAYER_APIID_MONTH_' + monthId;
     var monthlyDoc = null;
     var monthlyEntry = null;
     var monthlyText = cache.get(monthlyCacheKey);
     if (monthlyText) {
       try { monthlyEntry = JSON.parse(monthlyText); } catch (ignoreMonthlyCache) { monthlyEntry = null; }
     }

     // CacheService hanya lapisan sementara. Jika kosong, sumber permanen adalah GitHub.
     if (!monthlyEntry || !Array.isArray(monthlyEntry.days) || !monthlyEntry.days.length) {
       try {
         monthlyDoc = readGithubJsonFile_("data/prayer-monthly-cache.json");
       } catch (githubMonthlyReadError) {
         Logger.log("CACHE JADWAL BULANAN GITHUB BELUM DAPAT DIBACA: " +
           (githubMonthlyReadError && githubMonthlyReadError.message ? githubMonthlyReadError.message : githubMonthlyReadError));
       }
       if (monthlyDoc && monthlyDoc.months && monthlyDoc.months[monthId] &&
           Array.isArray(monthlyDoc.months[monthId].days)) {
         monthlyEntry = monthlyDoc.months[monthId];
       }
     }

     if (!monthlyEntry || !Array.isArray(monthlyEntry.days) || !monthlyEntry.days.length) {
       var monthlyUrl = 'https://use.apiindonesia.id/api/v1/sholat/monthly?kabupaten_id=' +
         encodeURIComponent(regencyId) + '&tahun=' + encodeURIComponent(year) +
         '&bulan=' + encodeURIComponent(month);
       var monthlyResponse = UrlFetchApp.fetch(monthlyUrl, {
         method: 'get',
         muteHttpExceptions: true,
         headers: { 'x-api-key': apiKey, 'Accept': 'application/json' }
       });
       if (monthlyResponse.getResponseCode() < 200 || monthlyResponse.getResponseCode() >= 300) {
         throw new Error('API Indonesia jadwal bulanan HTTP ' + monthlyResponse.getResponseCode() + '.');
       }
       var monthlyPayload = JSON.parse(monthlyResponse.getContentText() || '{}');
       var monthlyDays = monthlyPayload && Array.isArray(monthlyPayload.data) ? monthlyPayload.data : [];
       if (!monthlyDays.length) throw new Error('API Indonesia tidak mengembalikan jadwal bulanan untuk ' + kota + '.');

       function normalizeMonthlyTime_(value) {
         var match = String(value == null ? '' : value).trim().match(/^(\\d{1,2}):(\\d{2})(?::\\d{2})?$/);
         return match ? ('0' + match[1]).slice(-2) + ':' + match[2] : '';
       }
       var expectedDays = new Date(year, month, 0).getDate();
       var seenDates = {};
       monthlyDays.forEach(function(day) {
         var d = String(day.date || day.tanggal || '').trim();
         if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(d) || d.slice(0, 7) !== year + '-' + monthText) {
           throw new Error('Tanggal tidak valid pada respons jadwal bulanan untuk ' + kota + ': ' + d);
         }
         day.date = d;
         day.imsyak = normalizeMonthlyTime_(day.imsyak || day.imsyak || day.imsak);
         day.shubuh = normalizeMonthlyTime_(day.shubuh || day.shubuh);
         day.terbit = normalizeMonthlyTime_(day.terbit);
         day.dzuhur = normalizeMonthlyTime_(day.dzuhur);
         day.ashr = normalizeMonthlyTime_(day.ashr || day.ashar);
         day.maghrib = normalizeMonthlyTime_(day.maghrib);
         day.isya = normalizeMonthlyTime_(day.isya);
         if (!day.shubuh || !day.terbit || !day.dzuhur || !day.ashr || !day.maghrib || !day.isya) {
           throw new Error('Ada waktu sholat tidak lengkap pada tanggal ' + d + ' untuk ' + kota);
         }
         seenDates[d] = true;
       });
       if (Object.keys(seenDates).length !== expectedDays) {
         throw new Error('Jadwal bulanan tidak lengkap: diterima ' + Object.keys(seenDates).length +
           ' dari ' + expectedDays + ' tanggal untuk ' + kota + '.');
       }

       monthlyEntry = {
         regency_id: regencyId,
         kota: kota,
         provinsi: provinsi,
         tahun: year,
         bulan: month,
         source: 'API Indonesia / Kemenag',
         updatedAt: new Date().toISOString(),
         days: monthlyDays
       };
       monthlyDoc = monthlyDoc && monthlyDoc.months && typeof monthlyDoc.months === 'object' ? monthlyDoc : {
         success: true, source: 'API Indonesia / Kemenag monthly', generatedAt: '', updatedAt: '', months: {}
       };
       monthlyDoc.months[monthId] = monthlyEntry;
       monthlyDoc.success = true;
       monthlyDoc.source = 'API Indonesia / Kemenag monthly';
       monthlyDoc.generatedAt = new Date().toISOString();
       monthlyDoc.updatedAt = monthlyDoc.generatedAt;
       monthlyDoc.monthCount = Object.keys(monthlyDoc.months).length;
       writeGithubJsonFile_("data/prayer-monthly-cache.json", monthlyDoc,
         "Cache jadwal sholat bulanan " + kota + " " + year + "-" + monthText);
       Logger.log("JADWAL BULANAN DISIMPAN KE GITHUB: " + kota + " " + year + "-" + monthText +
         " (" + monthlyDays.length + " tanggal).");
     }

     try { cache.put(monthlyCacheKey, JSON.stringify(monthlyEntry), 21600); } catch (ignoreMonthlyPut) {}
     var data = monthlyEntry.days.filter(function(day) {
       return String(day.date || day.tanggal || '') === dateString;
     })[0];
     if (!data) throw new Error('Tanggal ' + dateString + ' tidak ditemukan dalam cache bulanan GitHub untuk ' + kota + '.');
     var returnedDate = String(data.date || data.tanggal || '').trim();
     var returnedRegencyId = String(data.regency_id || data.kabupaten_id || regencyId).trim();
     if (returnedDate !== dateString) {
       throw new Error('Tanggal respons API Indonesia tidak cocok: diminta ' + dateString + ', diterima ' + returnedDate + '.');
     }
     if (returnedRegencyId && returnedRegencyId !== regencyId) {
       throw new Error('Respons API Indonesia berasal dari ID kota yang berbeda (' + returnedRegencyId + ').');
     }

     var timezoneFromPanel = timezone || timezoneDefault;
     var zona = loc[2] || (timezoneFromPanel === 'Asia/Jakarta' ? 'WIB' :
       timezoneFromPanel === 'Asia/Jayapura' ? 'WIT' : 'WITA');
     var result = {
       success: true,
       kota: kota,
       provinsi: provinsi,
       slug: loc[5] || String(kota).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
       tanggal: returnedDate,
       timezone: timezoneFromPanel,
       zona: zona,
       gmt: loc[4] || '',
       source: 'API Indonesia / Kemenag',
       cached: false,
       cacheSource: 'API Indonesia',
       jadwal: {
         imsak: prayerTime_(data.imsyak),
         subuh: prayerTime_(data.shubuh),
         terbit: prayerTime_(data.terbit),
         dzuhur: prayerTime_(data.dzuhur),
         ashar: prayerTime_(data.ashr),
         maghrib: prayerTime_(data.maghrib),
         isya: prayerTime_(data.isya)
       }
     };
     if (!isCompletePrayerScheduleSafe_(result.jadwal)) {
       throw new Error('Jadwal API Indonesia tidak lengkap atau format waktu tidak valid.');
     }
     try { cache.put(apiCacheKey, JSON.stringify(result), 21600); } catch (ignoreSchedulePut) {}
     Logger.log('JADWAL SHOLAT SUMBER UTAMA: API Indonesia, kota=' + kota +
       ', regency_id=' + regencyId + ', tanggal=' + dateString);
     return result;
   } catch (apiError) {
     fallbackReason = apiError && apiError.message ? apiError.message : String(apiError);
     Logger.log('API INDONESIA JADWAL GAGAL: ' + fallbackReason);
     return {
       success: false,
       source: 'API Indonesia',
       kota: kota,
       provinsi: provinsi,
       tanggal: dateString,
       error: 'Jadwal sholat API Indonesia gagal. Sumber lain tidak digunakan.',
       apiIndonesiaError: fallbackReason
     };
   }
 }

// Fallback jadwal legacy dan cache ScriptProperties tidak lagi digunakan.
// Jadwal sholat aktif hanya diambil dari API Indonesia.

// ============================================================
// VALIDASI JADWAL SHOLAT LENGKAP
// ============================================================
function isValidPrayerTimeSafe_(value) {
  const time = String(value == null ? '' : value).trim();
  const parts = time.split(':');

  if (parts.length !== 2) return false;

  const hour = Number(parts[0]);
  const minute = Number(parts[1]);

  return Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 && hour <= 23 &&
    minute >= 0 && minute <= 59 &&
    parts[0] !== '' &&
    parts[1] !== '';
}

function isCompletePrayerScheduleSafe_(jadwal) {
  if (!jadwal || typeof jadwal !== 'object') return false;

  const fields = [
    'subuh',
    'terbit',
    'dzuhur',
    'ashar',
    'maghrib',
    'isya'
  ];

  return fields.every(function(field) {
    return isValidPrayerTimeSafe_(jadwal[field]);
  });
}

function isCompletePrayerSchedule_(jadwal) {

  if (!jadwal || typeof jadwal !== 'object') {
    return false;
  }

  const fields = [
    'subuh',
    'terbit',
    'dzuhur',
    'ashar',
    'maghrib',
    'isya'
  ];

  for (let i = 0; i < fields.length; i++) {
    const value = String(jadwal[fields[i]] || '').trim();

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      return false;
    }
  }

  return true;
}

// =========================================================
// JADWAL SHOLAT - WRAPPER JSON AMAN UNTUK google.script.run
// =========================================================
// Wrapper ini sengaja memakai nama fungsi unik dan mengembalikan
// STRING JSON agar hasil dari server selalu dapat diterima frontend.
// =========================================================


// =========================================================
// NORMALISASI WAKTU SHOLAT
// =========================================================

function normalizePrayerTime(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '';
  }

  if (
    Object.prototype.toString.call(
      value
    ) ===
    '[object Date]'
  ) {

    if (
      isNaN(
        value.getTime()
      )
    ) {
      return '';
    }

    return Utilities.formatDate(
      value,
      'Asia/Makassar',
      'HH:mm'
    );
  }

  let time =
    value
      .toString()
      .trim();

  if (!time) {
    return '';
  }

  const dotMatch =
    time.match(
      /^(\d{1,2})\.(\d{2})(?::(\d{2}))?$/
    );

  if (dotMatch) {

    const hour =
      parseInt(
        dotMatch[1],
        10
      );

    const minute =
      parseInt(
        dotMatch[2],
        10
      );

    if (
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return '';
    }

    return (
      ('0' + hour).slice(-2) +
      ':' +
      ('0' + minute).slice(-2)
    );
  }

  const match =
    time.match(
      /^(\d{1,2}):(\d{2})(?::\d{2})?$/
    );

  if (match) {

    const hour =
      parseInt(
        match[1],
        10
      );

    const minute =
      parseInt(
        match[2],
        10
      );

    if (
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return '';
    }

    return (
      ('0' + hour).slice(-2) +
      ':' +
      ('0' + minute).slice(-2)
    );
  }

  return '';
}


// =========================================================
// EVENT RUNNING TEXT
// =========================================================

function getEventRunningText() {

  const ss =
    getSpreadsheet();

  const sheet =
    ss.getSheetByName(
      'panels'
    );

  if (!sheet) {
    return '';
  }

  // =========================================================
  // SUMBER EVENT RUNNING TEXT
  // panels!B35:B39
  //
  // B35 = Event 1
  // B36 = Event 2
  // B37 = Event 3
  // B38 = Event 4
  // B39 = Event 5
  //
  // Baris kosong otomatis dilewati.
  // Urutan mengikuti B33 -> B37.
  // =========================================================

  const values =
    sheet
      .getRange('B35:B39')
      .getDisplayValues();

  const result = [];

  values.forEach(
    function(row) {

      const value =
        row[0]
          ? row[0]
              .toString()
              .trim()
          : '';

      if (!value) {
        return;
      }

      result.push(value);
    }
  );

  return result.join(
    ' • '
  );
}

// =========================================================
// TEST AUDIO ADZAN
// =========================================================

function testSpreadsheetKeyAudio() {

  Logger.log(
    '===================================='
  );

  Logger.log(
    'TEST SPREADSHEET & ADZAN'
  );

  Logger.log(
    '===================================='
  );

  const spreadsheetId =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'SPREADSHEET_ID'
      );

  Logger.log(
    'SPREADSHEET_ID = [' +
    spreadsheetId +
    ']'
  );

  if (!spreadsheetId) {

    Logger.log(
      'ERROR: SPREADSHEET_ID tidak ditemukan di Script Properties.'
    );

    return;
  }

  const ss =
    SpreadsheetApp
      .openById(
        spreadsheetId
      );

  Logger.log(
    'Spreadsheet Name = [' +
    ss.getName() +
    ']'
  );

  Logger.log(
    'Spreadsheet ID   = [' +
    ss.getId() +
    ']'
  );

  const sheets =
    ss.getSheets();

  Logger.log(
    '------------------------------------'
  );

  Logger.log(
    'DAFTAR SEMUA SHEET'
  );

  Logger.log(
    '------------------------------------'
  );

  for (
    let i = 0;
    i < sheets.length;
    i++
  ) {

    Logger.log(
      (i + 1) +
      '. [' +
      sheets[i].getName() +
      ']'
    );
  }

  Logger.log(
    '------------------------------------'
  );


  const sheet =
    ss.getSheetByName(
      'Adzan'
    );

  if (!sheet) {

    Logger.log(
      'ERROR: Sheet [Adzan] TIDAK DITEMUKAN.'
    );

    Logger.log(
      'Pastikan nama tab adalah persis: Adzan'
    );

    return;
  }

  Logger.log(
    'SUCCESS: Sheet [Adzan] ditemukan.'
  );


  const lastRow =
    sheet.getLastRow();

  if (lastRow < 1) {

    Logger.log(
      'Sheet Adzan kosong.'
    );

    return;
  }


  const values =
    sheet
      .getRange(
        1,
        1,
        lastRow,
        2
      )
      .getDisplayValues();


  Logger.log(
    '------------------------------------'
  );

  Logger.log(
    'ISI SHEET ADZAN'
  );

  Logger.log(
    '------------------------------------'
  );


  for (
    let i = 0;
    i < values.length;
    i++
  ) {

    const key =
      values[i][0]
        ? values[i][0]
            .toString()
            .trim()
        : '';

    const value =
      values[i][1]
        ? values[i][1]
            .toString()
            .trim()
        : '';

    Logger.log(
      'ROW ' +
      (i + 1) +
      ' | ' +
      key +
      ' -> [' +
      value +
      ']'
    );
  }


  Logger.log(
    '===================================='
  );

  Logger.log(
    'TEST SELESAI'
  );

  Logger.log(
    '===================================='
  );
}


function testAdzanSheet() {

  const ss =
    getSpreadsheet();

  const sheet =
    ss.getSheetByName(
      'Adzan'
    );

  Logger.log(
    '===================================='
  );

  Logger.log(
    'TEST SHEET ADZAN'
  );

  Logger.log(
    '===================================='
  );

  if (!sheet) {

    Logger.log(
      'ERROR: Sheet Adzan tidak ditemukan.'
    );

    return;
  }

  Logger.log(
    'Sheet ditemukan: [' +
    sheet.getName() +
    ']'
  );

  const lastRow =
    sheet.getLastRow();

  const lastColumn =
    sheet.getLastColumn();

  Logger.log(
    'Last Row    = ' +
    lastRow
  );

  Logger.log(
    'Last Column = ' +
    lastColumn
  );

  Logger.log(
    '------------------------------------'
  );

  Logger.log(
    'ISI SHEET ADZAN'
  );

  Logger.log(
    '------------------------------------'
  );

  const values =
    sheet
      .getRange(
        1,
        1,
        Math.max(
          lastRow,
          1
        ),
        Math.max(
          lastColumn,
          1
        )
      )
      .getDisplayValues();

  for (
    let r = 0;
    r < values.length;
    r++
  ) {

    Logger.log(
      'ROW ' +
      (r + 1) +
      ' = ' +
      JSON.stringify(
        values[r]
      )
    );

  }

  Logger.log(
    '===================================='
  );

  Logger.log(
    'TEST SELESAI'
  );

  Logger.log(
    '===================================='
  );
}


// ============================================================
// API INDONESIA - SUMBER TANGGAL HIJRIAH
// ============================================================
//
// Sumber:
//   https://use.apiindonesia.id/api/v1/hijriah/konversi
//
// Acuan API:
//   Kalender Hijriah Indonesia (Kemenag, hisab MABIMS)
//
// API key WAJIB disimpan di Script Properties:
//   API_INDONESIA_KEY = aip_live_xxxxxxxxx
//
// Tanggal selalu dibuat berdasarkan Asia/Makassar (WITA).
// Hasil disimpan sementara di CacheService agar tidak melakukan
// request API berulang-ulang dalam waktu singkat.
// ============================================================

const HIJRI_API_BASE_URL =
  'https://use.apiindonesia.id/api/v1/hijriah';

const HIJRI_API_KEY_PROPERTY =
  'API_INDONESIA_KEY';

const HIJRI_TIMEZONE =
  'Asia/Makassar';

const HIJRI_CACHE_SECONDS =
  21600; // 6 jam


// ============================================================
// KONVERSI TANGGAL MASEHI -> HIJRIAH
// ============================================================

function getHijriDateFromApi(
  dateString
) {

  try {

    if (!dateString) {
      return {
        success: false,
        found: false,
        hijri: '',
        date: '',
        source: 'API Indonesia',
        error: 'Tanggal Masehi tidak diberikan.'
      };
    }

    const normalizedDate =
      String(dateString)
        .trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      return {
        success: false,
        found: false,
        hijri: '',
        date: normalizedDate,
        source: 'API Indonesia',
        error: 'Format tanggal harus YYYY-MM-DD.'
      };
    }

    // --------------------------------------------------------
    // API KEY
    // --------------------------------------------------------

    const apiKey = String(
      PropertiesService
        .getScriptProperties()
        .getProperty(HIJRI_API_KEY_PROPERTY) || ''
    ).trim();

    if (!apiKey) {
      return {
        success: false,
        found: false,
        hijri: '',
        date: normalizedDate,
        source: 'API Indonesia',
        error:
          'Script Property ' +
          HIJRI_API_KEY_PROPERTY +
          ' belum diisi.'
      };
    }

    // --------------------------------------------------------
    // CACHE
    // --------------------------------------------------------

    const cache =
      CacheService.getScriptCache();

    const cacheKey =
      'HIJRI_API_' +
      normalizedDate.replace(/-/g, '');

    const cached =
      cache.get(cacheKey);

    if (cached) {
      try {
        const cachedResult =
          JSON.parse(cached);

        if (
          cachedResult &&
          cachedResult.success === true &&
          cachedResult.hijri
        ) {
          cachedResult.cached = true;
          return cachedResult;
        }
      } catch (cacheError) {
        console.warn(
          'HIJRI API CACHE INVALID:',
          cacheError
        );
      }
    }

    // --------------------------------------------------------
    // CACHE PERMANEN GITHUB: kalender tahunan, lalu tanggal spesifik
    // --------------------------------------------------------
    const year = normalizedDate.slice(0, 4);
    let hijriDoc = null;
    let yearEntry = null;
    try {
      hijriDoc = readGithubJsonFile_("data/hijri-calendar-cache.json");
      if (hijriDoc && hijriDoc.years && hijriDoc.years[year]) {
        yearEntry = hijriDoc.years[year];
      }
    } catch (githubHijriReadError) {
      console.warn("CACHE HIJRIAH GITHUB TIDAK DAPAT DIBACA:", githubHijriReadError);
    }

    function formatHijriCalendarRow_(row) {
      if (!row) return "";
      if (row.hijri_formatted) return String(row.hijri_formatted).trim();
      const day = row.hijri_day;
      const monthName = String(row.hijri_month_name || "").trim();
      const hijriYear = row.hijri_year;
      return day && monthName && hijriYear ? String(day) + " " + monthName + " " + String(hijriYear) + " H" : "";
    }

    if (yearEntry && yearEntry.days && yearEntry.days[normalizedDate]) {
      const savedRow = yearEntry.days[normalizedDate];
      const savedHijri = formatHijriCalendarRow_(savedRow);
      if (savedHijri) {
        const savedResult = {
          success: true, found: true, date: normalizedDate, hijri: savedHijri,
          source: "API Indonesia / GitHub cache", cached: true
        };
        try { cache.put(cacheKey, JSON.stringify(savedResult), HIJRI_CACHE_SECONDS); } catch (ignoreHijriCache) {}
        return savedResult;
      }
    }

    // Jika tahun belum ada di GitHub, ambil kalender satu tahun penuh satu kali.
    if (!yearEntry || !yearEntry.days || !Object.keys(yearEntry.days).length) {
      const annualUrl = HIJRI_API_BASE_URL + "/kalender?tahun=" + encodeURIComponent(year);
      const annualResponse = UrlFetchApp.fetch(annualUrl, {
        method: "get", muteHttpExceptions: true,
        headers: { "x-api-key": apiKey, "Accept": "application/json" }
      });
      if (annualResponse.getResponseCode() >= 200 && annualResponse.getResponseCode() < 300) {
        let annualPayload = null;
        try { annualPayload = JSON.parse(annualResponse.getContentText() || "{}"); } catch (ignoreAnnualJson) {}
        const annualRows = annualPayload && Array.isArray(annualPayload.data) ? annualPayload.data : [];
        const annualDays = {};
        annualRows.forEach(function(row) {
          const rowDate = String(row.gregorian_date || row.date || "").trim();
          if (/^\\d{4}-\\d{2}-\\d{2}$/.test(rowDate) && rowDate.slice(0, 4) === year) {
            annualDays[rowDate] = {
              gregorian_date: rowDate,
              hijri_day: row.hijri_day,
              hijri_month_name: String(row.hijri_month_name || ""),
              hijri_year: row.hijri_year,
              hijri_formatted: formatHijriCalendarRow_(row)
            };
          }
        });
        if (Object.keys(annualDays).length) {
          hijriDoc = hijriDoc && hijriDoc.years && typeof hijriDoc.years === "object"
            ? hijriDoc : { success: true, source: "API Indonesia / Kalender Hijriah Kemenag", years: {} };
          hijriDoc.years[year] = {
            year: Number(year), source: "API Indonesia / Kalender Hijriah Kemenag",
            updatedAt: new Date().toISOString(), dayCount: Object.keys(annualDays).length,
            days: annualDays
          };
          hijriDoc.success = true;
          hijriDoc.source = "API Indonesia / Kalender Hijriah Kemenag";
          hijriDoc.generatedAt = new Date().toISOString();
          hijriDoc.updatedAt = hijriDoc.generatedAt;
          hijriDoc.yearCount = Object.keys(hijriDoc.years).length;
          writeGithubJsonFile_("data/hijri-calendar-cache.json", hijriDoc,
            "Cache kalender Hijriah tahunan " + year + " dari API Indonesia");
          const annualRow = annualDays[normalizedDate];
          const annualHijri = formatHijriCalendarRow_(annualRow);
          if (annualHijri) {
            const annualResult = {
              success: true, found: true, date: normalizedDate, hijri: annualHijri,
              source: "API Indonesia / GitHub cache", cached: false
            };
            try { cache.put(cacheKey, JSON.stringify(annualResult), HIJRI_CACHE_SECONDS); } catch (ignoreAnnualCache) {}
            Logger.log("KALENDER HIJRIAH TAHUNAN DISIMPAN KE GITHUB: " + year +
              " (" + Object.keys(annualDays).length + " tanggal).");
            return annualResult;
          }
        }
      }
      // Bila endpoint kalender tahunan belum menyediakan tahun ini, lanjutkan ke endpoint konversi harian.
    }

    // --------------------------------------------------------
    // REQUEST API HARIAN (fallback jika endpoint kalender tahunan tidak tersedia)
    // --------------------------------------------------------

    const url =
      HIJRI_API_BASE_URL +
      '/konversi?tanggal=' +
      encodeURIComponent(normalizedDate);

    const response =
      UrlFetchApp.fetch(
        url,
        {
          method: 'get',
          headers: {
            'x-api-key': apiKey
          },
          muteHttpExceptions: true
        }
      );

    const httpCode =
      response.getResponseCode();

    const body =
      response.getContentText();

    let json = null;

    try {
      json = JSON.parse(body);
    } catch (parseError) {
      json = null;
    }

    if (
      httpCode < 200 ||
      httpCode >= 300
    ) {
      return {
        success: false,
        found: false,
        hijri: '',
        date: normalizedDate,
        source: 'API Indonesia',
        httpCode: httpCode,
        error:
          json && json.error
            ? JSON.stringify(json.error)
            : 'API Indonesia HTTP ' + httpCode
      };
    }

    const data =
      json && json.data
        ? json.data
        : null;

    const hijriFormatted =
      data && data.hijri_formatted
        ? String(data.hijri_formatted).trim()
        : '';
    const returnedGregorianDate =
      data && (data.gregorian_date || data.date)
        ? String(data.gregorian_date || data.date).trim()
        : '';

    if (returnedGregorianDate && returnedGregorianDate !== normalizedDate) {
      return {
        success: false,
        found: false,
        hijri: '',
        date: normalizedDate,
        source: 'API Indonesia',
        httpCode: httpCode,
        error: 'Tanggal respons kalender Hijriah tidak cocok: diminta ' +
          normalizedDate + ', diterima ' + returnedGregorianDate + '.'
      };
    }

    if (!hijriFormatted) {
      return {
        success: false,
        found: false,
        hijri: '',
        date: normalizedDate,
        source: 'API Indonesia',
        httpCode: httpCode,
        error:
          'Respons API tidak memiliki data.hijri_formatted.'
      };
    }

    const result = {
      success: true,
      found: true,
      date:
        returnedGregorianDate ||
        normalizedDate,
      hijri: hijriFormatted,
      source: 'API Indonesia',
      httpCode: httpCode,
      disclaimer:
        json && json.meta && json.meta.disclaimer
          ? String(json.meta.disclaimer)
          : ''
    };

    try {
      cache.put(
        cacheKey,
        JSON.stringify(result),
        HIJRI_CACHE_SECONDS
      );
    } catch (cacheWriteError) {
      console.warn(
        'HIJRI API CACHE WRITE ERROR:',
        cacheWriteError
      );
    }

    return result;

  } catch (error) {

    console.error(
      'getHijriDateFromApi:',
      error
    );

    return {
      success: false,
      found: false,
      hijri: '',
      source: 'API Indonesia',
      error:
        String(
          error && error.message
            ? error.message
            : error
        )
    };
  }
}


// ============================================================
// FUNGSI PUBLIK UNTUK INDEX.HTML
// ============================================================
// Nama fungsi dipertahankan agar perubahan frontend minimal.
// ============================================================



// ============================================================
// TEST KALENDER HIJRIAH
// ============================================================
//
// Test selalu menggunakan tanggal saat ini dalam WITA,
// bukan timezone kalender Google.
// ============================================================




// Kompatibilitas nama fungsi test lama.


// ============================================================
// DIAGNOSTIK RAW SHEET ADZAN - PEMERIKSAAN BLOK AUDIO
// ============================================================
// Tujuan:
// - Membaca langsung kolom D:AA dari Spreadsheet runtime.
// - Memastikan posisi EVENT / DETIK / STATUS benar-benar terbaca.
// - Tidak mengubah konfigurasi, sequence, audio, atau data Sheet.
// - Dipakai untuk mencari penyebab AudioSchedule harian kosong.
// ============================================================
function DIAGNOSTIK_RAW_AUDIO_SHEET() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Adzan');

  Logger.log('======================================');
  Logger.log('DIAGNOSTIK RAW SHEET ADZAN - FORMAT FINAL');
  Logger.log('======================================');

  if (!sheet) {
    Logger.log('ERROR: Sheet Adzan tidak ditemukan.');
    return;
  }

  const lastRow = Math.max(sheet.getLastRow(), 1);
  const lastColumn = Math.max(sheet.getLastColumn(), 26);
  const values = sheet
    .getRange(1, 1, lastRow, lastColumn)
    .getDisplayValues();

  const blocks = [
    ['E:F SUBUH RAMADHAN', 4, 5],
    ['H:I SUBUH BIASA', 7, 8],
    ['J:K DZUHUR', 9, 10],
    ['M:N ASHAR', 12, 13],
    ['P:Q MAGRIB RAMADHAN', 15, 16],
    ['S:T MAGRIB BIASA', 18, 19],
    ['V:W ISYA', 21, 22],
    ["Y:Z JUM'AT", 24, 25]
  ];

  blocks.forEach(function(block) {
    Logger.log('--- ' + block[0] + ' ---');
    for (let r = 0; r < values.length; r++) {
      const event = String(values[r][block[1]] == null ? '' : values[r][block[1]]).trim();
      const status = String(values[r][block[2]] == null ? '' : values[r][block[2]]).trim();
      if (event || status) {
        Logger.log(
          'ROW ' + (r + 1) +
          ' | EVENT=[' + event + ']' +
          ' | STATUS=[' + status + ']'
        );
      }
    }
  });

  const rawData = sheet
    .getRange(1, 1, lastRow, Math.max(lastColumn, 26))
    .getValues();

  const parsed = parseAdzanSheetV7(rawData);

  Logger.log('======================================');
  Logger.log('HASIL PARSER FORMAT FINAL');
  Logger.log('======================================');
  Object.keys(parsed.schedule).forEach(function(name) {
    Logger.log(name + ' = ' + JSON.stringify(parsed.schedule[name]));
  });
  Logger.log("JUM'AT = " + JSON.stringify(parsed.friday));
  Logger.log('======================================');
  Logger.log('DIAGNOSTIK SELESAI');
  Logger.log('======================================');

  return {
    success: true,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    sheetName: sheet.getName(),
    lastRow: lastRow,
    lastColumn: lastColumn,
    parsed: parsed
  };
}

// ============================================================
// TEST AUDIO SHEET - VERIFIKASI MAPPING PER SHOLAT
// ============================================================
function TEST_AUDIO_SHEET_CONFIG() {
  const result = getRealtimeAudioConfig();

  Logger.log('======================================');
  Logger.log('TEST AUDIO SHEET CONFIG');
  Logger.log('======================================');

  if (!result || !result.success) {
    Logger.log('GAGAL: ' + JSON.stringify(result));
    return result;
  }

  const names = [
    'SUBUH_RAMADHAN',
    'SUBUH_BIASA',
    'DZUHUR',
    'ASHAR',
    'MAGHRIB_RAMADHAN',
    'MAGHRIB_BIASA',
    'ISYA'
  ];

  names.forEach(function(name) {
    Logger.log(
      name + ' = ' +
      JSON.stringify(result.AudioSchedule[name] || [])
    );
  });

  Logger.log(
    "JUM'AT = " +
    JSON.stringify(result.AudioFriday || [])
  );

  return result;
}

// ============================================================
// FORM KEGIATAN MASJID - PANELS!C28
// ============================================================
// C28 = dropdown JENIS KEGIATAN.
// B29:B32 = label field.
// C29:C32 = data kegiatan.
// ============================================================

const PANEL_KEGIATAN_OPTIONS_ = [
  "SHOLAT JUM'AT",
  "SHOLAT TARAWIH",
  "SHOLAT IDUL FITRI",
  "SHOLAT IDUL ADHA"
];

const PANEL_KEGIATAN_FIELDS_ = {
  "SHOLAT JUM'AT": ["Tanggal", "Khatib", "Imam", "Bilal"],
  "SHOLAT TARAWIH": ["Tanggal", "Imam", "Bilal", "Kultum"],
  "SHOLAT IDUL FITRI": ["Tanggal", "Khatib", "Imam", "Bilal"],
  "SHOLAT IDUL ADHA": ["Tanggal", "Khatib", "Imam", "Bilal"]
};

/**
 * Jalankan sekali dari Apps Script Editor untuk memasang
 * dropdown panels!C28 dan struktur field kegiatan.
 *
 * Aturan tanggal:
 * - SHOLAT JUM'AT  : otomatis Jumat pada minggu berjalan.
 * - TARAWIH        : manual.
 * - IDUL FITRI     : manual.
 * - IDUL ADHA      : manual.
 */
function setupPanelKegiatan() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("panels");

  if (!sheet) {
    throw new Error("Sheet panels tidak ditemukan.");
  }

  const selector = sheet.getRange("C28");

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(PANEL_KEGIATAN_OPTIONS_, true)
    .setAllowInvalid(false)
    .build();

  selector.setDataValidation(rule);

  if (!String(selector.getDisplayValue() || "").trim()) {
    selector.setValue(PANEL_KEGIATAN_OPTIONS_[0]);
  }

  formatPanelKegiatanSelector_(selector);
  updatePanelKegiatanFields_(sheet, selector.getDisplayValue(), true);

  Logger.log("FORM KEGIATAN PANELS!C28 berhasil disiapkan.");
}

/**
 * Trigger saat panels!C28 diubah.
 * onEdit memang dipanggil ketika pengguna mengubah nilai sel di Sheets.
 */
/**
 * Memperbarui sheet "daftar-kota" dari API Indonesia dan memasang dropdown panels!C5.
 * Kolom: Kota/Kabupaten | Provinsi | ID API | Zona | Timezone | GMT | Slug Kota
 * Jalankan refreshDaftarKotaAPIIndonesia() secara manual saat pertama kali.
 */
function refreshDaftarKotaAPIIndonesia() {
  const apiKey = String(PropertiesService.getScriptProperties().getProperty("API_INDONESIA_KEY") || "").trim();
  if (!apiKey) throw new Error("Script Property API_INDONESIA_KEY belum diisi.");

  const response = UrlFetchApp.fetch("https://use.apiindonesia.id/api/v1/sholat/list-kota", {
    method: "get",
    muteHttpExceptions: true,
    headers: { "x-api-key": apiKey, "Accept": "application/json" }
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error("Gagal mengambil daftar kota dari API Indonesia. HTTP " + response.getResponseCode());
  }
  const payload = JSON.parse(response.getContentText() || "{}");
  const cities = payload && Array.isArray(payload.data) ? payload.data : [];
  if (!cities.length) throw new Error("API Indonesia tidak mengembalikan daftar kota.");

  const ss = getSpreadsheet();
  let listSheet = ss.getSheetByName("daftar-kota");
  if (!listSheet) listSheet = ss.insertSheet("daftar-kota");

  const headers = ["Kota/Kabupaten", "Provinsi", "ID API", "Zona", "Timezone", "GMT", "Slug Kota"];
  const rows = cities.map(function(city) {
    const cityName = titleCaseLocation_(city.regency_name || city.name || "");
    const provinceName = titleCaseLocation_(city.province_name || "");
    const regencyId = String(city.regency_id || city.id || "").trim();
    const zoneInfo = getIndonesianTimezoneByProvince_(provinceName);
    const slug = normalizePrayerCitySlug_(cityName);
    return [cityName, provinceName, regencyId, zoneInfo.zona, zoneInfo.timezone, zoneInfo.gmt, slug];
  }).filter(function(row) { return row[0] && row[1] && row[2]; });

  if (!rows.length) throw new Error("Daftar kota API Indonesia tidak memiliki data yang valid.");
  rows.sort(function(a, b) { return a[0].localeCompare(b[0], "id"); });

  listSheet.clearContents();
  listSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  listSheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  listSheet.setFrozenRows(1);
  listSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  listSheet.autoResizeColumns(1, headers.length);

  const panels = ss.getSheetByName("panels");
  if (!panels) throw new Error('Sheet "panels" tidak ditemukan.');
  const validationRange = listSheet.getRange(2, 1, rows.length, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(validationRange, true)
    .setAllowInvalid(false)
    .build();
  panels.getRange("C5").setDataValidation(rule);

  const currentCity = String(panels.getRange("C5").getDisplayValue() || "").trim();
  if (currentCity) {
    let selected = rows.filter(function(row) {
      return normalizePrayerDropdownName_(row[0]) === normalizePrayerDropdownName_(currentCity);
    });
    if (!selected.length) {
      selected = rows.filter(function(row) {
        return normalizePrayerLocationName_(row[0]) === normalizePrayerLocationName_(currentCity);
      });
    }
    // Migrasi otomatis nilai C5 lama seperti "Balikpapan" ke label dropdown "Kota Balikpapan"
    // hanya jika hasilnya tunggal; nama ambigu tidak ditebak.
    if (selected.length === 1) {
      panels.getRange("C5").setValue(selected[0][0]);
      syncPrayerPanelLocationFromCity_(selected[0][0], false);
    }
  }

  PropertiesService.getScriptProperties().setProperty("APIID_CITY_LIST_UPDATED_AT", new Date().toISOString());
  try {
    publishCityListToGithub_(rows);
  } catch (githubError) {
    Logger.log("PUBLIKASI DAFTAR KOTA KE GITHUB GAGAL (sheet tetap diperbarui): " +
      (githubError && githubError.message ? githubError.message : githubError));
  }
  Logger.log("DAFTAR KOTA DIPERBARUI: " + rows.length + " kota/kabupaten pada sheet daftar-kota.");
  return { success: true, count: rows.length, sheet: "daftar-kota" };
}

/**
 * Setup awal otomatisasi data lokasi dan jadwal sholat.
 * Zona waktu proyek sebaiknya Asia/Makassar.
 * Pemicu:
 * - daftar kota: harian sekitar pukul 03.00 WITA
 * - cache jadwal kota aktif: harian sekitar 00.05 WITA dan pemeriksaan tiap 30 menit
 * Jalankan sekali dari Apps Script Editor dan selesaikan otorisasi.
 */
function setupDropdownKotaAPIIndonesia() {
  const result = refreshDaftarKotaAPIIndonesia();
  const handlers = [
    "refreshDaftarKotaAPIIndonesia",
    "refreshPrayerCacheForCurrentCity"
  ];
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (handlers.indexOf(trigger.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("refreshDaftarKotaAPIIndonesia")
    .timeBased()
    .atHour(3)
    .everyDays(1)
    .inTimezone("Asia/Makassar")
    .create();

  ScriptApp.newTrigger("refreshPrayerCacheForCurrentCity")
    .timeBased()
    .atHour(0)
    .nearMinute(5)
    .everyDays(1)
    .inTimezone("Asia/Makassar")
    .create();

  ScriptApp.newTrigger("refreshPrayerCacheForCurrentCity")
    .timeBased()
    .everyMinutes(30)
    .create();

  Logger.log("Auto-update disiapkan: daftar kota harian 03.00 WITA; cache jadwal 00.05 WITA dan pemeriksaan tiap 30 menit.");
  return result;
}

/**
 * Publikasikan daftar kota yang sudah divalidasi ke data/daftar-kota.json di branch main.
 * Gagal menulis GitHub tidak membatalkan pembaruan sheet daftar-kota.
 */
function publishCityListToGithub_(rows) {
  const cities = (rows || []).map(function(row) {
    return {
      name: String(row[0] || ""),
      province: String(row[1] || ""),
      regency_id: String(row[2] || ""),
      zone: String(row[3] || ""),
      timezone: String(row[4] || ""),
      gmt: String(row[5] || ""),
      slug: String(row[6] || "")
    };
  });
  const existing = readGithubJsonFile_("data/daftar-kota.json");
  if (existing && Array.isArray(existing.cities) &&
      JSON.stringify(existing.cities) === JSON.stringify(cities)) {
    Logger.log("GitHub daftar-kota.json tidak berubah; commit dilewati.");
    return { success: true, changed: false, count: cities.length };
  }
  const now = new Date().toISOString();
  const document = {
    success: true,
    version: 1,
    generatedAt: now,
    source: "API Indonesia /api/v1/sholat/list-kota",
    cityCount: cities.length,
    cities: cities
  };
  writeGithubJsonFile_("data/daftar-kota.json", document, "Auto-update daftar kota dari API Indonesia");
  PropertiesService.getScriptProperties().setProperty("GITHUB_CITY_LIST_UPDATED_AT", now);
  Logger.log("GitHub data/daftar-kota.json diperbarui: " + cities.length + " wilayah.");
  return { success: true, changed: true, count: cities.length };
}

/**
 * Uji baca jadwal sholat untuk tanggal dan kota aktif.
 * Aman: hanya membaca Spreadsheet/API dan menulis hasil ke log; tidak mengubah cache,
 * tidak membuat trigger, dan tidak mengubah scheduler audio.
 */
function TEST_JADWAL_AMAN() {
  const ss = getSpreadsheet();
  const panels = ss.getSheetByName("panels");
  if (!panels) throw new Error('Sheet "panels" tidak ditemukan.');

  const loc = panels.getRange("C5:C10").getDisplayValues().map(function(row) {
    return String(row[0] || "").trim();
  });
  const city = loc[0];
  const province = loc[1];
  const timezone = loc[3] || "Asia/Makassar";
  if (!city) throw new Error("Kota pada panels!C5 kosong.");

  const date = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");
  const result = getPrayerSchedule(date);
  const report = {
    tanggalUji: date,
    kotaSheet: city,
    provinsiSheet: province,
    timezoneSheet: timezone,
    hasilJadwal: result
  };

  Logger.log("TEST_JADWAL_AMAN: " + JSON.stringify(report));
  if (!result || result.success !== true) {
    throw new Error("Uji jadwal gagal: " +
      String(result && (result.error || result.apiIndonesiaError || result.fallbackReason) || "respons tidak sukses"));
  }
  if (String(result.tanggal || "") !== date) {
    throw new Error("Tanggal respons tidak cocok. Diminta " + date +
      ", diterima " + String(result.tanggal || "(kosong)") + ".");
  }
  if (!result.jadwal || !isCompletePrayerScheduleSafe_(result.jadwal)) {
    throw new Error("Jadwal tidak lengkap untuk " + city + " tanggal " + date + ".");
  }
  Logger.log("TEST_JADWAL_AMAN LULUS: " + city + " " + date);
  return report;
}

/**
 * Memperbarui cache GitHub untuk kota yang sedang dipilih pada panels!C5.
 * Hanya menyimpan respons sukses, lengkap, untuk kota dan tanggal yang tepat.
 * Tidak pernah mengganti jadwal dengan data kota lain.
 */
function refreshPrayerCacheForCurrentCity() {
  const ss = getSpreadsheet();
  const panels = ss.getSheetByName("panels");
  if (!panels) throw new Error('Sheet "panels" tidak ditemukan.');

  const loc = panels.getRange("C5:C10").getDisplayValues().map(function(row) {
    return String(row[0] || "").trim();
  });
  const city = loc[0];
  const province = loc[1];
  const timezone = loc[3] || "Asia/Makassar";
  const slug = loc[5] || normalizePrayerCitySlug_(city);
  if (!city || !slug) throw new Error("Kota atau slug pada panels!C5/C10 kosong.");

  const date = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");
  const schedule = getPrayerSchedule(date);
  if (!schedule || schedule.success !== true ||
      String(schedule.tanggal || "") !== date ||
      !schedule.jadwal || !isCompletePrayerScheduleSafe_(schedule.jadwal)) {
    const reason = schedule && (schedule.error || schedule.apiIndonesiaError || schedule.fallbackReason);
    Logger.log("CACHE JADWAL TIDAK DIPUBLIKASIKAN; respons belum valid untuk " + city + " " + date +
      (reason ? ": " + reason : ""));
    return { success: false, skipped: true, kota: city, tanggal: date, error: reason || "Jadwal belum lengkap." };
  }

  const existing = readGithubJsonFile_("data/prayer-cache.json") || {
    success: true, cityCount: 0, cities: {}
  };
  if (!existing.cities || typeof existing.cities !== "object" || Array.isArray(existing.cities)) {
    existing.cities = {};
  }

  const entry = {
    success: true,
    tanggal: date,
    kota: city,
    provinsi: province,
    slug: slug,
    zona: schedule.zona || loc[2] || "",
    timezone: schedule.timezone || timezone,
    gmt: schedule.gmt || loc[4] || "",
    source: schedule.source || "API Indonesia / Kemenag",
    jadwal: {
      subuh: String(schedule.jadwal.subuh || ""),
      terbit: String(schedule.jadwal.terbit || ""),
      dzuhur: String(schedule.jadwal.dzuhur || ""),
      ashar: String(schedule.jadwal.ashar || ""),
      maghrib: String(schedule.jadwal.maghrib || ""),
      isya: String(schedule.jadwal.isya || "")
    },
    generatedAt: new Date().toISOString()
  };

  const prior = existing.cities[slug];
  const sameSchedule = prior && prior.success === true &&
    prior.tanggal === entry.tanggal &&
    prior.kota === entry.kota &&
    prior.provinsi === entry.provinsi &&
    JSON.stringify(prior.jadwal) === JSON.stringify(entry.jadwal) &&
    prior.timezone === entry.timezone &&
    prior.source === entry.source;
  if (sameSchedule) {
    Logger.log("CACHE JADWAL GITHUB SUDAH TERBARU: " + city + " " + date + "; commit dilewati.");
    return { success: true, changed: false, kota: city, tanggal: date, slug: slug };
  }

  existing.cities[slug] = entry;
  existing.success = true;
  existing.generatedAt = new Date().toISOString();
  existing.updatedAt = existing.generatedAt;
  existing.cityCount = Object.keys(existing.cities).length;
  writeGithubJsonFile_("data/prayer-cache.json", existing,
    "Auto-update cache jadwal sholat " + city + " " + date);
  PropertiesService.getScriptProperties().setProperty("GITHUB_PRAYER_CACHE_UPDATED_AT", existing.updatedAt);
  Logger.log("CACHE JADWAL GITHUB DIPERBARUI: " + city + " " + date + " (" + slug + ").");
  return { success: true, changed: true, kota: city, tanggal: date, slug: slug };
}


/**
 * Pemicu installable saat panels!C5 berubah.
 * Menyelaraskan metadata lokasi dahulu, lalu memperbarui cache jadwal GitHub.
 * Terpisah dari onEdit(e) agar tidak mengubah alur panel atau scheduler audio.
 */
function handlePrayerCacheCityEdit_(e) {
  if (!e || !e.range) return;
  const range = e.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== "panels" || range.getA1Notation() !== "C5") return;

  try {
    syncPrayerPanelLocationFromCity_(range.getDisplayValue(), false);
    runPrayerCacheAutoRefresh_("pergantian kota");
  } catch (error) {
    Logger.log("AUTO CACHE JADWAL SAAT KOTA BERUBAH GAGAL: " +
      (error && error.stack ? error.stack : error));
    throw error;
  }
}

/**
 * Pemicu berkala untuk menangani pergantian tanggal lokal dan menjaga cache
 * tetap baru meski kota tidak berubah. Tidak membuat commit jika data sama.
 */
function autoRefreshPrayerCachePeriodic_() {
  runPrayerCacheAutoRefresh_("pemeriksaan berkala");
}

/** Menjalankan pembaruan dengan lock agar edit kota dan pemicu berkala tidak bertabrakan. */
function runPrayerCacheAutoRefresh_(reason) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log("AUTO CACHE JADWAL DILEWATI: proses lain masih berjalan (" + reason + ").");
    return { success: false, skipped: true, reason: "lock_busy" };
  }
  try {
    const result = refreshPrayerCacheForCurrentCity();
    Logger.log("AUTO CACHE JADWAL (" + reason + "): " + JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Jalankan SATU KALI secara manual setelah kode ini tersedia di Apps Script.
 * Memasang pemicu edit khusus untuk panels!C5 dan pemeriksaan berkala 6 jam.
 * Hanya mengganti pemicu milik fitur cache ini; pemicu audio dan pemicu lain
 * tidak dihapus atau diubah.
 */
function setupPrayerCacheAutoTriggers() {
  const handlers = ["handlePrayerCacheCityEdit_", "autoRefreshPrayerCachePeriodic_"];
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (handlers.indexOf(trigger.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID belum diisi pada Script Properties.");
  }

  ScriptApp.newTrigger("handlePrayerCacheCityEdit_")
    .forSpreadsheet(spreadsheetId)
    .onEdit()
    .create();

  ScriptApp.newTrigger("autoRefreshPrayerCachePeriodic_")
    .timeBased()
    .everyHours(6)
    .create();

  Logger.log("PEMICU CACHE JADWAL AKTIF: saat panels!C5 berubah dan pemeriksaan setiap 6 jam.");
}

/** Membaca JSON dari branch migration; null hanya jika file memang belum ada (HTTP 404). */
function readGithubJsonFile_(path) {
  const targetBranch = "migration-api-indonesia-20261014";
  const token = String(PropertiesService.getScriptProperties().getProperty("GITHUB_UPLOAD_TOKEN") || "").trim();
  if (!token) throw new Error("Script Property GITHUB_UPLOAD_TOKEN belum diisi.");
  const url = "https://api.github.com/repos/fonntemax-1/audio-masjid/contents/" +
    path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(targetBranch);
  const response = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (response.getResponseCode() === 404) return null;
  if (response.getResponseCode() !== 200) {
    throw new Error("Gagal membaca GitHub " + path + " (HTTP " + response.getResponseCode() + ").");
  }
  const file = JSON.parse(response.getContentText() || "{}");
  const raw = Utilities.base64Decode(String(file.content || "").replace(/\s/g, ""));
  return JSON.parse(Utilities.newBlob(raw).getDataAsString("UTF-8"));
}

/** Membuat atau memperbarui JSON di branch migration dengan token di Script Properties. */
function writeGithubJsonFile_(path, document, message) {
  const targetBranch = "migration-api-indonesia-20261014";
  const token = String(PropertiesService.getScriptProperties().getProperty("GITHUB_UPLOAD_TOKEN") || "").trim();
  if (!token) throw new Error("Script Property GITHUB_UPLOAD_TOKEN belum diisi.");
  const url = "https://api.github.com/repos/fonntemax-1/audio-masjid/contents/" +
    path.split("/").map(encodeURIComponent).join("/");
  const headers = {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  const getResponse = UrlFetchApp.fetch(url + "?ref=" + encodeURIComponent(targetBranch), {
    method: "get", muteHttpExceptions: true, headers: headers
  });
  let sha = "";
  if (getResponse.getResponseCode() === 200) {
    sha = String(JSON.parse(getResponse.getContentText() || "{}").sha || "");
  } else if (getResponse.getResponseCode() !== 404) {
    throw new Error("Gagal memeriksa GitHub " + path + " (HTTP " + getResponse.getResponseCode() + ").");
  }
  const content = JSON.stringify(document, null, 2) + "\n";
  const payload = {
    message: message,
    content: Utilities.base64Encode(Utilities.newBlob(content, "application/json").getBytes()),
    branch: targetBranch
  };
  if (sha) payload.sha = sha;
  const putResponse = UrlFetchApp.fetch(url, {
    method: "put",
    contentType: "application/json",
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const code = putResponse.getResponseCode();
  if (code < 200 || code >= 300) {
    let detail = "";
    try { detail = JSON.parse(putResponse.getContentText()).message || ""; } catch (ignore) {}
    throw new Error("GitHub gagal menyimpan " + path + " (HTTP " + code + ")" +
      (detail ? ": " + detail : "") + ".");
  }
  return { success: true, path: path };
}

function titleCaseLocation_(value) {
  return String(value || "").toLowerCase().replace(/\b([a-zà-ÿ])/g, function(letter) {
    return letter.toUpperCase();
  }).trim();
}

function normalizePrayerLocationName_(value) {
  return String(value || "").toUpperCase()
    .replace(/^(KOTA\s+ADM\.?\s*|KOTA\s+|KABUPATEN\s+|KABUP\.?\s+|KAB\.?\s+)/, "")
    .replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function normalizePrayerDropdownName_(value) {
  return String(value || "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function normalizePrayerCitySlug_(value) {
  return normalizePrayerLocationName_(value).toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Zona waktu ditentukan dari provinsi administratif, bukan tebakan koordinat. */
function getIndonesianTimezoneByProvince_(province) {
  const p = normalizePrayerLocationName_(province);
  const wit = [
    "MALUKU", "MALUKU UTARA", "PAPUA", "PAPUA BARAT", "PAPUA BARAT DAYA",
    "PAPUA TENGAH", "PAPUA PEGUNUNGAN", "PAPUA SELATAN"
  ];
  const wita = [
    "BALI", "NUSA TENGGARA BARAT", "NUSA TENGGARA TIMUR",
    "KALIMANTAN SELATAN", "KALIMANTAN TIMUR", "KALIMANTAN UTARA",
    "SULAWESI UTARA", "SULAWESI TENGAH", "SULAWESI SELATAN",
    "SULAWESI TENGGARA", "SULAWESI BARAT", "GORONTALO"
  ];
  if (wit.indexOf(p) >= 0) return { zona: "WIT", timezone: "Asia/Jayapura", gmt: "GMT+9" };
  if (wita.indexOf(p) >= 0) return { zona: "WITA", timezone: "Asia/Makassar", gmt: "GMT+8" };
  return { zona: "WIB", timezone: "Asia/Jakarta", gmt: "GMT+7" };
}

/** Mengisi panels!C6:C10 sesuai pilihan di panels!C5. */
function syncPrayerPanelLocationFromCity_(cityValue, showToast) {
  const ss = getSpreadsheet();
  const panels = ss.getSheetByName("panels");
  const listSheet = ss.getSheetByName("daftar-kota");
  if (!panels || !listSheet) throw new Error('Pastikan sheet "panels" dan "daftar-kota" tersedia.');

  const city = String(cityValue || "").trim();
  if (!city) return false;
  const lastRow = listSheet.getLastRow();
  if (lastRow < 2) throw new Error('Sheet "daftar-kota" belum berisi data. Jalankan refreshDaftarKotaAPIIndonesia().');

  const rows = listSheet.getRange(2, 1, lastRow - 1, 7).getDisplayValues();
  const wanted = normalizePrayerDropdownName_(city);
  const matches = rows.filter(function(row) {
    return normalizePrayerDropdownName_(row[0]) === wanted;
  });
  if (!matches.length) throw new Error('Kota "' + city + '" tidak ditemukan pada sheet daftar-kota.');
  if (matches.length > 1) throw new Error('Nama kota "' + city + '" tidak unik pada daftar-kota; pastikan label dropdown mencakup jenis wilayah.');

  const row = matches[0];
  // C6 Provinsi, C7 Zona, C8 Timezone, C9 GMT, C10 slug kota (metadata, bukan sumber jadwal).
  panels.getRange("C6:C10").setValues([[row[1]], [row[3]], [row[4]], [row[5]], [row[6]]]);
  if (showToast) ss.toast("Lokasi diperbarui: " + row[0] + " · " + row[1], "Daftar Kota", 3);
  return true;
}

function onEdit(e) {
  if (!e || !e.range) return;

  const range = e.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== "panels") return;

  if (range.getA1Notation() === "C3") {
    const mapsUrl = String(range.getDisplayValue() || "").trim();
    const panels = sheet;
    if (!mapsUrl) {
      panels.getRange("C4").clearContent();
      return;
    }
    try {
      const remotePin = String(PropertiesService.getScriptProperties().getProperty("REMOTE_CONTROL_PIN") || "").trim();
      if (!remotePin) throw new Error("Script Property REMOTE_CONTROL_PIN belum diisi.");
      const result = resolveGoogleMapsLinkCityFromApi_({ mapsUrl: mapsUrl, pin: remotePin });
      if (!result || result.success === false) throw new Error(result && result.error ? result.error : "Lokasi Google Maps gagal dikenali.");

      // C5 diisi oleh script saat C3 Google Maps diproses, sehingga onEdit(C5)
      // tidak berjalan. Panggil pembaruan cache secara eksplisit setelah lokasi selesai.
      const activeCity = String(panels.getRange("C5").getDisplayValue() || "").trim();
      if (activeCity) {
        try {
          const cacheResult = runPrayerCacheAutoRefresh_("lokasi Google Maps dari C3");
          Logger.log("CACHE JADWAL SETELAH GOOGLE MAPS: " + JSON.stringify(cacheResult));
        } catch (cacheError) {
          Logger.log("CACHE JADWAL SETELAH GOOGLE MAPS GAGAL: " +
            (cacheError && cacheError.stack ? cacheError.stack : cacheError));
          try {
            getSpreadsheet().toast(
              "Lokasi berhasil dikenali, tetapi cache jadwal gagal diperbarui. Periksa Executions.",
              "Cache Jadwal Sholat",
              8
            );
          } catch (ignoreCacheToast) {}
        }
      }

      try {
        getSpreadsheet().toast(
          "Lokasi dikenali: " + String(result.city || panels.getRange("C4").getDisplayValue()) +
          (result.nearestCity ? " · Acuan jadwal: " + result.nearestCity : " · Kota acuan belum cocok"),
          "Google Maps",
          6
        );
      } catch (ignoreToast) {}
    } catch (error) {
      Logger.log("RESOLVE GOOGLE MAPS DARI C3 GAGAL: " + (error && error.stack ? error.stack : error));
      try {
        getSpreadsheet().toast("Link Google Maps gagal diproses: " + (error && error.message ? error.message : error), "Google Maps", 8);
      } catch (ignoreToast) {}
    }
    return;
  }

  if (range.getA1Notation() === "C5") {
    try {
      syncPrayerPanelLocationFromCity_(range.getDisplayValue(), true);
    } catch (error) {
      Logger.log("UPDATE LOKASI DARI C5 GAGAL: " + (error && error.message ? error.message : error));
      try { getSpreadsheet().toast("Lokasi belum diperbarui. Periksa sheet daftar-kota.", "Daftar Kota", 5); } catch (ignoreToast) {}
    }
    return;
  }

  if (range.getA1Notation() !== "C28") return;
  formatPanelKegiatanSelector_(range);
  updatePanelKegiatanFields_(sheet, range.getDisplayValue(), false);
}

/**
 * Buat installable edit trigger untuk panels!C28.
 * Code.gs ini memakai SPREADSHEET_ID/openById(), sehingga simple
 * onEdit tidak cukup untuk spreadsheet yang tidak terikat langsung.
 * Jalankan fungsi ini SEKALI dari Apps Script Editor dan izinkan akses.
 */
function setupPanelKegiatanEditTrigger() {
  const spreadsheetId = PropertiesService
    .getScriptProperties()
    .getProperty("SPREADSHEET_ID");

  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID belum diisi pada Script Properties.");
  }

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "onEdit") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("onEdit")
    .forSpreadsheet(spreadsheetId)
    .onEdit()
    .create();

  Logger.log("TRIGGER PANEL KEGIATAN berhasil dibuat.");
}

/**
 * Warna C26 mengikuti jenis kegiatan yang dipilih.
 */
function formatPanelKegiatanSelector_(selector) {
  const key = String(selector.getDisplayValue() || "").trim().toUpperCase();

  const colors = {
    "SHOLAT JUM'AT": ["#b6d7a8", "#1b4332"],
    "SHOLAT TARAWIH": ["#d9d2e9", "#351c75"],
    "SHOLAT IDUL FITRI": ["#ffe599", "#7f6000"],
    "SHOLAT IDUL ADHA": ["#9fc5e8", "#073763"]
  };

  const color = colors[key] || ["#ffffff", "#000000"];

  selector
    .setBackground(color[0])
    .setFontColor(color[1])
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setWrap(false);
}

/**
 * Mengisi tanggal Jumat pada minggu berjalan.
 * Contoh jika hari ini Senin-Sabtu, yang dipilih adalah Jumat
 * pada minggu kalender yang sedang berjalan; jika hari ini Jumat,
 * tanggal hari ini yang digunakan.
 */

/**
 * Membentuk B29:B32 sesuai C28 dan mengatur C29:C32.
 *
 * resetValues=true dipakai saat setup awal.
 * Saat C28 berubah melalui onEdit, data lama selalu dibersihkan
 * agar Khatib/Imam/Muadzin/Bilal/Kultum tidak tertukar.
 */
function updatePanelKegiatanFields_(sheet, kegiatan, resetValues) {
  const key = String(kegiatan || "").trim().toUpperCase();
  const fields = PANEL_KEGIATAN_FIELDS_[key] || [];

  const labelRange = sheet.getRange("B29:B32");
  const valueRange = sheet.getRange("C29:C32");

  // Label B29:B32 berubah otomatis berdasarkan C28.
  // Menggunakan formula Sheet sehingga TIDAK membutuhkan onEdit trigger.
  const formulaRows = [
    ['=IF($C$28="SHOLAT JUM\'AT";"Tanggal";IF($C$28="SHOLAT TARAWIH";"Tanggal";IF($C$28="SHOLAT IDUL FITRI";"Tanggal";IF($C$28="SHOLAT IDUL ADHA";"Tanggal";""))))'],
    ['=IF($C$28="SHOLAT JUM\'AT";"Khatib";IF($C$28="SHOLAT TARAWIH";"Imam";IF($C$28="SHOLAT IDUL FITRI";"Khatib";IF($C$28="SHOLAT IDUL ADHA";"Khatib";""))))'],
    ['=IF($C$28="SHOLAT JUM\'AT";"Imam";IF($C$28="SHOLAT TARAWIH";"Bilal";IF($C$28="SHOLAT IDUL FITRI";"Imam";IF($C$28="SHOLAT IDUL ADHA";"Imam";""))))'],
    ['=IF($C$28="SHOLAT JUM\'AT";"Bilal";IF($C$28="SHOLAT TARAWIH";"Kultum";IF($C$28="SHOLAT IDUL FITRI";"Bilal";IF($C$28="SHOLAT IDUL ADHA";"Bilal";""))))']
  ];

  labelRange.setFormulas(formulaRows);

  // SEMUA data kegiatan, termasuk tanggal C29, MANUAL.
  // C29:C32 tidak diisi/dihapus ketika C28 berubah.
  valueRange.clearDataValidations();

  if (fields.length > 0 && fields[0] === "Tanggal") {
    valueRange.getCell(1, 1).setNumberFormat("dd/MM/yyyy");
  }
}
/**
 * Kompatibilitas nama fungsi lama.
 * Tidak lagi menggunakan formula Sheets/custom function.
 */

/**
 * API data kegiatan untuk GitHub Pages.
 *
 * Label selalu diambil dari konfigurasi PANEL_KEGIATAN_FIELDS_
 * sehingga tidak pernah bergantung pada formula/error di B27:B30.
 */
// =====================================================
// REALTIME DISPLAY CONFIG - konfigurasi ringan FRONT-END
// Tidak membaca scheduler/audio/jadwal sholat.
// =====================================================

function getRealtimeDisplayConfig() {
  try {
    const ss = getSpreadsheet();
    const panels = ss.getSheetByName('panels');
    if (!panels) return { success: false, error: 'Sheet panels tidak ditemukan.' };

    // Satu pembacaan blok untuk seluruh kontrol realtime.
    // Menghindari banyak getRange() terpisah yang membuat Apps Script lambat.
    const grid = panels.getRange('B2:G43').getDisplayValues();

    const cell = function(row, col) {
      return String((grid[row - 2] || [])[col - 2] || '').trim();
    };

    const location = [
      cell(5,3),
      cell(6,3),
      cell(7,3),
      cell(8,3),
      cell(9,3),
      cell(10,3)
    ];
    const c18 = cell(18,3);
    const youtube = cell(20,3);
    const youtubeStatusRaw = cell(20,6).toUpperCase();
    const c22Raw = cell(22,3).toUpperCase();
    const c2Raw = cell(2,3).toUpperCase();

    // Header di B12:C37.
    const header = {};
    for (let r = 12; r <= 37; r++) {
      const key = cell(r,2).toUpperCase();
      const value = cell(r,3);
      if (['NAMA','ALAMAT','KOTA','NO HP','SLOGAN','WEBSITE','INFO LAINNYA'].indexOf(key) >= 0) {
        header[key] = value;
      }
    }

    const kegiatan = [cell(29,3), cell(30,3), cell(31,3), cell(32,3)];
    const event = [];
    for (let r = 35; r <= 39; r++) {
      const value = cell(r,2);
      if (value) event.push(value);
    }

    const infaqModeRealtime = cell(41,3).toUpperCase() === 'AUTO' ? 'AUTO' : 'OFF';
    const infaqText1Realtime = cell(42,3);
    const infaqText2Realtime = cell(43,3);

    Logger.log(
      'REALTIME INFAQ C41/C42/C43 = [' +
      infaqModeRealtime + '] [' +
      infaqText1Realtime + '] [' +
      infaqText2Realtime + ']'
    );

    let theme = String(c18 || '').trim().toUpperCase();
    if (theme !== 'HIJAU' && theme !== 'MERAH' && theme !== 'KUNING') theme = 'KUNING';

    return {
      success: true,
      PanelMode: c2Raw === 'AUTO' ? 'AUTO' : 'OFF',
      Lokasi: {
        kota: location[0], provinsi: location[1], zona: location[2],
        timezone: location[3], gmt: location[4], slug: location[5]
      },
      DisplayTheme: theme,
      Youtube: youtube,
      YoutubeStatus: ['ON','OFF','AUTO','STOP'].indexOf(youtubeStatusRaw) >= 0 ? youtubeStatusRaw : 'AUTO',
      IqomahMode: c22Raw === 'AUTO' || c22Raw === 'OFF' ? c22Raw : 'OFF',
      // SINGLE MASJID MODE: seluruh identitas langsung dari Spreadsheet ORIGINAL.
      Nama: cell(12,3),
      Alamat: header.ALAMAT || '',
      Kota: header.KOTA || '',
      'No. Telp': header['NO HP'] || '',
      Slogan: header.SLOGAN || '',
      Website: header.WEBSITE || '',
      InfoLainnya: header['INFO LAINNYA'] || '',

      // INFAQ & SHADAQAH realtime: panels!C41:C43.
      // Dibaca dalam snapshot ringan yang sama agar perubahan C41/C42/C43
      // tetap tampil walaupun endpoint panel cepat sedang terlambat.
      InfaqMode: cell(41,3).toUpperCase() === 'AUTO' ? 'AUTO' : 'OFF',
      Infaq: {
        text1: cell(42,3),
        text2: cell(43,3)
      },

      Kegiatan: {
        jenis: cell(28,3).toUpperCase(),
        values: kegiatan
      },
      EventRunningText: event.join(' • ')
    };
  } catch (error) {
    Logger.log('REALTIME DISPLAY CONFIG ERROR: ' + error.message);
    return { success: false, error: error.message };
  }
}

// =====================================================
// REALTIME KHUSUS PANEL - KEUANGAN / QUR'BAN / PETUGAS SHOLAT
// Satu endpoint untuk frontend agar tidak melakukan beberapa
// request Apps Script terpisah.
// =====================================================
function getRealtimePanelsFast() {
  try {
    const ss = getSpreadsheet();
    const panels = ss.getSheetByName('panels');
    if (!panels) return { success: false, error: 'Sheet panels tidak ditemukan.' };

    // INFAQ & SHADAQAH: panels!C42:C43
    const infaqValues = panels.getRange('C42:C43').getDisplayValues();
    const infaqText1 = String((infaqValues[0] || [])[0] || '').trim();
    const infaqText2 = String((infaqValues[1] || [])[0] || '').trim();

    const infaqMode = String(panels.getRange('C41').getDisplayValue() || '').trim().toUpperCase();

    Logger.log(
      'REALTIME PANELS INFAQ C41/C42/C43 = [' +
      infaqMode + '] [' + infaqText1 + '] [' + infaqText2 + ']'
    );

    const panelValues = panels.getRange('C26:C32').getDisplayValues();
    const selectorRaw = String((panelValues[0] || [])[0] || '').trim();
    const selectorKey = selectorRaw.toUpperCase().replace(/[\s’‘']/g, '');
    const selectedKey =
      selectorKey === 'QURBAN'
        ? 'QURBAN'
        : selectorKey === 'PENGURUS'
          ? 'PENGURUS'
          : selectorKey === 'KEUANGAN'
            ? 'KEUANGAN'
            : '';

    const jenis = String((panelValues[2] || [])[0] || '').trim().toUpperCase();
    const kegiatanValues = [
      String((panelValues[3] || [])[0] || '').trim(),
      String((panelValues[4] || [])[0] || '').trim(),
      String((panelValues[5] || [])[0] || '').trim(),
      String((panelValues[6] || [])[0] || '').trim()
    ];

    const configuredFields = PANEL_KEGIATAN_FIELDS_[jenis] || [];
    const fields = {};
    configuredFields.forEach(function(label, index) {
      fields[label] = kegiatanValues[index] || '';
    });

    let selectedSheet = null;
    ss.getSheets().some(function(sheet) {
      const key = String(sheet.getName() || '')
        .toUpperCase()
        .replace(/[\s’‘']/g, '');
      if (key === selectedKey) {
        selectedSheet = sheet;
        return true;
      }
      return false;
    });

    let title = '', date = '', a3 = '', rows = [], headerStyles = null;
    if (selectedSheet) {
      title = String(selectedSheet.getRange('A1').getDisplayValue() || '').trim();
      date = String(selectedSheet.getRange('A2').getDisplayValue() || '')
        .replace(/^(0)(\d)(\s)/, '$2$3');
      a3 = String(selectedSheet.getRange('A3').getDisplayValue() || '').trim();
      headerStyles =
        (selectedKey === 'QURBAN' || selectedKey === 'PENGURUS')
          ? getQurbanHeaderStyles_(selectedSheet)
          : null;

      const lastRow = selectedSheet.getLastRow();
      if (selectedKey === 'QURBAN') {
        if (lastRow >= 5) {
          selectedSheet.getRange(5, 1, lastRow - 4, 1).getDisplayValues()
            .forEach(function(row) {
              rows.push([String(row[0] == null ? '' : row[0]).trim(), '']);
            });
        }
      } else if (selectedKey === 'PENGURUS') {
        // PENGURUS realtime: baca A5 sampai baris terakhir yang
        // benar-benar berisi data. getLastRow() menjadi batas dinamis,
        // sehingga tidak ada batas jumlah baris dari sisi program.
        const pengurusStartRow = 19;
        const lastPengurusContentRow = getLastFilledColumnRow_(selectedSheet, pengurusStartRow, 1);
        if (lastPengurusContentRow >= pengurusStartRow) {
          const pengurusRows = selectedSheet
            .getRange(
              pengurusStartRow,
              1,
              lastPengurusContentRow - pengurusStartRow + 1,
              1
            )
            .getDisplayValues();

          pengurusRows.forEach(function(displayRow) {
            rows.push([
              String(displayRow[0] == null ? '' : displayRow[0]).trim(),
              ''
            ]);
          });
        }
      } else if (lastRow >= 4) {
        selectedSheet.getRange(4, 1, lastRow - 3, 2).getDisplayValues()
          .forEach(function(row) {
            rows.push([
              String(row[0] == null ? '' : row[0]).trim(),
              String(row[1] == null ? '' : row[1]).trim()
            ]);
          });
      }
    }

    const panelKeuangan = {
      selector: selectedKey,
      title: title,
      date: date,
      a3: a3,
      rows: rows,
      headerStyles: headerStyles
    };

    return {
      success: true,
      signature: JSON.stringify([selectedKey, title, date, a3, rows, headerStyles, jenis, kegiatanValues, infaqText1, infaqText2, infaqMode]),
      Infaq: { text1: infaqText1, text2: infaqText2 },
      InfaqMode: infaqMode === 'AUTO' ? 'AUTO' : 'OFF',
      Kegiatan: { success: true, jenis: jenis, fields: fields },
      PanelKeuangan: panelKeuangan
    };
  } catch (error) {
    Logger.log('REALTIME PANELS FAST ERROR: ' + error.message);
    return { success: false, error: error.message };
  }
}


function getPanelKegiatan() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName("panels");

    if (!sheet) {
      return {
        success: false,
        error: "Sheet panels tidak ditemukan.",
        jenis: "",
        fields: {}
      };
    }

    const jenis = String(
      sheet.getRange("C28").getDisplayValue() || ""
    ).trim().toUpperCase();

    const configuredFields = PANEL_KEGIATAN_FIELDS_[jenis] || [];
    const values = sheet.getRange("C29:C32").getDisplayValues();

    const fields = {};

    configuredFields.forEach(function(label, index) {
      fields[label] = String(
        values[index] && values[index][0] != null
          ? values[index][0]
          : ""
      ).trim();
    });

    return {
      success: true,
      jenis: jenis,
      fields: fields
    };

  } catch (error) {
    Logger.log("PANEL KEGIATAN ERROR: " + error.message);

    return {
      success: false,
      error: error.message,
      jenis: "",
      fields: {}
    };
  }
}



// =====================================================
// FORMAT QUR'BAN A1:A3 DARI SPREADSHEET
// Membaca format sel langsung agar frontend mudah diubah
// hanya dari Google Sheets.
// =====================================================
function getQurbanHeaderStyles_(sheet) {
  if (!sheet) return null;

  const styles = {};
  ['A1', 'A2', 'A3'].forEach(function(a1) {
    const range = sheet.getRange(a1);
    const row = range.getRow();

    styles[a1] = {
      fontFamily: range.getFontFamily() || '',
      fontSizePt: range.getFontSize(),
      fontWeight: range.getFontWeight() || '',
      fontStyle: range.getFontStyle() || '',
      horizontalAlignment: range.getHorizontalAlignment() || '',
      verticalAlignment: range.getVerticalAlignment() || '',
      wrap: range.getWrap(),
      rowHeightPx: sheet.getRowHeight(row)
    };
  });

  return styles;
}

// =====================================================
// HELPER: BARIS TERAKHIR YANG BENAR-BENAR TERISI
// Dipakai PENGURUS agar data berhenti tepat pada field terakhir.
// =====================================================
function getLastFilledColumnRow_(sheet, startRow, column) {
  const sheetLastRow = sheet.getLastRow();
  if (sheetLastRow < startRow) return startRow - 1;

  const values = sheet
    .getRange(startRow, column, sheetLastRow - startRow + 1, 1)
    .getDisplayValues();

  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0] == null ? '' : values[i][0]).trim() !== '') {
      return startRow + i;
    }
  }

  return startRow - 1;
}

// =====================================================
// PANEL KEUANGAN / QUR'BAN CEPAT - panels!C26
// Hanya membaca selector + data panel. Tidak menjalankan
// getDataFromSheet(), scheduler, audio, atau jadwal sholat.
// =====================================================
function getPanelKeuanganSource() {
  const ss = getSpreadsheet();
  const panels = ss.getSheetByName('panels');
  const rawSelector = panels
    ? String(panels.getRange('C26').getDisplayValue() || '').trim()
    : '';

  const selectorKey = rawSelector
    .toUpperCase()
    .replace(/[\\s’‘']/g, '');

  const selectedKey =
    selectorKey === 'QURBAN'
      ? 'QURBAN'
      : selectorKey === 'PENGURUS'
        ? 'PENGURUS'
        : selectorKey === 'KEUANGAN'
          ? 'KEUANGAN'
          : '';

  let selectedSheet = null;
  ss.getSheets().some(function(sheet) {
    const key = String(sheet.getName() || '')
      .toUpperCase()
      .replace(/[\\s’‘']/g, '');
    if (key === selectedKey) {
      selectedSheet = sheet;
      return true;
    }
    return false;
  });

  if (!selectedSheet) {
    return { selector: selectedKey, title: '', date: '', a3: '', rows: [], headerStyles: null };
  }

  const title = String(selectedSheet.getRange('A1').getDisplayValue() || '').trim();
  const date = String(selectedSheet.getRange('A2').getDisplayValue() || '')
    .replace(/^(0)(\d)(\\s)/, '$2$3');
  const a3 = String(selectedSheet.getRange('A3').getDisplayValue() || '').trim();
  const headerStyles =
    (selectedKey === 'QURBAN' || selectedKey === 'PENGURUS')
      ? getQurbanHeaderStyles_(selectedSheet)
      : null;
  const rows = [];
  const lastRow = selectedSheet.getLastRow();

  if (selectedKey === 'QURBAN') {
    // A1 judul, A2 masjid/tanggal, A3 header, A4 dilewati, A5:A scrolling.
    // Baris kosong dipertahankan agar spasi mengikuti spreadsheet.
    if (lastRow >= 5) {
      selectedSheet.getRange(5, 1, lastRow - 4, 1).getDisplayValues()
        .forEach(function(displayRow) {
          rows.push([String(displayRow[0] == null ? '' : displayRow[0]).trim(), '']);
        });
    }
  } else if (selectedKey === 'PENGURUS') {
    // PENGURUS mengikuti format QURBAN.
    // A1:A4 adalah header; data/scrolling dimulai dari A5.
    // Batas bawah dinamis mengikuti baris terakhir yang berisi data.
    const pengurusStartRow = 19;
    const lastPengurusContentRow = getLastFilledColumnRow_(selectedSheet, pengurusStartRow, 1);
    if (lastPengurusContentRow >= pengurusStartRow) {
      const pengurusRows = selectedSheet
        .getRange(
          pengurusStartRow,
          1,
          lastPengurusContentRow - pengurusStartRow + 1,
          1
        )
        .getDisplayValues();

      pengurusRows.forEach(function(displayRow) {
        rows.push([
          String(displayRow[0] == null ? '' : displayRow[0]).trim(),
          ''
        ]);
      });
    }
  } else if (lastRow >= 4) {
    selectedSheet.getRange(4, 1, lastRow - 3, 2).getDisplayValues()
      .forEach(function(displayRow) {
        const row = [
          String(displayRow[0] == null ? '' : displayRow[0]).trim(),
          String(displayRow[1] == null ? '' : displayRow[1]).trim()
        ];
        if (row[0] !== '' || row[1] !== '') rows.push(row);
      });
  }

  return { selector: selectedKey, title: title, date: date, a3: a3, rows: rows, headerStyles: headerStyles };
}


/**
 * UJI INTEGRASI API INDONESIA (JADWAL SHOLAT + KALENDER HIJRIAH).
 * Jalankan manual dari Apps Script Editor untuk memastikan kedua endpoint,
 * API key, lokasi aktif, dan tanggal respons berfungsi normal.
 * Hanya membaca Spreadsheet/API dan menulis log; tidak mengubah sheet,
 * cache GitHub, trigger, tampilan, atau scheduler audio.
 */
function TEST_API_INDONESIA_KALENDER_DAN_SHOLAT_AMAN() {
  const ss = getSpreadsheet();
  const panels = ss.getSheetByName("panels");
  if (!panels) throw new Error('Sheet "panels" tidak ditemukan.');

  const loc = panels.getRange("C5:C10").getDisplayValues().map(function(row) {
    return String(row[0] || "").trim();
  });
  const city = loc[0];
  const province = loc[1];
  const timezone = loc[3] || "Asia/Makassar";
  if (!city) throw new Error("Kota pada panels!C5 kosong.");

  const date = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");
  const prayer = getPrayerSchedule(date);
  const hijri = getHijriDateFromApi(date);
  const report = {
    test: "API Indonesia jadwal sholat + kalender Hijriah",
    tanggal: date,
    kota: city,
    provinsi: province,
    timezone: timezone,
    jadwalSholat: prayer,
    kalenderHijriah: hijri
  };

  Logger.log("TEST_API_INDONESIA_KALENDER_DAN_SHOLAT_AMAN: " + JSON.stringify(report));

  if (!prayer || prayer.success !== true ||
      String(prayer.tanggal || "") !== date ||
      !prayer.jadwal || !isCompletePrayerScheduleSafe_(prayer.jadwal)) {
    throw new Error("UJI JADWAL SHOLAT API INDONESIA GAGAL: " +
      String(prayer && (prayer.apiIndonesiaError || prayer.error) || "respons tidak lengkap"));
  }

  if (!hijri || hijri.success !== true || !hijri.hijri ||
      (hijri.date && String(hijri.date) !== date)) {
    throw new Error("UJI KALENDER HIJRIAH API INDONESIA GAGAL: " +
      String(hijri && hijri.error || "respons tidak lengkap atau tanggal tidak cocok"));
  }

  Logger.log("UJI API INDONESIA LULUS: " + city + " | " + date +
    " | Jadwal sholat lengkap | Hijriah " + hijri.hijri);
  return {
    success: true,
    date: date,
    city: city,
    sourcePrayer: prayer.source || "API Indonesia",
    sourceHijri: hijri.source || "API Indonesia",
    jadwal: prayer.jadwal,
    hijri: hijri.hijri
  };
}


/**
 * UJI LANGSUNG API INDONESIA TANPA MEMBACA/MENULIS CACHE.
 * Memanggil endpoint daftar kota, jadwal sholat, dan kalender Hijriah secara langsung.
 * Hanya membaca sheet dan API lalu menulis log; tidak mengubah sheet, cache,
 * GitHub, trigger, tampilan, ataupun scheduler audio.
 */
function TEST_API_INDONESIA_KALENDER_DAN_SHOLAT_LANGSUNG_TANPA_CACHE_AMAN() {
  var props = PropertiesService.getScriptProperties();
  var apiKey = String(props.getProperty('API_INDONESIA_KEY') || '').trim();
  if (!apiKey) throw new Error('Script Property API_INDONESIA_KEY belum diisi.');

  var ss = getSpreadsheet();
  var panels = ss.getSheetByName('panels');
  if (!panels) throw new Error('Sheet "panels" tidak ditemukan.');
  var loc = panels.getRange('C5:C10').getDisplayValues().map(function(row) {
    return String(row[0] || '').trim();
  });
  var city = loc[0] || '';
  var province = loc[1] || '';
  var timezone = loc[3] || 'Asia/Makassar';
  if (!city) throw new Error('panels!C5 (kota) kosong.');
  var date = Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd');

  function fetchJsonDirect_(url, label) {
    var response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      headers: { 'x-api-key': apiKey, 'Accept': 'application/json' }
    });
    var code = response.getResponseCode();
    var body = response.getContentText() || '';
    var json = null;
    try { json = JSON.parse(body); } catch (parseError) {}
    if (code < 200 || code >= 300) {
      throw new Error(label + ' HTTP ' + code + ': ' + body.slice(0, 400));
    }
    if (!json || typeof json !== 'object') {
      throw new Error(label + ' mengembalikan JSON yang tidak valid.');
    }
    return { json: json, httpCode: code };
  }
  function normalizeDirectCity_(value) {
    return String(value || '').toUpperCase()
      .replace(/^(KOTA\s+ADM\.?\s*|KOTA\s+|KABUPATEN\s+|KABUP\.?\s+|KAB\.?\s+)/, '')
      .replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  }
  function normalizeDirectTime_(value) {
    var m = String(value == null ? '' : value).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : '';
  }

  // Sengaja tidak menggunakan CacheService untuk ketiga request pengujian.
  var cityResponse = fetchJsonDirect_(
    'https://use.apiindonesia.id/api/v1/sholat/list-kota',
    'API Indonesia daftar kota'
  );
  var cityList = cityResponse.json && Array.isArray(cityResponse.json.data)
    ? cityResponse.json.data : [];
  if (!cityList.length) throw new Error('Endpoint langsung daftar kota tidak mengembalikan data.');

  var wantedCity = normalizeDirectCity_(city);
  var wantedProvince = normalizeDirectCity_(province);
  var matches = cityList.filter(function(item) {
    return normalizeDirectCity_(item && (item.regency_name || item.name || item.alt_name)) === wantedCity;
  });
  if (matches.length > 1 && wantedProvince) {
    var provinceMatches = matches.filter(function(item) {
      return normalizeDirectCity_(item && (item.province_name || item.province)) === wantedProvince;
    });
    if (provinceMatches.length) matches = provinceMatches;
  }
  if (matches.length !== 1) {
    throw new Error('Pencocokan kota langsung API Indonesia harus menghasilkan tepat 1 hasil; ditemukan ' +
      matches.length + ' untuk ' + city + ' / ' + province + '.');
  }
  var regencyId = String(matches[0].regency_id || matches[0].id || matches[0].code || '').trim();
  if (!regencyId) throw new Error('ID kota API Indonesia kosong untuk ' + city + '.');

  var prayerResponse = fetchJsonDirect_(
    'https://use.apiindonesia.id/api/v1/sholat?kabupaten_id=' +
      encodeURIComponent(regencyId) + '&tanggal=' + encodeURIComponent(date),
    'API Indonesia jadwal sholat'
  );
  var prayerData = prayerResponse.json && prayerResponse.json.data;
  if (!prayerData || typeof prayerData !== 'object' || Array.isArray(prayerData)) {
    throw new Error('Respons langsung jadwal sholat tidak memiliki data.');
  }
  var prayerDate = String(prayerData.date || prayerData.tanggal || '').trim();
  if (prayerDate !== date) {
    throw new Error('Tanggal jadwal langsung tidak cocok; diminta ' + date + ', diterima ' + prayerDate + '.');
  }
  var prayer = {
    imsak: normalizeDirectTime_(prayerData.imsyak),
    subuh: normalizeDirectTime_(prayerData.shubuh),
    terbit: normalizeDirectTime_(prayerData.terbit),
    dzuhur: normalizeDirectTime_(prayerData.dzuhur),
    ashar: normalizeDirectTime_(prayerData.ashr),
    maghrib: normalizeDirectTime_(prayerData.maghrib),
    isya: normalizeDirectTime_(prayerData.isya)
  };
  if (!isCompletePrayerScheduleSafe_(prayer)) {
    throw new Error('Respons langsung jadwal sholat tidak lengkap/format waktu tidak valid: ' +
      JSON.stringify(prayer));
  }

  var hijriResponse = fetchJsonDirect_(
    HIJRI_API_BASE_URL + '/konversi?tanggal=' + encodeURIComponent(date),
    'API Indonesia kalender Hijriah'
  );
  var hijriData = hijriResponse.json && hijriResponse.json.data;
  var hijri = String(hijriData && hijriData.hijri_formatted || '').trim();
  var hijriDate = String(hijriData && (hijriData.gregorian_date || hijriData.date) || '').trim();
  if (!hijri) throw new Error('Respons langsung kalender Hijriah tidak memiliki hijri_formatted.');
  if (hijriDate && hijriDate !== date) {
    throw new Error('Tanggal kalender Hijriah langsung tidak cocok; diminta ' + date +
      ', diterima ' + hijriDate + '.');
  }

  var report = {
    success: true,
    test: 'API Indonesia langsung tanpa cache',
    tanggal: date,
    kota: city,
    provinsi: province,
    regencyId: regencyId,
    timezone: timezone,
    requests: {
      daftarKota: { httpCode: cityResponse.httpCode, cacheUsed: false },
      jadwalSholat: { httpCode: prayerResponse.httpCode, cacheUsed: false },
      kalenderHijriah: { httpCode: hijriResponse.httpCode, cacheUsed: false }
    },
    jadwalSholat: prayer,
    kalenderHijriah: hijri,
    source: 'API Indonesia (direct fetch, no CacheService)'
  };
  Logger.log('UJI LANGSUNG API INDONESIA TANPA CACHE: ' + JSON.stringify(report));
  Logger.log('UJI LANGSUNG API INDONESIA LULUS: ' + city + ' | ' + date +
    ' | 3 endpoint HTTP sukses | Hijriah ' + hijri);
  return report;
}
