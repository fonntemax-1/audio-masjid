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

      case 'getEventAdvertisingConfig':
        result = getEventAdvertisingConfigFromApi_();
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

      case 'getPanelKegiatanRows': {
        var kegiatanSheet = getSpreadsheet().getSheetByName('panels');
        result = kegiatanSheet ? kegiatanSheet.getRange('C28:C32').getDisplayValues().map(function(row) { return row[0] == null ? '' : String(row[0]); }) : ['', '', '', '', ''];
        break;
      }

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

      case 'getEventRunningTextRows': {
        var runningSheet = getSpreadsheet().getSheetByName('panels');
        result = runningSheet ? runningSheet.getRange('B35:B39').getDisplayValues().map(function(row) { return row[0] == null ? '' : String(row[0]); }) : ['', '', '', '', ''];
        break;
      }

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

      case 'validateRemotePin':
        result = validateRemotePinFromApi_(params);
        break;

      case 'resolveCoordinatesCity':
        result = resolveCoordinatesCityFromApi_(params);
        break;

      case 'resolveGoogleMapsLinkCity':
        result = resolveGoogleMapsLinkCityFromApi_(params);
        break;

      case 'setRemoteCell':
        result = setRemoteCellFromApi_(params);
        break;

      case 'setRemoteCells':
        result = setRemoteCellsFromApi_(params);
        break;

      case 'getQrisImageVersion':
        result = {
          version: String(PropertiesService.getScriptProperties().getProperty('QRIS_IMAGE_VERSION') || '0')
        };
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
 function validateRemotePinFromApi_(params) {
  params = params || {};
  var configuredPin = String(PropertiesService.getScriptProperties().getProperty('REMOTE_CONTROL_PIN') || '');
  var suppliedPin = String(params.pin || '');
  if (!configuredPin || configuredPin.length < 6) {
    throw new Error('Remote belum diaktifkan. Atur Script Property REMOTE_CONTROL_PIN (minimal 6 karakter).');
  }
  if (!suppliedPin || suppliedPin !== configuredPin) {
    throw new Error('PIN remote salah.');
  }
  return { valid: true };
}

