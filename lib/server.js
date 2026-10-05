import { randomUUID } from 'node:crypto';

export const MODEL = 'gemini-2.5-flash-lite';
export const MAX_OUTPUT_TOKENS = 300;
export const VISITOR_LIMIT = 5;

export function config() {
  const { GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Service configuration is incomplete.');
  const base = new URL(SUPABASE_URL);
  if (base.protocol !== 'https:') throw new Error('Supabase URL must use HTTPS.');
  return { geminiKey: GEMINI_API_KEY, supabaseUrl: base.href.replace(/\/$/, ''), supabaseKey: SUPABASE_SERVICE_KEY };
}

export function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function visitorFrom(request) {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)uc_visitor=([0-9a-f-]{36})(?:;|$)/i);
  const visitor = match && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(match[1]) ? match[1] : randomUUID();
  return { visitor, cookie: match ? null : `uc_visitor=${visitor}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax` };
}

export async function dbRequest(path, options = {}) {
  const cfg = config();
  const response = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: cfg.supabaseKey,
      Authorization: `Bearer ${cfg.supabaseKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    signal: AbortSignal.timeout(4000)
  });
  if (!response.ok) throw new Error(`Database request failed (${response.status}).`);
  return response;
}

export async function claimQuota(visitor) {
  const response = await dbRequest('rpc/claim_upgradecheck', { method: 'POST', body: JSON.stringify({ p_visitor_id: visitor }) });
  return (await response.json()) === true;
}

export async function writeExchange(row) {
  await dbRequest('upgrade_checks', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
}

export async function getSuccessCount() {
  const response = await dbRequest('upgrade_checks?select=id&status=eq.success', {
    method: 'HEAD', headers: { Prefer: 'count=exact', Range: '0-0' }
  });
  const match = (response.headers.get('content-range') ?? '').match(/\/(\d+)$/);
  if (!match) throw new Error('Database count was unavailable.');
  return Number(match[1]);
}
