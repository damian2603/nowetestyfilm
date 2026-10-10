(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const video = $('video');
  let series = null, currentIndex = 0, hls = null, generation = 0, track = null;
  let cueStarts = new WeakMap();
  const storage = { get(key) { try { return localStorage.getItem(key); } catch { return null; } }, set(key, value) { try { localStorage.setItem(key, value); } catch { /* Storage can be unavailable. */ } } };
  const textStatus = (id, message, error = false) => { $(id).textContent = message; $(id).classList.toggle('error', error); };
  function languageName(code) {
    try { return new Intl.DisplayNames(['pl'], { type: 'language' }).of(code); } catch { return code; }
  }
  function applyDelay() {
    const offset = Math.max(-60, Math.min(60, Number($('delay').value) || 0));
    storage.set('muse-delay', String(offset));
    if (!track?.track?.cues) return;
    for (const cue of track.track.cues) {
      if (!cueStarts.has(cue)) cueStarts.set(cue, [cue.startTime, cue.endTime]);
      const [start, end] = cueStarts.get(cue);
      cue.startTime = Math.max(0, start + offset); cue.endTime = Math.max(cue.startTime + .001, end + offset);
    }
  }
  function loadSubtitles() {
    if (track) { track.track.mode = 'disabled'; track.remove(); track = null; }
    const ep = series.episodes[currentIndex], lang = $('subtitleLanguage').value;
    const url = ep.subtitles[lang];
    $('subLink').hidden = !url; if (url) $('subLink').href = url;
    if (lang === 'off') { textStatus('subStatus', 'Napisy wyłączone.'); return; }
    if (!url) { textStatus('subStatus', 'Ten odcinek nie ma napisów w wybranym języku.'); return; }
    textStatus('subStatus', 'Ładowanie napisów…');
    track = document.createElement('track');
    const loadedTrack = track, token = generation;
    track.kind = 'subtitles'; track.label = languageName(lang); track.srclang = lang; track.src = url; track.default = true;
    track.addEventListener('load', () => {
      if (token !== generation || loadedTrack !== track) return;
      track.track.mode = 'showing'; applyDelay();
      textStatus('subStatus', `Napisy: ${languageName(lang)}. Opóźnienie: ${Number($('delay').value) || 0} s.`);
    });
    track.addEventListener('error', () => { if (token === generation && loadedTrack === track) textStatus('subStatus', 'Nie udało się wczytać VTT. Sprawdź link do napisów lub dostępność CDN.', true); });
    video.appendChild(track); track.track.mode = 'showing';
  }
  function playEpisode(index, autoplay = false) {
    if (!series || index < 0 || index >= series.episodes.length) return;
    currentIndex = index; const token = ++generation;
    const ep = series.episodes[index];
    if (hls) { hls.destroy(); hls = null; }
    video.pause(); video.removeAttribute('src'); video.replaceChildren(); video.load(); track = null; cueStarts = new WeakMap();
    $('episode').value = String(index); $('prev').disabled = index === 0; $('next').disabled = index === series.episodes.length - 1;
    document.querySelectorAll('#episodeList button').forEach((b, i) => { b.classList.toggle('active', i === index); b.setAttribute('aria-current', i === index ? 'true' : 'false'); });
    $('videoLink').hidden = !ep.videoUrl; if (ep.videoUrl) $('videoLink').href = ep.videoUrl;
    storage.set(`muse-episode:${series.sourceUrl}`, String(ep.position));
    if (!ep.videoUrl || ep.isLocked) { textStatus('playStatus', 'Odcinek jest niedostępny. Sprawdź dostęp na stronie serialu.', true); textStatus('subStatus', ''); $('subLink').hidden = true; return; }
    textStatus('playStatus', `Ładowanie odcinka ${ep.position}…`);
    video.onloadedmetadata = () => {
      if (token !== generation) return;
      textStatus('playStatus', `Odcinek ${ep.position} · ${series.title}`);
      if (autoplay) video.play().catch(() => textStatus('playStatus', 'Odcinek gotowy. Naciśnij ▶, aby rozpocząć.'));
    };
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = ep.videoUrl; video.load();
    } else if (window.Hls?.isSupported()) {
      hls = new window.Hls(); hls.loadSource(ep.videoUrl); hls.attachMedia(video);
      hls.on(window.Hls.Events.ERROR, (_, data) => { if (token === generation && data.fatal) textStatus('playStatus', 'Nie udało się odtworzyć streamu. Sprawdź dostępność odcinka na stronie serialu.', true); });
    } else textStatus('playStatus', 'Brak obsługi HLS lub nie załadowano biblioteki odtwarzacza. Spróbuj Safari albo odśwież stronę.', true);
    loadSubtitles();
  }
  function openSeries(data) {
    series = data;
    $('viewer').hidden = false; $('seriesTitle').textContent = data.title; $('seriesInfo').textContent = `${data.episodes.length} odcinków · adresy i napisy ze strony serialu`;
    $('originalLink').href = data.sourceUrl; $('episodeCount').textContent = data.episodes.length;
    $('episode').replaceChildren(); $('episodeList').replaceChildren();
    const languages = new Set();
    data.episodes.forEach((ep, i) => {
      const option = new Option(ep.title, String(i)); $('episode').add(option);
      Object.keys(ep.subtitles).forEach(lang => languages.add(lang));
      const button = document.createElement('button'); button.type = 'button';
      const number = document.createElement('span'); number.className = 'ep-number'; number.textContent = String(ep.position).padStart(2, '0');
      const info = document.createElement('div'), title = document.createElement('div'), meta = document.createElement('div');
      title.className = 'ep-name'; title.textContent = ep.title; meta.className = 'ep-meta';
      meta.textContent = ep.isLocked || !ep.videoUrl ? 'Niedostępny' : ep.subtitles.pl ? 'Polskie napisy' : 'Napisy: ' + Object.keys(ep.subtitles).length;
      info.append(title, meta); button.append(number, info); button.addEventListener('click', () => playEpisode(i, true)); $('episodeList').appendChild(button);
    });
    $('subtitleLanguage').replaceChildren();
    [...languages].sort((a, b) => a === 'pl' ? -1 : b === 'pl' ? 1 : a.localeCompare(b)).forEach(lang => $('subtitleLanguage').add(new Option(languageName(lang), lang)));
    $('subtitleLanguage').add(new Option('Wyłączone', 'off'));
    const savedLang = storage.get('muse-subtitle-language');
    $('subtitleLanguage').value = languages.has(savedLang) || savedLang === 'off' ? savedLang : languages.has('pl') ? 'pl' : [...languages][0] || 'off';
    const savedPosition = Number(storage.get(`muse-episode:${data.sourceUrl}`));
    playEpisode(Math.max(0, data.episodes.findIndex(ep => ep.position === savedPosition)));
    storage.set('muse-series', JSON.stringify(data)); $('seriesUrl').value = data.sourceUrl;
  }
  $('importForm').addEventListener('submit', async event => {
    event.preventDefault(); $('importButton').disabled = true; $('importButton').textContent = 'Wczytywanie…'; $('example').disabled = true;
    textStatus('importStatus', 'Odczytuję listę odcinków i napisy. To może potrwać kilkanaście sekund…');
    try {
      const response = await fetch(`/api/series?url=${encodeURIComponent($('seriesUrl').value.trim())}`, { signal: AbortSignal.timeout(35_000) });
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Brak backendu importera. Uruchom projekt na Netlify lub przez start.bat; samo GitHub Pages nie wystarczy.');
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Błąd importu.');
      if (!Array.isArray(data.episodes) || !data.episodes.length) throw new Error('Nie znaleziono odcinków.');
      openSeries(data); textStatus('importStatus', `Gotowe: ${data.title} — ${data.episodes.length} odcinków.`);
      const url = new URL(location.href); url.searchParams.set('url', data.sourceUrl); history.replaceState(null, '', url);
    } catch (e) { textStatus('importStatus', e.name === 'TimeoutError' ? 'Import trwa zbyt długo. Spróbuj ponownie.' : e.message || 'Nie udało się wczytać serialu.', true); }
    finally { $('importButton').disabled = false; $('importButton').textContent = 'Wczytaj serial ↗'; $('example').disabled = false; }
  });
  $('example').addEventListener('click', () => { $('seriesUrl').value = 'https://my-muse.ai/pl/video/7acef74a-7aee-4d29-bbad-8c708d967d1e'; $('importForm').requestSubmit(); });
  $('episode').addEventListener('change', () => playEpisode(Number($('episode').value), true));
  $('prev').addEventListener('click', () => playEpisode(currentIndex - 1, true)); $('next').addEventListener('click', () => playEpisode(currentIndex + 1, true));
  video.addEventListener('ended', () => { if ($('autonext').checked) playEpisode(currentIndex + 1, true); });
  video.addEventListener('error', () => { if (series) textStatus('playStatus', 'Błąd odtwarzania. Sprawdź dostępność streamu lub spróbuj innej przeglądarki.', true); });
  $('subtitleLanguage').addEventListener('change', () => { storage.set('muse-subtitle-language', $('subtitleLanguage').value); loadSubtitles(); });
  $('delay').value = storage.get('muse-delay') || '0';
  $('delay').addEventListener('input', () => { applyDelay(); if (track?.readyState === 2) textStatus('subStatus', `Napisy: ${languageName($('subtitleLanguage').value)}. Opóźnienie: ${Number($('delay').value) || 0} s.`); });
  function download(content, extension, type) {
    const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a');
    a.href = url; a.download = `${series.title.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.${extension}`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  $('downloadJson').addEventListener('click', () => download(JSON.stringify(series, null, 2), 'json', 'application/json'));
  $('downloadM3u').addEventListener('click', () => {
    const lines = ['#EXTM3U'], lang = $('subtitleLanguage').value;
    for (const ep of series.episodes) {
      if (!ep.videoUrl || ep.isLocked) continue;
      lines.push(`#EXTINF:-1,${series.title.replace(/[\r\n]/g, ' ')} - ${ep.title}`);
      if (ep.subtitles[lang]) lines.push(`#EXTVLCOPT:sub-file=${ep.subtitles[lang]}`);
      lines.push(ep.videoUrl, '');
    }
    download(lines.join('\n'), 'm3u', 'audio/x-mpegurl');
  });
  try {
    const saved = JSON.parse(storage.get('muse-series'));
    if (saved?.schemaVersion === 1 && Array.isArray(saved.episodes) && saved.episodes.length) { openSeries(saved); textStatus('importStatus', 'Przywrócono ostatnią playlistę. Wczytaj serial ponownie, aby odświeżyć adresy.'); }
  } catch { /* No previous playlist. */ }
  const queryUrl = new URL(location.href).searchParams.get('url');
  if (queryUrl) { $('seriesUrl').value = queryUrl; if (queryUrl !== series?.sourceUrl) $('importForm').requestSubmit(); }
})();
