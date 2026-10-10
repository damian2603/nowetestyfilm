import { importSeries, ImportError } from './muse.mjs';
export async function handleImport(request) {
  if (request.method !== 'GET') return Response.json({ error: 'Użyj GET.' }, { status: 405, headers: { Allow: 'GET' } });
  const url = new URL(request.url);
  try {
    const data = await importSeries(url.searchParams.get('url') || '');
    return Response.json(data, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (e) {
    return Response.json({ error: e instanceof ImportError ? e.message : 'Błąd importu.' }, { status: e.status || 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
