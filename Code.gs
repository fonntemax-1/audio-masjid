
// =========================================================
// DIGITAL SIGNAGE MASJID AL SOBIRIN
// CODE.GS
// =========================================================


// =========================================================
// WEB APP
// =========================================================

function doGet(e) {
  // API GitHub Pages ditangani oleh API.gs.
  const params = e && e.parameter ? e.parameter : {};

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

    const lokasi = {
      kota: values[0] || '',
      provinsi: values[1] || '',
      zona: values[2] || '',
      timezone: values[3] || '',
      gmt: values[4] || '',
      slug: values[5] || ''
    };

    Logger.log('LOKASI PANELS = ' + JSON.stringify(lokasi));

    return {
      success: true,
      kota: lokasi.kota,
      provinsi: lokasi.provinsi,
      zona: lokasi.zona,
      timezone: lokasi.timezone,
      gmt: lokasi.gmt,
      slug: lokasi.slug
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


function getSpreadsheet() {
  const spreadsheetId =
    PropertiesService
      .getScriptProperties()
      .getProperty('SPREADSHEET_ID');

  if (!spreadsheetId) {
    throw new Error(
      'SPREADSHEET_ID belum diisi pada Script Properties.'
    );
  }

  return SpreadsheetApp
    .openById(spreadsheetId);
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


function getDataFromSheet() {
  try {
    const ss = getSpreadsheet();
    const result = {};

    // =====================================================
    // KONTROL TAMPILAN RAMADAN
    // Dibaca dari Script Properties:
    // RAMADAN_DISPLAY = true / false
    //
    // Pengaturan ini hanya memengaruhi DISPLAY Ramadan.
    // Tidak mengubah schedule, durasi, urutan, atau proses AUDIO.
    // =====================================================

    result.RamadanDisplay = getRamadanDisplaySetting();

    // Lokasi aktif dari panels!C5:C10 untuk timezone/date di GitHub Pages.
    // Tidak mengubah scheduler audio.
    result.Lokasi = getLokasiPanels();

    Logger.log('LOKASI API = ' + JSON.stringify(result.Lokasi));

    // =====================================================
    // HEADER MASJID - panels!B12:C16
    // =====================================================
    const headerSheet = ss.getSheetByName('panels');
    if (headerSheet) {
      const headerValues = headerSheet.getRange('B12:C16').getDisplayValues();
      const headerData = {};

      headerValues.forEach(function(row) {
        const key = String(row[0] || '').trim().toUpperCase();
        const value = String(row[1] || '').trim();
        if (key) headerData[key] = value;
      });

      result.Nama = headerData.NAMA || '';
      result.Alamat = headerData.ALAMAT || '';
      result.Kota = headerData.KOTA || '';
      result['No. Telp'] = headerData['NO HP'] || '';
      result.Slogan = headerData.SLOGAN || '';

      Logger.log('PANELS HEADER B12:C16 = ' + JSON.stringify({
        Nama: result.Nama,
        Alamat: result.Alamat,
        Kota: result.Kota,
        NoTelp: result['No. Telp'],
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
    // DEFAULT YOUTUBE
    // =====================================================

    result.Youtube = '';

    // =====================================================
    // DEFAULT KONTROL SUARA YOUTUBE
    // false = UNMUTE
    // true  = MUTE
    // =====================================================

    result.YoutubeMute = false;

    // =====================================================
    // KONFIGURASI KONTROL YOUTUBE
    // Youtube!B1 = LINK YOUTUBE
    // Youtube!C1 = STATUS: AUTO / ON / OFF / STOP
    //
    // 5 menit sebelum QIROAH = aturan tetap sistem.
    // Tidak lagi membaca C1 sebagai angka detik.
    // =====================================================

    result.YoutubeStatus = 'AUTO';
    result.YoutubeMuteBeforeQiroahSeconds = 300;
    result.YoutubeControlLocked = false;

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

    // =====================================================
    // INFAQ & SHADAQAH
    // Sumber: sheet "infaq", range B1:B3
    // =====================================================
    result.Infaq = [];
    // Event: A=EVENT, B=ANGKA DURASI HITUNGAN HARI, C=STATUS, D=KETERANGAN.
    // Kolom B adalah angka konfigurasi; kolom D hanya keterangan.
    result.Event = [];

    const targetSheets = [
      'Nama_Mesjid',
      'Keuangan',
      'infaq',
      "Jum'at",
      'Event',
      'Running_Text',
      'youtube',
      'Adzan',
      'panels'
    ];

    // -------------------------------------------------------
    // BACA SHEET YANG DIBUTUHKAN
    // -------------------------------------------------------

    targetSheets.forEach(
      function(sheetName) {

        const sheet =
          ss.getSheetByName(
            sheetName
          );

        if (!sheet) {

          Logger.log(
            'Sheet tidak ditemukan: ' +
            sheetName
          );

          return;
        }

        const data =
          sheet
            .getDataRange()
            .getValues();

        if (
          !data ||
          data.length === 0
        ) {

          Logger.log(
            'Sheet kosong: ' +
            sheetName
          );

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

          // ---------------------------------------------------
          // AMBIL TANGGAL LAPORAN DARI KEUANGAN!E1
          // ---------------------------------------------------

          const keuanganTanggalRaw =
            sheet
              .getRange('E1')
              .getValue();

          if (
            keuanganTanggalRaw instanceof Date
          ) {

            result.KeuanganTanggal =
              formatTanggalIndonesia(
                keuanganTanggalRaw
              );

          } else if (
            keuanganTanggalRaw !== null &&
            keuanganTanggalRaw !== undefined
          ) {

            result.KeuanganTanggal =
              keuanganTanggalRaw
                .toString()
                .trim();

          } else {

            result.KeuanganTanggal =
              '';
          }


          for (
            let r = 0;
            r < data.length;
            r++
          ) {

            const row = [];

            for (
              let c = 0;
              c < data[r].length;
              c++
            ) {

              let value =
                data[r][c];

              // FORMAT DATE
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

              // KONVERSI KE STRING
              if (
                value !== null &&
                value !== undefined
              ) {

                value =
                  value
                    .toString();

              } else {

                value = '';
              }

              row.push(
                value
              );
            }


            // CEK BARIS MEMILIKI ISI
            const hasContent =
              row.some(
                function(cell) {

                  return (
                    cell !== null &&
                    cell !== undefined &&
                    cell
                      .toString()
                      .trim() !== ''
                  );

                }
              );

            if (hasContent) {

              result.Keuangan.push(
                row
              );
            }
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
        // KHUSUS SHEET EVENT
        // A = EVENT
        // B = ANGKA DURASI HITUNGAN HARI
        // C = STATUS ON/OFF
        // D = KETERANGAN
        // =====================================================

        if (
          sheetName === 'Event'
        ) {

          result.Event = [];

          for (
            let r = 1;
            r < data.length;
            r++
          ) {

            const row = data[r] || [];

            const eventName =
              String(row[0] == null ? '' : row[0]).trim();

            const daysRaw =
              row[1] == null ? '' : row[1];

            const status =
              String(row[2] == null ? '' : row[2]).trim().toUpperCase();

            const description =
              String(row[3] == null ? '' : row[3]).trim();

            if (!eventName) {
              continue;
            }

            let days =
              Number(String(daysRaw).replace(',', '.').trim());

            if (!Number.isFinite(days)) {
              days = 0;
            }

            result.Event.push({
              event: eventName,
              days: days,
              status: status,
              description: description
            });
          }

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
        // KHUSUS SHEET YOUTUBE
        // =====================================================

        if (
          sheetName === 'youtube'
        ) {

          processYoutubeSheet(
            data,
            result
          );

          // Youtube!B1 = LINK YOUTUBE
    // Youtube!C1 = STATUS AUTO / ON / OFF.
    // AUTO: mute 5 menit sebelum Qiroah, unmute 30 menit
    // setelah IQOMAH selesai.
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

          // Kolom A:B = URL audio.
          processKeyAudioSheet(
            sheet,
            result
          );

          // Kolom D:R = urutan audio + durasi.
          // Nilai durasi berasal LANGSUNG dari Spreadsheet.
          // 0 berarti event/gap dilewati.
          processAdzanScheduleSheet(
            sheet,
            result
          );

          // Kolom T:U = kontrol suara ON/OFF.
          // OFF hanya membuat audio mute; event/durasi tetap berjalan.
          processAdzanAudioStatusSheet(
            sheet,
            result
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
    // EVENT - BACA ULANG SECARA EKSPLISIT
    // =====================================================
    // Ini menjadi sumber final result.Event untuk GitHub Pages.
    // Tidak menyentuh AudioSchedule, AudioStatus, atau proses audio.
    result.Event = getEventSheetData_(ss);

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
    // DEBUG HASIL AKHIR
    // =====================================================

    Logger.log(
      '=== GET DATA SHEET SELESAI ==='
    );

    Logger.log(
      'Data result: ' +
      JSON.stringify(
        result
      )
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
  const sheet = ss.getSheetByName('Event');

  if (!sheet) {
    Logger.log('EVENT: Sheet Event tidak ditemukan.');
    return output;
  }

  // ==========================================================
  // STRUKTUR EVENT YANG DIGUNAKAN DISPLAY
  //
  // A8:A11 = nama event
  // B8:B11 = jumlah hari / batas mulai countdown
  // C8:C11 = AUTO / OFF
  //
  // D tidak digunakan sebagai pengaturan countdown.
  // ==========================================================

  const values =
    sheet
      .getRange(8, 1, 4, 4)
      .getValues();

  for (let r = 0; r < values.length; r++) {
    const row = values[r] || [];

    const eventName =
      String(row[0] == null ? '' : row[0]).trim();

    if (!eventName) continue;

    const daysRaw =
      row[1] == null ? '' : row[1];

    const status =
      String(row[2] == null ? '' : row[2])
        .trim()
        .toUpperCase();

    const description =
      String(row[3] == null ? '' : row[3]).trim();

    let days =
      Number(
        String(daysRaw)
          .replace(',', '.')
          .trim()
      );

    if (!Number.isFinite(days)) {
      days = 0;
    }

    output.push({
      row: r + 8,
      event: eventName,
      days: days,
      status: status,
      description: description
    });
  }

  Logger.log(
    'EVENT B8:C11 READ = ' +
    JSON.stringify(output)
  );

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


function getRealtimeAudioConfig() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Adzan');

    if (!sheet) {
      return {
        success: false,
        error: 'Sheet Adzan tidak ditemukan.'
      };
    }

    SpreadsheetApp.flush();

    const lastRow = Math.max(sheet.getLastRow(), 1);
    const data = sheet
      .getRange(1, 1, lastRow, 27)
      .getValues();

    const result = {
      success: true,
      Audio: {},
      AudioSchedule: {
        SUBUH_RAMADHAN: [],
        SUBUH_BIASA: [],
        DZUHUR: [],
        ASHAR: [],
        MAGHRIB_RAMADHAN: [],
        MAGHRIB_BIASA: [],
        ISYA: []
      },
      AudioDurations: {},
      AudioFriday: [],
      AudioStatus: {
        qiroah: 'ON',
        tarhim: 'ON',
        beep: 'ON',
        adzan: 'ON',
        doa: 'ON',
        iqomah: 'ON',
        sirine: 'ON'
      }
    };

    // A:B = KEY + URL AUDIO. Jangan mengubah nilai URL.
    for (let r = 0; r < data.length; r++) {
      const key = String(data[r][0] == null ? '' : data[r][0])
        .trim()
        .toLowerCase();
      if (!key) continue;

      result.Audio[key] = String(data[r][1] == null ? '' : data[r][1]).trim();
    }

    const parsed = parseAdzanSheetV7(data);
    result.AudioSchedule = parsed.schedule;
    result.AudioFriday = parsed.friday;

    const genericDurations = {};
    Object.keys(parsed.schedule).forEach(function(prayerName) {
      parsed.schedule[prayerName].forEach(function(item) {
        let type = item.event;
        if (type === 'adzan-subuh') type = 'adzanSubuh';
        else if (type === 'adzan-biasa' || type === 'adzan') type = 'adzanBiasa';
        else if (type === 'tarhim') {
          type = prayerName === 'SUBUH' ? 'tarhimSubuh' : 'tarhimBiasa';
        }
        if (genericDurations[type] === undefined) {
          genericDurations[type] = item.duration;
        }
      });
    });
    result.AudioDurations = genericDurations;

    // STATUS per-event berasal dari sequence Sheet, bukan T:U.
    const summaryStatus = {
      qiroah: 'ON', tarhim: 'ON', beep: 'ON', adzan: 'ON',
      doa: 'ON', iqomah: 'ON', sirine: 'ON'
    };

    function statusCategory(event) {
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

    Object.keys(result.AudioSchedule).forEach(function(prayerName) {
      (result.AudioSchedule[prayerName] || []).forEach(function(item) {
        const category = statusCategory(item && item.event);
        if (category && String(item.status || 'ON').toUpperCase() === 'OFF') summaryStatus[category] = 'OFF';
      });
    });

    (result.AudioFriday || []).forEach(function(item) {
      const category = statusCategory(item && item.event);
      if (category && String(item.status || 'ON').toUpperCase() === 'OFF') summaryStatus[category] = 'OFF';
    });

    result.AudioStatus = summaryStatus;

    Logger.log('=== REALTIME AUDIO CONFIG FIX v2026-09-27 ===');
    Logger.log('AUDIO URL = ' + JSON.stringify(result.Audio));
    Logger.log('AUDIO SCHEDULE = ' + JSON.stringify(result.AudioSchedule));
    Logger.log('AUDIO DURATIONS = ' + JSON.stringify(result.AudioDurations));
    Logger.log('AUDIO FRIDAY = ' + JSON.stringify(result.AudioFriday));
    Logger.log('AUDIO STATUS = ' + JSON.stringify(result.AudioStatus));

    return result;

  } catch (error) {
    Logger.log('ERROR getRealtimeAudioConfig: ' + error);
    return {
      success: false,
      error: error && error.message ? error.message : String(error)
    };
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
    Utilities.formatDate(
      date,
      timezone,
      'dd'
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

function getPrayerSchedule(
  dateString
) {

  try {

    const timezone =
      'Asia/Makassar';

    if (!dateString) {

      dateString =
        Utilities.formatDate(
          new Date(),
          timezone,
          'yyyy-MM-dd'
        );
    }

    const apiUrl =
      'https://www.muslimkita.id/api/jadwal-sholat/v1/balikpapan' +
      '?tanggal=' +
      encodeURIComponent(
        dateString
      ) +
      '&metode=kemenag';

    Logger.log(
      'JADWAL SHOLAT: request ' +
      apiUrl
    );

    let response =
      UrlFetchApp.fetch(
        apiUrl,
        {
          method: 'get',
          muteHttpExceptions: true,
          followRedirects: true,
          headers: {
            'Accept':
              'application/json',
            'User-Agent':
              'Mozilla/5.0 (Google Apps Script)'
          }
        }
      );

    if (
      response.getResponseCode() !== 200
    ) {

      Logger.log(
        'JADWAL SHOLAT: HTTP ' +
        response.getResponseCode() +
        ' body=' +
        response.getContentText().slice(0, 500)
      );

      return {
        success: false,
        error:
          'HTTP ' +
          response.getResponseCode() +
          ' dari API MuslimKita'
      };
    }

    let json =
      JSON.parse(
        response.getContentText()
      );

    if (
      !json ||
      !json.jadwal
    ) {

      Logger.log(
        'JADWAL SHOLAT: response tidak memiliki object jadwal: ' +
        response.getContentText().slice(0, 1000)
      );

      return {
        success: false,
        error:
          'Data jadwal tidak tersedia.'
      };
    }

    const jadwalApi =
      json.jadwal;

    Logger.log(
      'JADWAL SHOLAT: data berhasil diterima tanggal=' +
      dateString +
      ' jadwal=' +
      JSON.stringify(jadwalApi)
    );

    return {
      success: true,
      kota:
        json.kota ||
        'Balikpapan',
      tanggal:
        dateString,
      timezone:
        json.timezone ||
        timezone,
      jadwal: {
        imsak:
          normalizePrayerTime(
            jadwalApi.imsak
          ),
        subuh:
          normalizePrayerTime(
            jadwalApi.subuh
          ),
        terbit:
          normalizePrayerTime(
            jadwalApi.terbit
          ),
        dzuhur:
          normalizePrayerTime(
            jadwalApi.dzuhur
          ),
        ashar:
          normalizePrayerTime(
            jadwalApi.ashar
          ),
        maghrib:
          normalizePrayerTime(
            jadwalApi.maghrib
          ),
        isya:
          normalizePrayerTime(
            jadwalApi.isya
          )
      }
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message
    };
  }
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
      'Event'
    );

  if (!sheet) {
    return '';
  }

  const values =
    sheet
      .getRange('A1:B4')
      .getDisplayValues();

  const result = [];

  values.forEach(
    function(row) {

      const label =
        row[0]
          ? row[0]
              .toString()
              .trim()
          : '';

      const value =
        row[1]
          ? row[1]
              .toString()
              .trim()
          : '';

      if (!value) {
        return;
      }

      if (!label) {
        result.push(
          value
        );
        return;
      }

      result.push(
        label +
        ': ' +
        value
      );
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
