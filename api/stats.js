import { json, getSuccessCount } from '../lib/server.js';

export async function GET() {
  try { return json({ total: await getSuccessCount() }); }
  catch { return json({ error: 'Usage count unavailable.' }, 503); }
}
