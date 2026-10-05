export const MODEL = 'gemini-3.5-flash-lite';
export const MAX_OUTPUT_TOKENS = 768;

export function config() {
  const { GEMINI_API_KEY } = process.env;
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing from this Vercel deployment.');
  const geminiKey = GEMINI_API_KEY.trim();
  if (!geminiKey || /^["']|["']$/.test(geminiKey)) throw new Error('Paste the raw Gemini API key into Vercel without quotation marks.');
  return { geminiKey };
}

export function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Google returns the reason in an error body. Match known causes without ever
// echoing Google's raw message or the API key to a browser or log.
export async function geminiFailure(response) {
  let reason = '';
  try {
    const body = await response.json();
    reason = typeof body?.error?.message === 'string' ? body.error.message.slice(0, 1000).toLowerCase() : '';
  } catch { /* Some upstream failures have no JSON body. */ }
  const status = response.status;
  if (status === 401) return { status: 503, error: 'Google says the Gemini API key is missing, invalid or expired (HTTP 401). Check the key value in Vercel.' };
  if (status === 403) {
    if (/reported as leaked|leaked|compromised/.test(reason)) return { status: 503, error: 'Google blocked this Gemini API key as leaked (HTTP 403). Create a new key in Google AI Studio and update Vercel.' };
    if (/project.*denied access|denied access.*project/.test(reason)) return { status: 503, error: 'Google denied this project access to the Gemini API (HTTP 403). Check the project in Google AI Studio; a key in the same project may not fix it.' };
    if (/referer|referrer|ip address|application restriction/.test(reason)) return { status: 503, error: 'This key’s application restrictions block requests from the Vercel server (HTTP 403). Use a server-compatible Gemini API key.' };
    if (/api.*not enabled|api.*disabled|service_disabled|has not been used in project/.test(reason)) return { status: 503, error: 'The Gemini API is not enabled for this Google project (HTTP 403). Check the project linked to your key.' };
    if (/unrestricted/.test(reason)) return { status: 503, error: 'Google rejected an unrestricted standard key (HTTP 403). Restrict it to the Gemini API or create a new key in AI Studio.' };
    return { status: 503, error: 'Google denied Gemini API access for this key or project (HTTP 403). Check its status and restrictions in Google AI Studio.' };
  }
  if (status === 404) return { status: 503, error: 'This Gemini model is not available to your API key (HTTP 404). Check model access in Google AI Studio.' };
  if (status === 402) return { status: 503, error: 'Google requires payment or credits for this Gemini project (HTTP 402). Check its billing status.' };
  if (status === 429) return { status: 429, error: 'Gemini quota was reached. Try again later.' };
  if (status === 400) return { status: 502, error: 'Gemini rejected this request (HTTP 400). Check the request format and API configuration.' };
  return { status: 502, error: 'Gemini returned HTTP ' + status + '. Try again later.' };
}
