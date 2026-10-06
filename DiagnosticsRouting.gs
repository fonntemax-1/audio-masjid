// ============================================================
// DIAGNOSTIC ROUTING TENANT - TEMPORARY
// ============================================================
// Hanya untuk diagnosis routing M0002.
// Tidak mengubah data tenant.
// Hapus setelah diagnosis selesai.

function diagnoseMasjidRouting_(routing) {
  const requestedRouting = String(routing || '').trim().toLowerCase();
  const currentRouting = getCurrentMasjidRouting_();
  const result = {
    requestedRouting: requestedRouting,
    currentRequestRouting: currentRouting,
    master: null,
    binding: null,
    openedSpreadsheet: null,
    scriptPropertySpreadsheetId: String(
      PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || ''
    ).trim()
  };

  const row = findMasjidRowByRouting_(requestedRouting);
  if (!row) {
    result.master = {
      found: false,
      error: 'ROUTING_MASJID_TIDAK_TERDAFTAR'
    };
    return result;
  }

  result.master = {
    found: true,
    rowNumber: row.rowNumber,
    id: row.id,
    name: row.name,
    city: row.city,
    province: row.province,
    timezone: row.timezone,
    routing: row.routing,
    spreadsheetId: row.spreadsheetId,
    licenseStatus: row.licenseStatus
  };

  const binding = validateMasjidLicenseBinding_(requestedRouting);
  result.binding = binding;

  const opened = SpreadsheetApp.openById(binding.spreadsheetId);
  const panels = opened.getSheetByName('panels');

  result.openedSpreadsheet = {
    id: opened.getId(),
    name: opened.getName(),
    panelsExists: !!panels,
    lokasi: panels ? panels.getRange('C5:C10').getDisplayValues().map(function(row) {
      return String(row[0] || '').trim();
    }) : []
  };

  return result;
}
