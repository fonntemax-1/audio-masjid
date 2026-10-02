import fs from 'node:fs';

const locations = JSON.parse(fs.readFileSync('data/lokasi-muslimkita.json', 'utf8'));
const OUT = 'data/prayer-cache.json';
const API_BASE = 'https://www.muslimkita.id/api/jadwal-sholat/v1/';
const FIELDS = ['subuh','terbit','dzuhur','ashar','maghrib','isya'];

function localDate(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit'
  }).format(new Date());
}

function normalizeTime(value) {
  const s = String(value ?? '').trim();
  const m = s.match(/^(\d{1,2}):([0-5]\d)(?::\d{2})?$/);
  if (!m) return '';
  const h = Number(m[1]);
  return h <= 23 ? String(h).padStart(2,'0') + ':' + m[2] : '';
}

function extractSchedule(json) {
  const raw = json?.jadwal || json?.data?.jadwal ||
    (json?.data && typeof json.data === 'object' ? json.data : null);
  if (!raw) return null;
  const aliases = {
    subuh:['subuh','fajr'], terbit:['terbit','sunrise','syuruq'],
    dzuhur:['dzuhur','dhuhur','dhuhr','zuhur'], ashar:['ashar','asr'],
    maghrib:['maghrib','magrib'], isya:['isya','isha']
  };
  const jadwal = {};
  for (const field of FIELDS) {
    jadwal[field] = '';
    for (const key of aliases[field]) {
      if (raw[key] != null && String(raw[key]).trim()) {
        jadwal[field] = normalizeTime(raw[key]);
        if (jadwal[field]) break;
      }
    }
  }
  return FIELDS.every(f => /^([01]\d|2[0-3]):[0-5]\d$/.test(jadwal[f])) ? jadwal : null;
}

async function fetchCity(city, attempt=1) {
  const tanggal = localDate(city.timezone || 'Asia/Jakarta');
  const url = API_BASE + encodeURIComponent(city.slug) +
    '?tanggal=' + encodeURIComponent(tanggal) + '&metode=kemenag';
  try {
    const response = await fetch(url, {headers:{accept:'application/json','user-agent':'audio-masjid-github-prayer-cache'}});
    const body = await response.text();
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const jadwal = extractSchedule(JSON.parse(body));
    if (!jadwal) throw new Error('jadwal tidak lengkap');
    return {success:true,tanggal,kota:city.kota,provinsi:city.provinsi,slug:city.slug,zona:city.zona,timezone:city.timezone,gmt:city.gmt,source:'MuslimKita / Kemenag',jadwal,generatedAt:new Date().toISOString()};
  } catch (e) {
    if (attempt < 3) {
      await new Promise(r=>setTimeout(r,attempt*1500));
      return fetchCity(city,attempt+1);
    }
    console.warn('GAGAL',city.slug,tanggal,e.message);
    return null;
  }
}

async function main() {
  const queue=[...locations], cities={};
  const workers=Array.from({length:8},async()=>{
    while(queue.length) {
      const city=queue.shift();
      const result=await fetchCity(city);
      if(result) cities[city.slug]=result;
    }
  });
  await Promise.all(workers);
  const successCount=Object.keys(cities).length;
  if(successCount < Math.max(1,Math.floor(locations.length*0.8)))
    throw new Error('Cache dibatalkan: hanya '+successCount+'/'+locations.length+' kota berhasil.');
  const now=new Date().toISOString();
  fs.writeFileSync(OUT,JSON.stringify({success:true,generatedAt:now,updatedAt:now,cityCount:successCount,cities},null,2)+'\n');
  console.log('PRAYER CACHE UPDATED:',successCount,'/',locations.length);
}
main().catch(e=>{console.error(e);process.exit(1);});
