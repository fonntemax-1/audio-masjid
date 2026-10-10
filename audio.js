/* Audio file map — alamat MP3 tidak berasal dari Google Sheet.
 * Sheet hanya mengatur sequence + ON/OFF.
 */
(function () {
  'use strict';

  const FILES = {
    'qiroah-1': 'qiroah-1.mp3',
    'qiroah-2': 'qiroah-2.mp3',
    'qiroah-3': 'qiroah-3.mp3',
    'qiroah-4': 'qiroah-4.mp3',
    'qiroah-5': 'qiroah-5.mp3',
    'tarhim': 'Shalawat Tarhim.mp3',
    'beep': 'beep.mp3',
    'adzan-subuh': 'adzan-subuh.mp3',
    'adzan-biasa': 'adzan-biasa.mp3',
    'doa-adzan': 'doa.mp3',
    'doa-puasa': 'doa-puasa.mp3',
    'doa-buka': 'doa-buka.mp3',
    'iqomah': 'iqomah.mp3',
    'sirine': 'sirine.mp3',
    'takbiran': 'takbiran.mp3'
  };

  function localUrl(key) {
    const name = FILES[String(key || '').trim().toLowerCase()];
    return name ? './audio/' + encodeURIComponent(name) : '';
  }

  window.AUDIO_LOCAL_FILES = Object.freeze(FILES);
  window.getLocalAudioUrl = localUrl;
  window.getAllLocalAudioUrls = function () {
    const out = {};
    Object.keys(FILES).forEach(function (key) {
      out[key] = localUrl(key);
    });
    return out;
  };
}());
