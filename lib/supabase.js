// Server-only Data API access. The secret key must never be imported by browser scripts.
export function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY?.trim();
  if (!url) throw Object.assign(new Error('Missing Supabase URL'), { kind: 'missing_url' });
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
    throw Object.assign(new Error('Invalid Supabase URL'), { kind: 'invalid_url' });
  }
  if (!key) throw Object.assign(new Error('Missing Supabase key'), { kind: 'missing_key' });
  if (key.startsWith('sb_publishable_')) {
    throw Object.assign(new Error('Publishable key cannot write audit rows'), { kind: 'public_key' });
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
  if (!response.ok) {
    let code = '';
    try {
      const body = await response.json();
      if (/^(?:PGRST\d+|[A-Z0-9]{5})$/.test(body?.code)) code = body.code;
    } catch { /* The gateway may send an empty or non-JSON error. */ }
    throw Object.assign(new Error('Supabase Data API returned HTTP ' + response.status),
      { kind: 'http', status: response.status, code });
  }
  return response;
}

// Return useful diagnostic categories without exposing keys or raw database errors.
export function loggingFailure(error) {
  if (error?.kind === 'missing_url') return 'Add SUPABASE_URL to the calculator Vercel project and redeploy.';
  if (error?.kind === 'invalid_url') return 'SUPABASE_URL must be the Supabase Project URL, such as https://project.supabase.co.';
  if (error?.kind === 'missing_key') return 'Add SUPABASE_SERVICE_KEY to the calculator Vercel project and redeploy.';
  if (error?.kind === 'public_key') return 'SUPABASE_SERVICE_KEY must be a secret key, not the publishable key.';
  if (error?.code === '42501') return 'The Supabase key lacks permission to write gemini_calls. Use a server secret key.';
  if (error?.status === 401 || error?.status === 403) return 'Supabase rejected the server key (HTTP ' + error.status + '). Check the key and project URL in Vercel.';
  if (error?.status === 404 || error?.code === 'PGRST205' || error?.code === '42P01') {
    return 'The gemini_calls table is unavailable. Run supabase/gemini_calls.sql in this Supabase project and confirm public is exposed in the Data API.';
  }
  if (error?.status === 400) return 'Supabase rejected the gemini_calls table schema. Run the current supabase/gemini_calls.sql and check its columns.';
  if (error?.status) return 'Supabase logging returned HTTP ' + error.status + '. Check the project status and Vercel function logs.';
  return 'Supabase could not be reached. Check the project URL and Vercel function logs.';
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
  if (!id) return;
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
