import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePageUrl, extractSeries, importSeries } from '../lib/muse.mjs';

const source = 'https://my-muse.ai/pl/video/7acef74a-7aee-4d29-bbad-8c708d967d1e';
const media = n => `https://cdn.my-muse.ai/show/ep${n}_.m3u8`;
const sub = n => `https://cdn.my-muse.ai/subtitles/pl/ep${n}.vtt`;
const props = { seriesData: { name: 'Test', totalEpisodes: 3 }, episodes: [
  { position: 3, videoUrl: media(3), subs: { pl: sub(3) } },
  { position: 1, videoUrls: { en: media(1) }, subs: { pl: sub(1), en: 'https://cdn.my-muse.ai/en/ep1.vtt' } },
  { position: 2, videoUrl: media(2), subs: {} }
] };
function htmlFor(data, split = false) {
  const record = '1b:' + JSON.stringify(['$', '$L1c', null, data]) + '\n';
  const pieces = split ? [record.slice(0, 123), record.slice(123)] : [record];
  return '<title>Tytuł &amp; test - Oglądaj cały film | My Muse</title>' + pieces.map(p => `<script>self.__next_f.push(${JSON.stringify([1, p])})</script>`).join('');
}
test('only accepts canonical my-muse video URLs', () => {
  assert.equal(normalizePageUrl(source + '?ep=3#x'), source);
  for (const url of ['http://my-muse.ai/video/x', 'https://my-muse.ai.evil.com/video/x', 'https://localhost/', source.replace('https://', 'https://user:pass@'), source.replace('my-muse.ai', 'my-muse.ai:8443'), 'file:///etc/passwd']) assert.throws(() => normalizePageUrl(url));
});
test('parses split Flight frames, sorts actual entries and pairs subtitle URLs', () => {
  const result = extractSeries(htmlFor(props, true), source);
  assert.equal(result.title, 'Tytuł & test'); assert.equal(result.totalEpisodes, 3);
  assert.deepEqual(result.episodes.map(e => e.position), [1, 2, 3]);
  assert.equal(result.episodes[0].videoUrl, media(1)); assert.equal(result.episodes[2].subtitles.pl, sub(3));
  assert.deepEqual(result.episodes[1].subtitles, {});
});
test('does not infer missing episodes from reported count or execute source scripts', () => {
  const data = { seriesData: { totalEpisodes: 100 }, episodes: [props.episodes[0]] };
  const result = extractSeries(htmlFor(data) + '<script>throw new Error("must not execute")</script>', source);
  assert.equal(result.totalEpisodes, 1); assert.equal(result.reportedTotalEpisodes, 100);
});
test('drops unsafe media URLs and keeps locked/missing entries', () => {
  const data = structuredClone(props); data.episodes[0].subs.pl = 'javascript:alert(1)'; data.episodes[2].videoUrl = 'https://evil.com/ep.m3u8'; data.episodes[0].isLocked = true;
  const result = extractSeries(htmlFor(data), source);
  assert.equal(result.episodes[2].isLocked, true); assert.deepEqual(result.episodes[2].subtitles, {});
  assert.equal(result.episodes[1].videoUrl, null);
});
test('supports JSON page data and fails clearly after source changes', () => {
  assert.equal(extractSeries(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: props } })}</script>`, source).totalEpisodes, 3);
  assert.throws(() => extractSeries('<h1>No metadata</h1>', source), /Nie znaleziono listy/);
});
test('fetch import validates response and rejects off-domain redirects', async () => {
  const result = await importSeries(source, { useCache: false, fetcher: async () => new Response(htmlFor(props), { headers: { 'content-type': 'text/html' } }) });
  assert.equal(result.totalEpisodes, 3);
  await assert.rejects(importSeries(source, { useCache: false, fetcher: async () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1/' } }) }), /Obsługiwane/);
  await assert.rejects(importSeries(source, { useCache: false, fetcher: async () => new Response('', { status: 403 }) }), /HTTP 403/);
  await assert.rejects(importSeries(source, { useCache: false, fetcher: async () => new Response('{}', { headers: { 'content-type': 'application/json' } }) }), /HTML/);
});