function resolveGoogleMapsLinkCityFromApi_(params) {
  params = params || {};
  var configuredPin = String(PropertiesService.getScriptProperties().getProperty('REMOTE_CONTROL_PIN') || '');
  var suppliedPin = String(params.pin || '');
  if (!configuredPin || configuredPin.length < 6) throw new Error('Remote belum diaktifkan. Atur Script Property REMOTE_CONTROL_PIN.');
  if (!suppliedPin || suppliedPin !== configuredPin) throw new Error('PIN remote salah.');

  var url = String(params.mapsUrl || '').trim();
  if (!/^https?:\/\//i.test(url) || url.length > 2000) throw new Error('Link Google Maps tidak valid.');
  var current = url;
  var coords = null;
  var placeTextCandidates = [];
  var resolverDiagnostics = [];

  // URL dan HTML diproses berbeda. HTML Google Maps sering memuat @lat,lng
  // sebagai pusat/viewport peta, bukan lokasi pin yang dibagikan.
  // Karena itu, pola @lat,lng tidak pernah dibaca dari HTML.
  function findCoordinates_(text, isUrl) {
    var candidates = [String(text || '')];
    var cleaned = candidates[0]
      .replace(/&amp;/gi, '&')
      .replace(/&#x3d;|&#61;/gi, '=')
      .replace(/&#x26;|&#38;/gi, '&')
      .replace(/\\u003d/gi, '=')
      .replace(/\\u0026/gi, '&')
      .replace(/\\u002f/gi, '/')
      .replace(/\\\//g, '/')
      .replace(/\\x3d/gi, '=')
      .replace(/\\x26/gi, '&');
    if (cleaned !== candidates[0]) candidates.push(cleaned);
    try {
      var decodedOnce = decodeURIComponent(cleaned);
      if (candidates.indexOf(decodedOnce) < 0) candidates.push(decodedOnce);
      try {
        var decodedTwice = decodeURIComponent(decodedOnce);
        if (candidates.indexOf(decodedTwice) < 0) candidates.push(decodedTwice);
      } catch (ignoreTwice) {}
    } catch (ignoreOnce) {}

    for (var ci = 0; ci < candidates.length; ci++) {
      var candidate = candidates[ci];
      var patterns = [
        // Format pin spesifik Google Maps.
        /!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/i,
        // Beberapa tautan memakai urutan !2dLONGITUDE!3dLATITUDE.
        /!2d(-?\d{1,3}(?:\.\d+)?)!3d(-?\d{1,2}(?:\.\d+)?)/i,
        // Parameter tujuan eksplisit; jangan gunakan center/origin yang bisa
        // menunjuk posisi peta atau titik awal perjalanan.
        /[?&](?:q|query|destination|daddr)=(-?\d{1,2}(?:\.\d+)?)[,%2C\s]+(-?\d{1,3}(?:\.\d+)?)/i
      ];
      if (isUrl) {
        // @lat,lng hanya dipertimbangkan pada URL, tidak pada isi HTML.
        // HTML Maps dapat memuat koordinat viewport yang tidak terkait pin.
        patterns.push(/@(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
      }
      for (var pi = 0; pi < patterns.length; pi++) {
        var m = candidate.match(patterns[pi]);
        if (!m) continue;
        var lat = Number(m[1]), lng = Number(m[2]);
        if (pi === 1 && /!2d/i.test(patterns[pi].source)) {
          lat = Number(m[2]);
          lng = Number(m[1]);
        }
        if (isFinite(lat) && lat >= -90 && lat <= 90 && isFinite(lng) && lng >= -180 && lng <= 180) {
          return { latitude: lat, longitude: lng };
        }
      }
    }
    return null;
  }

  for (var hop = 0; hop < 8; hop++) {
    var hostMatch = current.match(/^https?:\/\/([^\/?#]+)/i);
    if (!hostMatch) throw new Error('Format Link Google Maps tidak valid.');
    var host = hostMatch[1].toLowerCase().replace(/:\d+$/, '');
    var allowed = host === 'maps.app.goo.gl' || host === 'goo.gl' ||
      host === 'google.com' || host.endsWith('.google.com') ||
      host === 'google.co.id' || host.endsWith('.google.co.id') ||
      host === 'maps.google.com' || host === 'maps.google.co.id';
    if (!allowed) throw new Error('Gunakan link dari Google Maps.');

    coords = findCoordinates_(current, true);
    if (coords) break;

    var response;
    try {
      response = UrlFetchApp.fetch(current, {
        method: 'get',
        followRedirects: false,
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TVSholat/1.0)' }
      });
    } catch (err) {
      throw new Error('Link Google Maps tidak dapat dibuka oleh server.');
    }

    var status = response.getResponseCode();
    resolverDiagnostics.push('redirect HTTP ' + status + ' host ' + host);
    var headers = response.getHeaders() || {};
    var location = headers.Location || headers.location || '';
    if (status >= 300 && status < 400 && location) {
      var nextLocation = String(location).trim();
      if (nextLocation.indexOf('//') === 0) {
        nextLocation = 'https:' + nextLocation;
      } else if (!/^https?:\/\//i.test(nextLocation)) {
        var originMatch = current.match(/^(https?:\/\/[^\/]+)/i);
        if (!originMatch) throw new Error('Arah link Google Maps tidak valid.');
        if (nextLocation.charAt(0) === '/') {
          nextLocation = originMatch[0] + nextLocation;
        } else if (nextLocation.charAt(0) === '?') {
          nextLocation = current.split('?')[0].split('#')[0] + nextLocation;
        } else {
          var currentPath = current.split('?')[0].split('#')[0];
          currentPath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
          nextLocation = currentPath + nextLocation;
        }
      }
      current = nextLocation;
      continue;
    }

    var body = '';
    try { body = response.getContentText() || ''; } catch (ignoreBody) {}
    coords = findCoordinates_(body, false);
    if (coords) break;

    // Short link kadang menaruh URL tujuan di script/JSON, bukan di href.
    // Normalisasi escape umum dan URL-encoding sebelum mencari URL tujuan.
    var bodyVariants = [body];
    var normalizedBody = body
      .replace(/&amp;/gi, '&')
      .replace(/\\u003d/gi, '=')
      .replace(/\\u0026/gi, '&')
      .replace(/\\u002f/gi, '/')
      .replace(/\\\//g, '/')
      .replace(/&#x3d;|&#61;/gi, '=');
    if (normalizedBody !== body) bodyVariants.push(normalizedBody);
    try {
      var decodedBody = decodeURIComponent(normalizedBody);
      if (bodyVariants.indexOf(decodedBody) < 0) bodyVariants.push(decodedBody);
      try {
        var decodedBody2 = decodeURIComponent(decodedBody);
        if (bodyVariants.indexOf(decodedBody2) < 0) bodyVariants.push(decodedBody2);
      } catch (ignoreDecode2) {}
    } catch (ignoreDecode1) {}

    var target = '';
    for (var bv = 0; bv < bodyVariants.length && !target; bv++) {
      var variant = bodyVariants[bv];

      // Simpan metadata alamat/nama tempat sebagai fallback jika short link
      // tidak menampilkan koordinat di header redirect atau URL tujuan.
      // Urutan atribut HTML tidak tetap: content dapat muncul sebelum property/name.
      // Parse tag meta satu per satu agar kedua urutan didukung.
      var metaTagRegex = /<meta\b[^>]*>/gi;
      var metaTag;
      while ((metaTag = metaTagRegex.exec(variant)) !== null) {
        var tag = metaTag[0];
        var keyMatch = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i);
        var contentMatch = tag.match(/content\s*=\s*["']([^"']{3,500})["']/i);
        var metaKey = keyMatch ? keyMatch[1].toLowerCase() : '';
        if (contentMatch && (metaKey === 'og:description' || metaKey === 'description' ||
            metaKey === 'og:title' || metaKey === 'twitter:title' || metaKey === 'twitter:description')) {
          var metaText = contentMatch[1]
            .replace(/&amp;/gi, '&')
            .replace(/&#39;|&apos;/gi, "'")
            .replace(/&quot;/gi, '"')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          metaText = metaText.replace(/\s*[-|–]\s*Google Maps\s*$/i, '').trim();
          if (metaText && !/^(google maps|maps|google)$/i.test(metaText) &&
              placeTextCandidates.indexOf(metaText) < 0) {
            placeTextCandidates.push(metaText);
          }
        }
      }
      var titleMatch = variant.match(/<title[^>]*>([^<]{3,250})<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        var titleText = titleMatch[1].replace(/&amp;/gi, '&').replace(/\s+/g, ' ')
          .replace(/\s*[-|–]\s*Google Maps\s*$/i, '').trim();
        if (titleText && !/^(google maps|maps|google)$/i.test(titleText) &&
            placeTextCandidates.indexOf(titleText) < 0) {
          placeTextCandidates.push(titleText);
        }
      }

      // Coba koordinat pin eksplisit setelah encoding dinormalisasi.
      coords = findCoordinates_(variant, false);
      if (coords) break;

      // Google kadang menampilkan halaman perantara, bukan HTTP redirect.
      // Coba meta-refresh, canonical, dan og:url terlebih dahulu.
      var targetMatch = variant.match(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]+content\s*=\s*["'][^"']*?url\s*=\s*([^"'\s>]+)[^>]*>/i);
      if (targetMatch && targetMatch[1]) target = targetMatch[1];
      if (!target) {
        targetMatch = variant.match(/<link[^>]+rel\s*=\s*["']?canonical["']?[^>]+href\s*=\s*["']([^"']+)["']/i);
        if (targetMatch && targetMatch[1]) target = targetMatch[1];
      }
      if (!target) {
        targetMatch = variant.match(/<meta[^>]+property\s*=\s*["']og:url["'][^>]+content\s*=\s*["']([^"']+)["']/i);
        if (targetMatch && targetMatch[1]) target = targetMatch[1];
      }
      if (!target) {
        targetMatch = variant.match(/(?:href|content|url|window\.location(?:\.href)?|location\.href)\s*[:=]\s*["']?((?:https?:)?\/\/[^"'<> ]*(?:maps\.google|google\.com\/maps)[^"'<> ]*)/i);
        if (targetMatch && targetMatch[1]) target = targetMatch[1];
      }
      if (!target) {
        targetMatch = variant.match(/["']((?:https?:)?\\?\/\\?\/(?:www\.)?(?:google\.[^/]+|maps\.google\.[^/]+)[^"']*)["']/i);
        if (targetMatch && targetMatch[1]) target = targetMatch[1];
      }
      if (!target) {
        targetMatch = variant.match(/https?:\/\/(?:www\.)?(?:google\.[a-z.]+|maps\.google\.[a-z.]+)\/[^"'<> ]*/i);
        if (targetMatch && targetMatch[0]) target = targetMatch[0];
      }
    }
    if (coords) break;
    if (target) {
      target = target.replace(/&amp;/gi, '&').replace(/\\\//g, '/').replace(/\\u0026/gi, '&');
      if (target.indexOf('//') === 0) target = 'https:' + target;
      if (/^https?:\/\//i.test(target)) {
        current = target;
        continue;
      }
    }
    break;
  }

  // Fallback terakhir: geocode metadata tempat/alamat dari halaman Google Maps.
  // Hanya dipakai jika tidak ada koordinat eksplisit yang ditemukan.
  if (!coords && placeTextCandidates.length) {
    var geocoder = Maps.newGeocoder().setLanguage('id');
    for (var pc = 0; pc < placeTextCandidates.length && !coords; pc++) {
      var candidateText = placeTextCandidates[pc];
      // Abaikan deskripsi generik Google Maps yang bukan alamat tempat.
      if (/^(find local businesses|search google maps|google maps|view maps and get driving directions)/i.test(candidateText)) continue;
      try {
        var geocodeResult = geocoder.geocode(candidateText);
        var geocodeRows = geocodeResult && geocodeResult.results ? geocodeResult.results : [];
        if (geocodeRows.length && geocodeRows[0].geometry && geocodeRows[0].geometry.location) {
          var point = geocodeRows[0].geometry.location;
          var pointLat = Number(point.lat);
          var pointLng = Number(point.lng);
          if (isFinite(pointLat) && pointLat >= -90 && pointLat <= 90 &&
              isFinite(pointLng) && pointLng >= -180 && pointLng <= 180) {
            coords = { latitude: pointLat, longitude: pointLng };
          }
        }
      } catch (ignoreGeocodeText) {}
    }
  }


  // FALLBACK JUDUL HALAMAN:
  // Jika redirect/metadata tidak memberi koordinat, ikuti short link sampai akhir,
  // baca <title> seperti fungsi EXTRACT_BY_TITLE, lalu geocode nama tempat.
  // Tetap gunakan koordinat hasil geocoding untuk menentukan wilayah C14;
  // judul halaman tidak langsung ditulis ke C14 agar formatnya konsisten.
  if (!coords) {
    try {
      var titleResponse = UrlFetchApp.fetch(url, {
        method: 'get',
        followRedirects: true,
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TVSholat/1.0)' }
      });
      var titleStatus = titleResponse.getResponseCode();
      resolverDiagnostics.push('title HTTP ' + titleStatus);
      if (titleStatus >= 200 && titleStatus < 400) {
        var titleHtml = titleResponse.getContentText() || '';
        var titleMatch = titleHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          var pageTitle = titleMatch[1]
            .replace(/&amp;/gi, '&')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;|&apos;/gi, "'")
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/\s*[-–|]\s*Google Maps\s*$/i, '')
            .replace(/\s+/g, ' ')
            .trim();
          if (pageTitle && !/^(google maps|maps|google)$/i.test(pageTitle)) {
            resolverDiagnostics.push('judul terbaca: ' + pageTitle.substring(0, 120));
            if (placeTextCandidates.indexOf(pageTitle) < 0) {
              placeTextCandidates.unshift(pageTitle);
            }
            try {
              var titleGeocoder = Maps.newGeocoder().setLanguage('id');
              var titleGeocode = titleGeocoder.geocode(pageTitle);
              var titleRows = titleGeocode && titleGeocode.results ? titleGeocode.results : [];
              if (titleRows.length && titleRows[0].geometry && titleRows[0].geometry.location) {
                var titlePoint = titleRows[0].geometry.location;
                var titleLat = Number(titlePoint.lat);
                var titleLng = Number(titlePoint.lng);
                if (isFinite(titleLat) && titleLat >= -90 && titleLat <= 90 &&
                    isFinite(titleLng) && titleLng >= -180 && titleLng <= 180) {
                  coords = { latitude: titleLat, longitude: titleLng };
                }
              }
            } catch (titleGeocodeError) { resolverDiagnostics.push('geocode judul: ' + String(titleGeocodeError).substring(0, 180)); }
          }
        }
      }
    } catch (titleFetchError) {
      resolverDiagnostics.push('fetch judul: ' + String(titleFetchError).substring(0, 180));
    }
  }

  if (!coords) {
    var diagnosticText = resolverDiagnostics.length ? ' Detail: ' + resolverDiagnostics.slice(-5).join(' | ') : ' Tidak ada redirect/metadata yang terbaca.';
    if (placeTextCandidates.length) diagnosticText += ' Kandidat nama: ' + placeTextCandidates.slice(0, 3).join(' / ').substring(0, 220);
    throw new Error('Google Maps belum memberikan koordinat yang bisa dipakai untuk menentukan wilayah C14.' + diagnosticText + ' Gunakan tautan Bagikan pada pin tempat atau tautan Google Maps lengkap.');
  }

  return resolveCoordinatesCityFromApi_({
    pin: suppliedPin,
    latitude: String(coords.latitude),
    longitude: String(coords.longitude)
  });
}

function resolveCoordinatesCityFromApi_(params) {
  params = params || {};
  var configuredPin = String(PropertiesService.getScriptProperties().getProperty('REMOTE_CONTROL_PIN') || '');
  var suppliedPin = String(params.pin || '');
  if (!configuredPin || configuredPin.length < 6) {
    throw new Error('Remote belum diaktifkan. Atur Script Property REMOTE_CONTROL_PIN.');
  }
  if (!suppliedPin || suppliedPin !== configuredPin) throw new Error('PIN remote salah.');

  var lat = Number(params.latitude);
  var lng = Number(params.longitude);
  if (!isFinite(lat) || lat < -90 || lat > 90 || !isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error('Latitude atau Longitude tidak valid.');
  }

  var response = Maps.newGeocoder().setLanguage('id').reverseGeocode(lat, lng);
  var results = response && response.results ? response.results : [];
  if (!results.length) throw new Error('Koordinat tidak menemukan nama kota.');

  var areaName = '';
  var regencyName = '';
  var fallbackName = '';

  // Utamakan nama wilayah/kecamatan lalu kabupaten/kota.
  // Reverse geocoder menggunakan bahasa Indonesia; provinsi sengaja tidak dipakai.
  results.some(function(result) {
    var components = result.address_components || [];
    components.forEach(function(component) {
      var types = component.types || [];
      var name = String(component.long_name || '').trim();
      if (!name) return;

      if (!areaName && (
        types.indexOf('locality') >= 0 ||
        types.indexOf('sublocality') >= 0 ||
        types.indexOf('sublocality_level_1') >= 0 ||
        types.indexOf('administrative_area_level_3') >= 0 ||
        types.indexOf('neighborhood') >= 0
      )) {
        areaName = name;
      }

      if (!regencyName && types.indexOf('administrative_area_level_2') >= 0) {
        regencyName = name;
      }

      if (!fallbackName && (
        types.indexOf('administrative_area_level_2') >= 0 ||
        types.indexOf('locality') >= 0 ||
        types.indexOf('administrative_area_level_3') >= 0
      )) {
        fallbackName = name;
      }
    });

    return !!(areaName && regencyName);
  });

  var cityName = '';
  if (areaName && regencyName && areaName.toLowerCase() !== regencyName.toLowerCase()) {
    cityName = areaName + ', ' + regencyName;
  } else {
    cityName = areaName || regencyName || fallbackName;
  }

  // Normalisasi nama wilayah, lalu hilangkan awalan administratif agar C14 ringkas.
  cityName = String(cityName || '')
    .replace(/\bBandung Regency\b/gi, 'Kabupaten Bandung')
    .replace(/\bWest Java\b/gi, 'Jawa Barat')
    .replace(/\bEast Java\b/gi, 'Jawa Timur')
    .replace(/\bCentral Java\b/gi, 'Jawa Tengah')
    .replace(/\bRegency\b/gi, 'Kabupaten')
    .replace(/\bCity of\s+/gi, 'Kota ')
    .trim();

  // Hilangkan awalan administratif dari nama area agar C14 ringkas.
  // Contoh: "Kecamatan Balikpapan Kota" menjadi "Balikpapan Kota".
  areaName = String(areaName || '')
    .replace(/^Kecamatan\s+/i, '')
    .replace(/^Kelurahan\s+/i, '')
    .replace(/^Desa\s+/i, '')
    .trim();

  // C14 cukup menampilkan "nama wilayah, nama kabupaten/kota" tanpa label administratif.
  // Contoh: "Jatinangor, Sumedang" bukan "Jatinangor, Kabupaten Sumedang".
  if (areaName && regencyName && areaName.toLowerCase() !== regencyName.toLowerCase()) {
    var shortRegencyName = String(regencyName)
      .replace(/^Kabupaten\s+/i, '')
      .replace(/^Kota\s+/i, '')
      .replace(/^Kabupaten\s+/i, '')
      .replace(/\s+Regency$/i, '')
      .trim();
    if (shortRegencyName) cityName = areaName + ', ' + shortRegencyName;
  } else {
    cityName = String(cityName)
      .replace(/^Kabupaten\s+/i, '')
      .replace(/^Kota\s+/i, '')
      .replace(/\s+Regency$/i, '')
      .trim();
  }

  if (!cityName) throw new Error('Nama wilayah/kabupaten tidak tersedia untuk koordinat tersebut.');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSpreadsheet().getSheetByName('panels');
    if (!sheet) throw new Error('Sheet panels tidak ditemukan.');
    sheet.getRange('C14').setValue(cityName);
    SpreadsheetApp.flush();
    var actual = sheet.getRange('C14').getDisplayValue();
    if (String(actual).trim() !== cityName) throw new Error('Nama kota gagal diverifikasi pada C14.');
    return { success: true, city: actual, cell: 'C14', latitude: lat, longitude: lng };
  } finally {
    lock.releaseLock();
  }
}

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
function setRemoteCellsFromApi_(params) {
  params = params || {};
  var configuredPin = String(PropertiesService.getScriptProperties().getProperty('REMOTE_CONTROL_PIN') || '');
  var suppliedPin = String(params.pin || '');
  if (!configuredPin || configuredPin.length < 6) {
    throw new Error('Remote belum diaktifkan. Atur Script Property REMOTE_CONTROL_PIN (minimal 6 karakter).');
  }
  if (!suppliedPin || suppliedPin !== configuredPin) throw new Error('PIN remote salah.');

  var items;
  try { items = JSON.parse(String(params.cells || '[]')); }
  catch (e) { throw new Error('Data update remote tidak valid.'); }
  if (!Array.isArray(items) || !items.length || items.length > 30) {
    throw new Error('Daftar sel update tidak valid (maksimal 30 sel).');
  }

  items = items.map(function(item) {
    var cell = String(item && item.cell || '').trim().toUpperCase();
    var value = item && item.value !== undefined && item.value !== null ? String(item.value) : '';
    if (!isAllowedRemoteCell_(cell)) throw new Error('Lokasi sel tidak diizinkan untuk remote: ' + cell);
    if (value.length > 500) throw new Error('Nilai terlalu panjang pada sel ' + cell + ' (maksimal 500 karakter).');
    return { cell: cell, value: value };
  });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName('panels');
    if (!sheet) throw new Error('Sheet panels tidak ditemukan.');
    items.forEach(function(item) { sheet.getRange(item.cell).setValue(item.value); });
    SpreadsheetApp.flush();
    var timeZone = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone() || 'Asia/Makassar';
    function canonicalDate_(value) {
      var text = String(value == null ? '' : value).trim();
      var m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
      m = text.match(/^(\d{1,2})[\/. -](\d{1,2})[\/. -](\d{4})$/);
      if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
      return null;
    }
    var saved = items.map(function(item) {
      var range = sheet.getRange(item.cell);
      var actualValue = range.getValue();
      var actualDisplay = range.getDisplayValue();
      var expectedDate = canonicalDate_(item.value);
      var actualDate = actualValue instanceof Date && !isNaN(actualValue.getTime())
        ? Utilities.formatDate(actualValue, timeZone, 'yyyy-MM-dd')
        : canonicalDate_(actualValue);
      var matches = expectedDate
        ? (actualDate === expectedDate || canonicalDate_(actualDisplay) === expectedDate)
        : String(actualValue == null ? '' : actualValue).trim() === String(item.value).trim()
          || String(actualDisplay == null ? '' : actualDisplay).trim() === String(item.value).trim();
      if (!matches) {
        throw new Error('Verifikasi gagal pada sel ' + item.cell + '. Nilai aktual: ' + String(actualDisplay));
      }
      return { cell: item.cell, value: actualDisplay };
    });
    return { success: true, count: saved.length, cells: saved, updatedAt: new Date().toISOString() };
  } finally {
    lock.releaseLock();
  }
}

 function isAllowedRemoteCell_(cell) {
   var allowed = new Set([
     'C2','C5','C6','C7','C8','C9','C10','C12','C13','C14','C15','C27','C16','C18','C20','F20','C22','C26','C28','C29','C30','C31','C32','C41','C42','C43','C57','G57',
     'B35','B36','B37','B38','B39','C60','D60','E60','C61','D61','E61','C62','D62','E62',
     'C63','D63','E63','B64','C64','D64','E64','C68','D68','E68','C69','D69','E69','B70','C70','D70','E70','B71','C71','D71','E71','B72','C72','D72','E72'
   ]);
   return allowed.has(String(cell || '').toUpperCase());
 }

function getEventAdvertisingConfigFromApi_() {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName('panels');
    if (!sheet) throw new Error('Sheet panels tidak ditemukan.');
    var values = sheet.getRange('C68:E72').getValues();
    var displays = sheet.getRange('C68:E72').getDisplayValues();
    var timeZone = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone() || 'Asia/Makassar';
    function normalizeDate(value, display) {
      if (value instanceof Date && !isNaN(value.getTime())) {
        return Utilities.formatDate(value, timeZone, 'yyyy-MM-dd');
      }
      var text = String(display || value || '').trim();
      if (!text) return '';
      var m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
      m = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
      if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
      return '';
    }
    return values.map(function(row, index) {
      var display = displays[index] || [];
      var sheetRow = index + 68;
      var status = String(row[2] == null ? display[2] || '' : row[2]).trim().toUpperCase();
      return {
        row: sheetRow,
        start: normalizeDate(row[0], display[0]),
        end: normalizeDate(row[1], display[1]),
        status: status === 'ON' ? 'ON' : 'OFF'
      };
    });
  } catch (error) {
    Logger.log('EVENT ADVERTISING CONFIG ERROR: ' + (error && error.message ? error.message : error));
    return [];
  }
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
