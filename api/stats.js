import { dataRequest, loggingFailure } from '../lib/supabase.js';
import { json } from '../lib/server.js';

export async function GET() {
  try {
    const response = await dataRequest('gemini_calls?select=id', {
      method: 'HEAD', headers: { Prefer: 'count=exact' }
    });
    const count = Number(response.headers.get('content-range')?.split('/').pop());
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid count response');
    return json({ recordedCalls: count });
  } catch (error) {
    return json({ error: 'Gemini call count is unavailable. ' + loggingFailure(error) }, 503);
  }
}
