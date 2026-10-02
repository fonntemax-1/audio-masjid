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
    Audio: data.Audio || {},
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
