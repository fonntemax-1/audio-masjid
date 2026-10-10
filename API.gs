// ============================================================
// TV MASJID DISPLAY SIGNAGE
// API.GS - BRIDGE GITHUB PAGES
// ============================================================
//
// JSONP bridge untuk GitHub Pages.
// TIDAK mengubah sistem AUDIO.
// TIDAK mengubah jadwal sholat.
// TIDAK mengubah Ramadan.
// TIDAK mengubah keuangan / Jumat / khutbah.
//
// ============================================================

function handleGithubApiRequest_(params) {
  params = params || {};
  var action = String(params.action || '').trim();
  var callback = String(params.callback || '').trim();

  if (!callback) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: 'Callback JSONP kosong.'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (!/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(callback)) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: 'Callback JSONP tidak valid.'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var result;

    switch (action) {
      case 'getDataFromSheet':
        result = getDataFromSheet();
        break;

      case 'getRealtimeDisplayConfig':
        result = getRealtimeDisplayConfig();
        break;

      case 'getPanelDisplayMode':
        result = getPanelDisplayMode();
        break;

      case 'getPanelKeuanganSource':
        result = getPanelKeuanganSource();
        break;

      case 'getRealtimePanelsFast':
        result = getRealtimePanelsFast();
        break;

      case 'getEventCountdownConfig':
        result = getPanelEventCountdownConfig_();
        break;

      case 'getEidFitriVideoConfig':
        // Konfigurasi video Idul Fitri dibaca melalui helper bridge lokal.
        // Ini menghindari ReferenceError jika deployment belum memuat
        // getEidFitriVideoConfig() dari Code.gs. Audio/scheduler tidak disentuh.
        result = getEidFitriVideoConfigFromApi_();
        break;

      case 'getEidAdhaVideoConfig':
        // Konfigurasi animasi Idul Adha dibaca terpisah dari C69:E69.
        result = getEidAdhaVideoConfigFromApi_();
        break;

      case 'getYoutubeControl':
        // Kontrak kontrol YouTube panels!C20/F20.
        // ON = suara aktif; OFF = video tetap berjalan dalam keadaan mute.
        // AUTO = aturan mute terjadwal; STOP = hentikan pemutaran video.
        // Konfigurasi ini terpisah dari scheduler/audio sholat.
        result = getYoutubeControl();
        if (result && result.success !== false) {
          var youtubeControlMode = String(
            result.YoutubeStatus || 'AUTO'
          ).trim().toUpperCase();

          if (
            youtubeControlMode !== 'ON' &&
            youtubeControlMode !== 'OFF' &&
            youtubeControlMode !== 'AUTO' &&
            youtubeControlMode !== 'STOP'
          ) {
            youtubeControlMode = 'AUTO';
          }

          result.YoutubeStatus = youtubeControlMode;
          result.Youtube = String(result.Youtube || '').trim();

          // Nilai default dijaga di bridge agar frontend selalu menerima
          // kontrak yang sama, termasuk saat deployment GAS berbeda versi.
          var muteBeforeQiroah = Number(result.YoutubeMuteBeforeQiroahSeconds);
          var muteAfterIqomah = Number(result.YoutubeMuteAfterIqomahMinutes);

          result.YoutubeMuteBeforeQiroahSeconds =
            isFinite(muteBeforeQiroah) && muteBeforeQiroah >= 0
              ? muteBeforeQiroah
              : 120;

          result.YoutubeMuteAfterIqomahMinutes =
            isFinite(muteAfterIqomah) && muteAfterIqomah >= 0
              ? muteAfterIqomah
              : 20;
        }
        break;

      case 'getPanelKegiatan':
        result = getPanelKegiatan();
        break;

      case 'getPanelIqomahBlackMode':
        result = getPanelIqomahBlackMode();
        break;

      case 'getDisplayThemeSetting':
        result = getDisplayThemeSetting();
        break;

      case 'getServerTime':
        result = getServerTime();
        break;

      case 'getEventRunningText':
        result = getEventRunningText();
        break;

      case 'getHijriDateFromApi':
        result = getHijriDateFromApi(String(params.date || ''));
        break;

      case 'getPrayerSchedule':
        // Selalu kembalikan kontrak stabil yang dibaca index.html:
        // { success, tanggal, timezone, jadwal:{subuh,terbit,dzuhur,ashar,maghrib,isya} }
        result = getPrayerSchedule(String(params.date || ''));
        if (!result || typeof result !== 'object') {
          result = {
            success: false,
            error: 'getPrayerSchedule tidak mengembalikan object.'
          };
        }
        break;

      case 'getRealtimeAudioConfig':
        result = getRealtimeAudioConfig();
        break;

      case 'getRealtimeAudioStatus':
        result = getRealtimeAudioStatus();
        break;

      case 'setYoutubeStatusOff':
        result = setYoutubeStatusOff();
        break;

      case 'getYoutubeStatus':
        result = getYoutubeStatus();
        break;

      case 'lockYoutubeControl':
        result = lockYoutubeControl();
        break;

      case 'unlockYoutubeControl':
        result = unlockYoutubeControl();
        break;

      case 'getYoutubeControlProtectionState':
        result = getYoutubeControlProtectionState();
        break;

      case 'setRemoteCell':
        result = setRemoteCellFromApi_(params);
        break;

      case 'ping':
        result = {
          status: 'OK',
          message: 'Apps Script API aktif',
          timezone: Session.getScriptTimeZone()
        };
        break;

      default:
        throw new Error('API action tidak dikenal: ' + action);
    }

    if (action === 'getDataFromSheet') {
      Logger.log('API BRIDGE: getDataFromSheet berhasil.');
      Logger.log('API BRIDGE: HAS Event = ' + (
        result &&
        typeof result === 'object' &&
        Object.prototype.hasOwnProperty.call(result, 'Event')
      ));
      Logger.log('API BRIDGE: Event = ' + JSON.stringify(
        result && result.Event ? result.Event : null
      ));
    }

    // DIAGNOSTIC JSONP: ukur waktu dan ukuran payload sebelum dikirim.
    // Tidak mengubah isi data, audio, scheduler, atau Spreadsheet.
    var responseStartedAt = new Date().getTime();

    var responsePayload = {
      success: true,
      data: result
    };

    var responseJson = JSON.stringify(responsePayload, function(key, value) {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    });

    Logger.log(
      'API BRIDGE RESPONSE: action=' + action +
      ' jsonChars=' + responseJson.length +
      ' serializeMs=' + (new Date().getTime() - responseStartedAt)
    );

    var responseOutput =
      String(callback) + '(' + responseJson + ');';

    Logger.log(
      'API BRIDGE RESPONSE: outputChars=' +
      responseOutput.length
    );

    return ContentService
      .createTextOutput(responseOutput)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } catch (error) {
    Logger.log('API BRIDGE ERROR: ' + (
      error && error.stack ? error.stack : String(error)
    ));

    return createJsonpResponse_(callback, {
      success: false,
      error: error && error.message ? error.message : String(error)
    });
  }
}


