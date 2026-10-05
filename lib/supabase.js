// Server-only Data API access. The secret key must never be imported by browser scripts.
export function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY?.trim();
  if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !key) {
    throw new Error('Supabase is not configured for this deployment. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in Vercel.');
  }
  return { url, key };
}

export async function dataRequest(path, init = {}) {
  const { url, key } = supabaseConfig();
  const response = await fetch(url + '/rest/v1/' + path, {
    ...init,
    headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }),
      ...(init.headers || {}) },
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) throw new Error('Supabase Data API returned HTTP ' + response.status);
  return response;
}

export async function beginGeminiCall(feature, input) {
  const response = await dataRequest('gemini_calls?select=id', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ feature, model: 'gemini-3.5-flash-lite', request_summary: input, status: 'pending' })
  });
  const rows = await response.json();
  if (!rows?.[0]?.id) throw new Error('Supabase did not return the Gemini call ID.');
  return rows[0].id;
}

export async function finishGeminiCall(id, outcome) {
  try {
    await dataRequest('gemini_calls?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...outcome, completed_at: new Date().toISOString() })
    });
  } catch (error) {
    // A pending record still exists and counts the attempted call.
    console.error('Could not update Gemini call record:', error.message);
  }
}

export function usage(raw) {
  const meta = raw?.usageMetadata || {};
  const token = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  return { input_tokens: token(meta.promptTokenCount), output_tokens: token(meta.candidatesTokenCount),
    total_tokens: token(meta.totalTokenCount) };
}
