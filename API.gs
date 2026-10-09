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
