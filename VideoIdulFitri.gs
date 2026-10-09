/**
 * Konfigurasi video Idul Fitri dari panels!C68:E68.
 * C68 = tanggal mulai, D68 = tanggal selesai, E68 = ON/OFF.
 * Salin file ini ke proyek Apps Script yang dipakai oleh Web App.
 */
function getEidFitriVideoConfig() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('panels');

    if (!sheet) {
      return {
        success: false,
        error: 'Sheet panels tidak ditemukan.',
        startDate: '',
        stopDate: '',
        status: 'OFF'
      };
    }

    const values = sheet.getRange('C68:E68').getValues()[0] || [];
    const timeZone =
      ss.getSpreadsheetTimeZone() ||
      Session.getScriptTimeZone() ||
      'Asia/Makassar';

    function normalizeDate(value) {
      if (value instanceof Date && !isNaN(value.getTime())) {
        return Utilities.formatDate(value, timeZone, 'yyyy-MM-dd');
      }

      const text = String(value == null ? '' : value).trim();
      if (!text) return '';

      // Format yyyy-MM-dd atau yyyy/MM/dd.
      let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (match) {
        return match[1] + '-' +
          ('0' + match[2]).slice(-2) + '-' +
          ('0' + match[3]).slice(-2);
      }

      // Format dd/MM/yyyy atau dd-MM-yyyy.
      match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (match) {
        return match[3] + '-' +
          ('0' + match[2]).slice(-2) + '-' +
          ('0' + match[1]).slice(-2);
      }

      return text;
    }

    const startDate = normalizeDate(values[0]);
    const stopDate = normalizeDate(values[1]);
    const rawStatus = String(values[2] == null ? '' : values[2])
      .trim()
      .toUpperCase();
    const status = rawStatus === 'ON' ? 'ON' : 'OFF';

    return {
      success: true,
      startDate: startDate,
      stopDate: stopDate,
      status: status
    };
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    Logger.log('IDUL FITRI VIDEO CONFIG ERROR: ' + message);

    return {
      success: false,
      error: message,
      startDate: '',
      stopDate: '',
      status: 'OFF'
    };
  }
}
