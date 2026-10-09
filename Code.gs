
// =========================================================
// TV MASJID DISPLAY SIGNAGE 
// CODE.GS
// =========================================================


// =========================================================
// WEB APP
// =========================================================

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

    const mode =
      raw === 'AUTO' ? 'AUTO' :
      raw === 'SLEEP' ? 'SLEEP' :
      'OFF';

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
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('panels');

    if (!sheet) {
      return {
        success: true,
        Youtube: '',
        YoutubeStatus: 'AUTO'
      };
    }

    const url = String(
      sheet.getRange('C20').getDisplayValue() || ''
    ).trim();

    const rawStatus = String(
      sheet.getRange('G20').getDisplayValue() || ''
    ).trim().toUpperCase();

    const status =
      ['ON', 'OFF', 'AUTO', 'STOP'].indexOf(rawStatus) >= 0
        ? rawStatus
        : 'AUTO';

    return {
      success: true,
      Youtube: url,
      YoutubeStatus: status
    };

  } catch (error) {
    Logger.log(
      'YOUTUBE CONTROL CEPAT ERROR: ' + error.message
    );

    return {
      success: false,
      error: error.message,
      Youtube: '',
      YoutubeStatus: 'AUTO'
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
    // panels!C20 = ALAMAT LINK YOUTUBE
    // panels!G20 = SELECTOR: ON / OFF / AUTO / STOP
    //
    // ON   = YouTube hidup + suara ON
    // OFF  = YouTube hidup + suara MUTE
    // AUTO = MUTE 5 menit sebelum Qiroah,
    //        tetap MUTE sampai 30 menit setelah IQOMAH selesai,
    //        lalu suara ON kembali
    // STOP = YouTube dihentikan
    // =====================================================

    result.Youtube = '';
    result.YoutubeStatus = 'AUTO';
    result.YoutubeMute = false;
    result.YoutubeMuteBeforeQiroahSeconds = 300;
    result.YoutubeControlLocked = false;

    const youtubePanelsSheet = ss.getSheetByName('panels');
    if (youtubePanelsSheet) {
      result.Youtube = String(
        youtubePanelsSheet.getRange('C20').getDisplayValue() || ''
      ).trim();

      const youtubeSelector = String(
        youtubePanelsSheet.getRange('G20').getDisplayValue() || ''
      ).trim().toUpperCase();

      result.YoutubeStatus =
        ['ON', 'OFF', 'AUTO', 'STOP'].indexOf(youtubeSelector) >= 0
          ? youtubeSelector
          : 'AUTO';

      Logger.log(
        'YOUTUBE PANELS C20/G20 = LINK=[' +
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
    if (e === 'azan-biasa' || /^adzan-(dzuhur|zuhur|ashar|maghrib|isya|jumat|jumat|jumat|jumat|jumat)-?(ramadhan|ramadan|biasa)?$/.test(e)) return 'adzan-biasa';
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

    const result = {
      success: true,
      RamadanDisplay: getRamadanDisplaySetting(),
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

  // Aturan tetap: 5 menit sebelum qiroah.
  resultObj.YoutubeMuteBeforeQiroahSeconds =
    300;

  resultObj.YoutubeControlLocked =
    false;

  Logger.log(
    'YOUTUBE: URL=' + youtubeUrl +
    ' | STATUS=' + youtubeStatus +
    ' | AUTO_MUTE_BEFORE_QIROAH=300 detik'
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


// =========================================================
// JADWAL SHOLAT MUSLIMKITA - BALIKPAPAN
// =========================================================

function getPrayerSchedule(dateString) {
  try {
    const timezoneDefault = 'Asia/Makassar';
    const ss = getSpreadsheet();
    const panels = ss.getSheetByName('panels');

    if (!panels) {
      return { success: false, error: 'Sheet panels tidak ditemukan.' };
    }

    const locationValues = panels.getRange('C5:C10').getDisplayValues().map(function(row) {
      return String(row[0] || '').trim();
    });

    const kota = locationValues[0] || '';
    const provinsi = locationValues[1] || '';
    const zona = locationValues[2] || '';
    const panelTimezone = locationValues[3] || '';
    const gmt = locationValues[4] || '';
    const panelSlug = locationValues[5] || '';

    const kotaSlug = (
      panelSlug ||
      kota.toLowerCase()
        .replace(/[()]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
    );

    const timezone = panelTimezone || timezoneDefault;

    if (!kota) return { success: false, error: 'panels!C5 (kota) kosong.' };
    if (!kotaSlug) return { success: false, error: 'Slug kota untuk API MuslimKita kosong.' };

    if (!dateString) {
      dateString = Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd');
    }

    dateString = String(dateString).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return { success: false, error: 'Format tanggal harus YYYY-MM-DD.' };
    }

    const safeSlug = kotaSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const cacheKey = 'PRAYER_' + safeSlug + '_' + dateString.replace(/-/g, '');
    const propertyKey = 'PRAYER_SCHEDULE_' + safeSlug + '_' + dateString;

    const cache = CacheService.getScriptCache();
    const properties = PropertiesService.getScriptProperties();

    const cached = cache.get(cacheKey);
    if (cached) {
      try {
        const result = JSON.parse(cached);
        if (result && result.success === true && result.jadwal &&
            isCompletePrayerSchedule_(result.jadwal)) {
          result.cached = true;
          result.cacheSource = 'CacheService';
          return result;
        }
      } catch (e) {
        Logger.log('CACHE JADWAL INVALID: ' + e.message);
      }
    }

    const stored = properties.getProperty(propertyKey);
    if (stored) {
      try {
        const result = JSON.parse(stored);
        if (result && result.success === true && result.jadwal &&
            isCompletePrayerSchedule_(result.jadwal)) {
          try {
            cache.put(cacheKey, JSON.stringify(result), 21600);
          } catch (e) {}
          result.cached = true;
          result.cacheSource = 'ScriptProperties';
          return result;
        }
      } catch (e) {
        Logger.log('PROPERTY JADWAL INVALID: ' + e.message);
      }
    }

    const apiUrl =
      'https://www.muslimkita.id/api/jadwal-sholat/v1/' +
      encodeURIComponent(kotaSlug) +
      '?tanggal=' + encodeURIComponent(dateString) +
      '&metode=kemenag';

    Logger.log(
      'JADWAL SHOLAT API REQUEST: kota=[' + kota +
      '] slug=[' + kotaSlug +
      '] tanggal=[' + dateString +
      '] timezone=[' + timezone + '] URL=[' + apiUrl + ']'
    );

    const response = UrlFetchApp.fetch(apiUrl, {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Google Apps Script)'
      }
    });

    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    Logger.log('JADWAL SHOLAT API HTTP = ' + responseCode);
    Logger.log('JADWAL SHOLAT API RAW = ' + responseText.substring(0, 3000));

    if (responseCode !== 200) {
      return {
        success: false,
        error: 'HTTP ' + responseCode + ' dari API MuslimKita untuk ' + kota
      };
    }

    let json;
    try {
      json = JSON.parse(responseText);
    } catch (e) {
      Logger.log('JADWAL SHOLAT JSON ERROR = ' + e.message);
      return {
        success: false,
        error: 'Respons API MuslimKita bukan JSON valid untuk ' + kota
      };
    }

    // Dukung beberapa bentuk response MuslimKita.
    let jadwalApi = null;

    if (json && json.jadwal && typeof json.jadwal === 'object') {
      jadwalApi = json.jadwal;
    } else if (
      json && json.data && json.data.jadwal &&
      typeof json.data.jadwal === 'object'
    ) {
      jadwalApi = json.data.jadwal;
    } else if (
      json && json.data && typeof json.data === 'object' &&
      (
        json.data.subuh || json.data.fajr ||
        json.data.dzuhur || json.data.dhuhr ||
        json.data.ashar || json.data.asr
      )
    ) {
      jadwalApi = json.data;
    }

    if (!jadwalApi) {
      Logger.log(
        'JADWAL SHOLAT API TANPA FIELD JADWAL: ' +
        JSON.stringify(json).substring(0, 3000)
      );
      return {
        success: false,
        error: 'Data jadwal sholat tidak tersedia untuk ' + kota
      };
    }

    function pickPrayerField_(obj, keys) {
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (
          obj &&
          obj[key] !== undefined &&
          obj[key] !== null &&
          String(obj[key]).trim() !== ''
        ) {
          return obj[key];
        }
      }
      return '';
    }

    const result = {
      success: true,
      kota: json.kota || kota,
      provinsi: json.provinsi || provinsi,
      slug: json.slug || kotaSlug,
      tanggal: json.tanggal || dateString,
      timezone: json.timezone || timezone,
      zona: zona || (
        String(json.timezone || timezone).indexOf('Asia/Jakarta') === 0
          ? 'WIB'
          : String(json.timezone || timezone).indexOf('Asia/Jayapura') === 0
            ? 'WIT'
            : 'WITA'
      ),
      gmt: gmt || '',
      source: 'MuslimKita / Kemenag',
      cached: false,
      cacheSource: 'MuslimKita',
      jadwal: {
        imsak: normalizePrayerTime(
          pickPrayerField_(jadwalApi, ['imsak', 'imsakiyah'])
        ),
        subuh: normalizePrayerTime(
          pickPrayerField_(jadwalApi, ['subuh', 'fajr'])
        ),
        terbit: normalizePrayerTime(
          pickPrayerField_(jadwalApi, ['terbit', 'sunrise', 'syuruq'])
        ),
        dzuhur: normalizePrayerTime(
          pickPrayerField_(jadwalApi, ['dzuhur', 'dhuhur', 'dhuhr', 'zuhur'])
        ),
        ashar: normalizePrayerTime(
          pickPrayerField_(jadwalApi, ['ashar', 'asr'])
        ),
        maghrib: normalizePrayerTime(
          pickPrayerField_(jadwalApi, ['maghrib', 'magrib'])
        ),
        isya: normalizePrayerTime(
          pickPrayerField_(jadwalApi, ['isya', 'isha'])
        )
      }
    };

    // Validasi aman berbasis nilai HH:mm. Beberapa deployment Apps Script
    // lama dapat menjalankan validator lama/berbeda walaupun hasil normalisasi
    // sudah lengkap. Gunakan validator unik ini sebagai sumber kebenaran untuk
    // hasil API yang baru saja diterima.
    if (!isCompletePrayerScheduleSafe_(result.jadwal)) {
      Logger.log(
        'JADWAL SHOLAT TIDAK LENGKAP SETELAH NORMALISASI = ' +
        JSON.stringify(result.jadwal)
      );
      return {
        success: false,
        error: 'Data jadwal sholat tidak lengkap untuk ' + kota,
        jadwalDebug: result.jadwal
      };
    }

    const serialized = JSON.stringify(result);

    try {
      cache.put(cacheKey, serialized, 21600);
    } catch (e) {}

    try {
      properties.setProperty(propertyKey, serialized);
    } catch (e) {}

    Logger.log('JADWAL SHOLAT DITERIMA = ' + serialized);
    return result;

  } catch (error) {
    Logger.log(
      'JADWAL SHOLAT ERROR: ' +
      (error && error.message ? error.message : error)
    );

    return {
      success: false,
      error: error && error.message ? error.message : String(error)
    };
  }
}

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
function getPrayerScheduleJSON(dateString) {

  try {

    const result =
      getPrayerSchedule(dateString);

    return JSON.stringify(
      result || {
        success: false,
        error: 'getPrayerSchedule mengembalikan undefined.'
      }
    );

  } catch (error) {

    return JSON.stringify({
      success: false,
      error:
        error && error.message
          ? error.message
          : String(error)
    });

  }
}


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

function testKeyAudio() {

  const ss =
    getSpreadsheet();

  const sheet =
    ss.getSheetByName(
      'Adzan'
    );

  if (!sheet) {

    Logger.log(
      'ERROR: Sheet Adzan tidak ditemukan.'
    );

    return;
  }


  const lastRow =
    sheet.getLastRow();

  if (lastRow < 1) {

    Logger.log(
      'ERROR: Sheet Adzan kosong.'
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
    '===================================='
  );

  Logger.log(
    'TEST SHEET ADZAN'
  );

  Logger.log(
    '===================================='
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
}


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

    const apiKey =
      PropertiesService
        .getScriptProperties()
        .getProperty(HIJRI_API_KEY_PROPERTY);

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
    // REQUEST API
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
        data.gregorian_date ||
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

function getHijriDateFromCalendar(
  dateString
) {
  return getHijriDateFromApi(
    dateString
  );
}


// ============================================================
// TEST KALENDER HIJRIAH
// ============================================================
//
// Test selalu menggunakan tanggal saat ini dalam WITA,
// bukan timezone kalender Google.
// ============================================================

function TEST_HIJRI_API() {

  const timezone =
    HIJRI_TIMEZONE;

  const dateString =
    Utilities.formatDate(
      new Date(),
      timezone,
      'yyyy-MM-dd'
    );


  Logger.log(
    '========================================'
  );

  Logger.log(
    'TEST API INDONESIA KALENDER HIJRIAH'
  );

  Logger.log(
    'Tanggal WITA: ' +
    dateString
  );

  Logger.log(
    'Timezone acuan: ' +
    timezone
  );

  Logger.log(
    'Endpoint: ' +
    HIJRI_API_BASE_URL + '/konversi'
  );

  Logger.log(
    '========================================'
  );


  const result =
    getHijriDateFromCalendar(
      dateString
    );


  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;

}



// Kompatibilitas nama fungsi test lama.
function TEST_HIJRI_CALENDAR() {
  return TEST_HIJRI_API();
}


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
// DIAGNOSTIK ADZAN E:Z - 2026-09-27
// ============================================================
// Hanya membaca dan mencatat isi kolom E:Z.
// Tidak mengubah parser, sequence, durasi, status, atau audio.
// Jalankan fungsi ini secara manual dari Apps Script Editor.
// ============================================================
function DIAGNOSTIK_ADZAN_E_Z_20260927() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('Adzan');

  Logger.log('========================================');
  Logger.log('DIAGNOSTIK ADZAN E:Z - 2026-09-27');
  Logger.log('========================================');

  if (!sheet) {
    Logger.log('ERROR: Sheet Adzan tidak ditemukan.');
    return;
  }

  const lastRow = Math.max(sheet.getLastRow(), 1);
  const values = sheet.getRange(1, 5, lastRow, 22).getDisplayValues();

  const headers = [
    'E','F','G','H','I','J','K','L','M','N','O',
    'P','Q','R','S','T','U','V','W','X','Y','Z'
  ];

  Logger.log('Spreadsheet = ' + ss.getName());
  Logger.log('Sheet = ' + sheet.getName());
  Logger.log('Last Row = ' + lastRow);
  Logger.log('Kolom = E:Z');

  for (let r = 0; r < values.length; r++) {
    const row = values[r] || [];
    const hasContent = row.some(function(v) {
      return String(v == null ? '' : v).trim() !== '';
    });

    if (!hasContent) continue;

    const parts = [];
    for (let c = 0; c < headers.length; c++) {
      const value = String(row[c] == null ? '' : row[c]).trim();
      if (value !== '') {
        parts.push(headers[c] + '=[' + value + ']');
      }
    }

    Logger.log('BARIS ' + (r + 1) + ' | ' + parts.join(' | '));
  }

  Logger.log('========================================');
  Logger.log('DIAGNOSTIK ADZAN E:Z SELESAI');
  Logger.log('========================================');
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
function onEdit(e) {
  if (!e || !e.range) return;

  const range = e.range;
  const sheet = range.getSheet();

  if (sheet.getName() !== "panels") return;
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
function setTanggalJumatMingguBerjalan_(sheet) {
  // DINONAKTIFKAN.
  // Semua tanggal kegiatan sekarang diisi MANUAL,
  // termasuk SHOLAT JUM'AT.
  // Fungsi dipertahankan hanya untuk kompatibilitas dengan
  // kode lama agar tidak ada pemanggilan fungsi yang error.
  return;
}

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
function setupPanelKegiatanLabelFormulas_(sheet) {
  updatePanelKegiatanFields_(sheet, sheet.getRange("C28").getDisplayValue(), true);
}

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
    const youtubeStatusRaw = cell(20,7).toUpperCase();
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
      IqomahMode: c22Raw === 'AUTO' ? 'AUTO' : c22Raw === 'SLEEP' ? 'SLEEP' : 'OFF',
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
