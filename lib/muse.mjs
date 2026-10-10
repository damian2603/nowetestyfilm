export class ImportError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}

export function normalizePageUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new ImportError('Wklej pełny link do filmu na my-muse.ai.', 400); }
  if (url.protocol !== 'https:' || url.hostname !== 'my-muse.ai' || url.port || url.username || url.password ||
      !/^\/(?:[a-z]{2}\/)?video\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/?$/i.test(url.pathname)) {
    throw new ImportError('Obsługiwane są linki https://my-muse.ai/[język]/video/ID.', 400);
  }
  url.search = ''; url.hash = '';
  return url.href;
}

function mediaUrl(value, extension) {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'cdn.my-muse.ai' && !u.port && !u.username && !u.password &&
      u.pathname.toLowerCase().endsWith(extension) ? u.href : null;
  } catch { return null; }
}

// Parse data, never execute scripts supplied by the source page.
function dataRoots(html) {
  const roots = [], flight = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const [, attrs, body] = match;
    if (/\btype\s*=\s*["']application\/(?:ld\+)?json["']/i.test(attrs) || /\bid\s*=\s*["']__NEXT_DATA__["']/i.test(attrs)) {
      try { roots.push(JSON.parse(body)); } catch { /* Non-JSON script. */ }
    }
    const frame = /^\s*self\.__next_f\.push\((\[[\s\S]*\])\)\s*;?\s*$/.exec(body);
    if (frame) {
      try { const part = JSON.parse(frame[1]); if (part[0] === 1 && typeof part[1] === 'string') flight.push(part[1]); } catch { /* Ignore invalid frames. */ }
    }
  }
  // Next.js can split one JSON record across several script elements.
  for (const record of flight.join('').split('\n')) {
    const match = /^[0-9a-f]+:(\[[\s\S]*|\{[\s\S]*)$/i.exec(record);
    if (match) { try { roots.push(JSON.parse(match[1])); } catch { /* Other Flight records are not JSON. */ } }
  }
  return roots;
}

export function extractSeries(html, sourceUrl) {
  if (typeof html !== 'string' || html.length > 4_000_000) throw new ImportError('Nieprawidłowa lub zbyt duża strona.');
  let best = null;
  function walk(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 80) return;
    if (Array.isArray(value.episodes) && value.episodes.some(e => e && typeof e === 'object' && (e.videoUrl || e.videoUrls))) {
      if (!best || value.episodes.length > best.episodes.length) best = value;
    }
    for (const child of Object.values(value)) walk(child, depth + 1);
  }
  for (const root of dataRoots(html)) walk(root);
  if (!best) throw new ImportError('Nie znaleziono listy odcinków. Strona mogła zmienić format lub wymagać logowania.');
  const seen = new Set();
  const episodes = best.episodes.map((e, index) => {
    const videoUrls = {};
    for (const [lang, value] of Object.entries(e.videoUrls || {})) {
      const url = mediaUrl(value, '.m3u8'); if (url && /^[a-z]{2}(?:-[a-z]{2})?$/i.test(lang)) videoUrls[lang] = url;
    }
    const videoUrl = mediaUrl(e.videoUrl, '.m3u8') || videoUrls.en || Object.values(videoUrls)[0] || null;
    const subtitles = {};
    for (const [lang, value] of Object.entries(e.subs || {})) {
      const url = mediaUrl(value, '.vtt'); if (url && /^[a-z]{2}(?:-[a-z]{2})?$/i.test(lang)) subtitles[lang] = url;
    }
    const position = Number.isInteger(e.position) && e.position > 0 ? e.position : index + 1;
    return { id: String(e.chapterId || position), position, title: `Odcinek ${position}`, videoUrl, videoUrls, subtitles,
      isLocked: e.isLocked === true, isFree: typeof e.isFreeWeb === 'boolean' ? e.isFreeWeb : null };
  }).filter(e => { if (seen.has(e.position)) return false; seen.add(e.position); return true; })
    .sort((a, b) => a.position - b.position);
  if (!episodes.length || !episodes.some(e => e.videoUrl)) throw new ImportError('Strona nie udostępnia adresów odcinków.');
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const pageTitle = titleMatch?.[1].replace(/\s*[-–|]\s*Oglądaj[\s\S]*/i, '').replace(/\s*\|\s*My Muse.*$/i, '').trim();
  const title = (pageTitle || best.seriesData?.name || 'Serial').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const reported = best.seriesData?.totalEpisodes;
  return { schemaVersion: 1, title, sourceUrl: normalizePageUrl(sourceUrl), totalEpisodes: episodes.length,
    reportedTotalEpisodes: Number.isInteger(reported) ? reported : null, episodes };
}

const cache = new Map();
export async function importSeries(input, { fetcher = fetch, useCache = true } = {}) {
  const sourceUrl = normalizePageUrl(input);
  const hit = cache.get(sourceUrl);
  if (useCache && hit && hit.expires > Date.now()) return hit.data;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 22_000);
  try {
    let url = sourceUrl, response;
    for (let n = 0; n < 4; n++) {
      response = await fetcher(url, { redirect: 'manual', signal: controller.signal, headers: { Accept: 'text/html' } });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get('location');
      if (!location) throw new ImportError('Nieprawidłowe przekierowanie strony.');
      url = normalizePageUrl(new URL(location, url).href);
    }
    if (!response.ok) throw new ImportError(`my-muse zwróciło HTTP ${response.status}. Spróbuj później lub sprawdź link.`, 502);
    if (!response.headers.get('content-type')?.includes('text/html')) throw new ImportError('Odpowiedź nie jest stroną HTML.', 502);
    const reader = response.body.getReader(); let size = 0; const chunks = [];
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4_000_000) { await reader.cancel(); throw new ImportError('Strona jest zbyt duża.', 502); }
      chunks.push(value);
    }
    const data = extractSeries(new TextDecoder().decode(Buffer.concat(chunks)), sourceUrl);
    if (useCache) { if (cache.size >= 40) cache.delete(cache.keys().next().value); cache.set(sourceUrl, { data, expires: Date.now() + 180_000 }); }
    return data;
  } catch (e) {
    if (e instanceof ImportError) throw e;
    if (controller.signal.aborted) throw new ImportError('Strona odpowiada zbyt długo. Spróbuj ponownie.', 504);
    throw new ImportError('Nie udało się połączyć z my-muse. Spróbuj ponownie.', 502);
  } finally { clearTimeout(timer); }
}
