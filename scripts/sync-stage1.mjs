const fs = require('node:fs');

const gasUrl = process.env.GAS_API_URL;
if (!gasUrl) throw new Error('GAS_API_URL belum diisi.');

async function callGas(action) {
  const callback = 'stage1SyncCallback';
  const url = new URL(gasUrl);
  url.searchParams.set('api', '1');
  url.searchParams.set('action', action);
  url.searchParams.set('callback', callback);
  url.searchParams.set('_ts', String(Date.now()));

  const response = await fetch(url, {
    headers: { 'User-Agent': 'audio-masjid-stage1-sync' }
  });

  if (!response.ok) {
    throw new Error(action + ': HTTP ' + response.status);
  }

  const text = await response.text();
  const prefix = callback + '(';
  const suffix = ');';
  const start = text.indexOf(prefix);
  const end = text.lastIndexOf(suffix);

  if (start < 0 || end < start) {
    throw new Error(action + ': respons JSONP tidak valid');
  }

  const payload = JSON.parse(text.slice(start + prefix.length, end));

  if (!payload || payload.success !== true) {
    throw new Error(action + ': ' + (payload && payload.error ? payload.error : 'API gagal'));
  }

  return payload.data;
}

function normalizeAudioUrls(value) {
  const rootFiles = new Set([
    'qiroah.mp3',
    'Shalawat Tarhim.mp3',
    'sirine.mp3',
    'beep.mp3',
    'adzan-subuh.mp3',
    'adzan-biasa.mp3',
    'doa.mp3',
    'doa-puasa.mp3',
    'doa-buka.mp3',
    'iqomah.mp3'
  ]);

  if (Array.isArray(value)) return value.map(normalizeAudioUrls);
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      for (const file of rootFiles) {
        if (value === file || value.endsWith('/' + file)) {
          return './audio/' + encodeURIComponent(file).replace(/%2F/g, '/');
        }
      }
    }
    return value;
  }

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = normalizeAudioUrls(val);
  }
  return out;
}

function writeJson(path, value) {
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function main() {
  const data = await callGas('getDataFromSheet');

  const audio = {
    version: 1,
    updatedAt: new Date().toISOString(),
    enabled: true,
    source: 'Google Sheets via Apps Script sync',
    Audio: normalizeAudioUrls(data.Audio || {}),
    AudioSchedule: data.AudioSchedule || {},
    AudioDurations: data.AudioDurations || {},
    AudioFriday: data.AudioFriday || {},
    AudioStatus: data.AudioStatus || {}
  };

  const event = {
    version: 1,
    updatedAt: new Date().toISOString(),
    enabled: true,
    source: 'Google Sheets via Apps Script sync',
    Event: Array.isArray(data.Event) ? data.Event : []
  };

  writeJson('data/audio-config.json', audio);
  writeJson('data/event.json', event);

  console.log('Stage 1 sync OK:', {
    audioKeys: Object.keys(audio.Audio).length,
    scheduleKeys: Object.keys(audio.AudioSchedule).length,
    eventRows: event.Event.length
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