/**
 * Membaca konfigurasi video Idul Fitri secara mandiri dari API bridge.
 * panels!C68 = tanggal mulai, D68 = tanggal berhenti, E68 = ON/OFF.
 * Mengikuti pola akses spreadsheet yang dipakai kontrak YouTube.
 * Tidak mengubah pengaturan audio atau scheduler.
 */

 // ============================================================
 // REMOTE CONTROL - penulisan terbatas dengan PIN Script Properties
 // Tidak mengubah scheduler, antrean audio, atau jadwal salat.
 // ============================================================
 function setRemoteCellFromApi_(params) {
   params = params || {};
   var configuredPin = String(PropertiesService.getScriptProperties().getProperty('REMOTE_CONTROL_PIN') || '');
   var suppliedPin = String(params.pin || '');
   if (!configuredPin || configuredPin.length < 6) {
     throw new Error('Remote belum diaktifkan. Atur Script Property REMOTE_CONTROL_PIN (minimal 6 karakter).');
   }
   if (!suppliedPin || suppliedPin !== configuredPin) {
     throw new Error('PIN remote salah.');
   }
   var sheetName = String(params.sheet || '').trim();
   var cell = String(params.cell || '').trim().toUpperCase();
   var value = params.value === undefined || params.value === null ? '' : String(params.value);
   if (sheetName !== 'panels' || !isAllowedRemoteCell_(cell)) {
     throw new Error('Lokasi sel tidak diizinkan untuk remote.');
   }
   if (value.length > 500) throw new Error('Nilai terlalu panjang (maksimal 500 karakter).');
   var lock = LockService.getScriptLock();
   lock.waitLock(10000);
   try {
     var ss = getSpreadsheet();
     var sheet = ss.getSheetByName('panels');
     if (!sheet) throw new Error('Sheet panels tidak ditemukan.');
     sheet.getRange(cell).setValue(value);
     SpreadsheetApp.flush();
     return { success: true, sheet: sheetName, cell: cell, value: sheet.getRange(cell).getDisplayValue(), updatedAt: new Date().toISOString() };
   } finally {
     lock.releaseLock();
   }
 }
 function isAllowedRemoteCell_(cell) {
   var allowed = new Set([
     'C18','F20','C22','C26','C28','C29','C30','C31','C32',
     'B35','B36','B37','B38','B39','C41','C42','C43',
     'C60','D60','E60','C61','D61','E61','C62','D62','E62',
     'C63','D63','E63','C64','D64','E64','C69','D69','E69'
   ]);
   return allowed.has(String(cell || '').toUpperCase());
 }

function getEidFitriVideoConfigFromApi_() {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName('panels');
    if (!sheet) {
      return {
        success: false,
        error: 'Sheet panels tidak ditemukan.',
        startDate: '',
        stopDate: '',
        status: 'OFF'
      };
    }

    var values = sheet.getRange('C68:E68').getValues()[0] || [];
    var timeZone = ss.getSpreadsheetTimeZone() ||
      Session.getScriptTimeZone() || 'Asia/Makassar';

    function normalizeVideoDate_(value) {
      if (value instanceof Date && !isNaN(value.getTime())) {
        return Utilities.formatDate(value, timeZone, 'yyyy-MM-dd');
      }
      var text = String(value == null ? '' : value).trim();
      if (!text) return '';

      var match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (match) {
        return match[1] + '-' +
          ('0' + match[2]).slice(-2) + '-' +
          ('0' + match[3]).slice(-2);
      }

      match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (match) {
        return match[3] + '-' +
          ('0' + match[2]).slice(-2) + '-' +
          ('0' + match[1]).slice(-2);
      }
      return text;
    }

    var rawStatus = String(values[2] == null ? '' : values[2])
      .trim().toUpperCase();

    return {
      success: true,
      startDate: normalizeVideoDate_(values[0]),
      stopDate: normalizeVideoDate_(values[1]),
      status: rawStatus === 'ON' ? 'ON' : 'OFF'
    };
  } catch (error) {
    var message = error && error.message ? error.message : String(error);
    Logger.log('IDUL FITRI VIDEO API CONFIG ERROR: ' + message);
    return {
      success: false,
      error: message,
      startDate: '',
      stopDate: '',
      status: 'OFF'
    };
  }
}


function getEidAdhaVideoConfigFromApi_() {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName('panels');
    if (!sheet) {
      return {
        success: false,
        error: 'Sheet panels tidak ditemukan.',
        startDate: '',
        stopDate: '',
        status: 'OFF'
      };
    }

    var values = sheet.getRange('C69:E69').getValues()[0] || [];
    var timeZone = ss.getSpreadsheetTimeZone() ||
      Session.getScriptTimeZone() || 'Asia/Makassar';

    function normalizeVideoDate_(value) {
      if (value instanceof Date && !isNaN(value.getTime())) {
        return Utilities.formatDate(value, timeZone, 'yyyy-MM-dd');
      }
      var text = String(value == null ? '' : value).trim();
      if (!text) return '';

      var match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (match) {
        return match[1] + '-' +
          ('0' + match[2]).slice(-2) + '-' +
          ('0' + match[3]).slice(-2);
      }

      match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (match) {
        return match[3] + '-' +
          ('0' + match[2]).slice(-2) + '-' +
          ('0' + match[1]).slice(-2);
      }
      return text;
    }

    var rawStatus = String(values[2] == null ? '' : values[2])
      .trim().toUpperCase();

    return {
      success: true,
      startDate: normalizeVideoDate_(values[0]),
      stopDate: normalizeVideoDate_(values[1]),
      status: rawStatus === 'ON' ? 'ON' : 'OFF'
    };
  } catch (error) {
    var message = error && error.message ? error.message : String(error);
    Logger.log('IDUL ADHA VIDEO API CONFIG ERROR: ' + message);
    return {
      success: false,
      error: message,
      startDate: '',
      stopDate: '',
      status: 'OFF'
    };
  }
}

function createJsonpResponse_(callback, payload) {
  var json = JSON.stringify(payload, function(key, value) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  });

  var output = String(callback) + '(' + json + ');';

  return ContentService
    .createTextOutput(output)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function sanitizeJsonpCallback_(callback) {
  if (callback === null || callback === undefined) return '';
  var value = String(callback).trim();
  if (!value) return '';
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(value)) return '';
  return value;
}
