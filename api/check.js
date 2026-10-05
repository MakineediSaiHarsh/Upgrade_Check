import { SYSTEM_PROMPT, parseInput, compare, safeModelOutput } from '../lib/decision.js';
import { MODEL, MAX_OUTPUT_TOKENS, config, json } from '../lib/server.js';

export async function POST(request) {
  if ((request.headers.get('content-length') ?? '0') > 4096) return json({ error: 'Request is too large.' }, 413);
  let input;
  try { input = parseInput(await request.json()); }
  catch (error) { return json({ error: error.message || 'Invalid comparison.' }, 400); }

  let cfg;
  try { cfg = config(); }
  catch { return json({ error: 'This check is not configured yet.' }, 503); }

  const figures = compare(input);
  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify({
      currentFridge: { name: input.oldModel, type: input.oldType, capacityLitres: input.oldCapacity, source: input.oldSource },
      preferredFridge: { name: input.newModel, type: input.newType, capacityLitres: input.newCapacity, source: input.newSource },
      concern: input.concern, comparison: figures
    }) }] }],
    generationConfig: {
      temperature: 0.2, maxOutputTokens: MAX_OUTPUT_TOKENS,
      thinkingConfig: { thinkingLevel: 'minimal' },
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: {
        summary: { type: 'STRING' }, caveat: { type: 'STRING' }, next_step: { type: 'STRING' }
      }, required: ['summary', 'caveat', 'next_step'] }
    }
  };
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.geminiKey },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(7500)
    });
  } catch {
    return json({ error: 'Could not reach Gemini. Try again later.' }, 502);
  }
  if (!response.ok) {
    if (response.status === 404) return json({ error: 'This Gemini model is not available to your API key (HTTP 404). Check the model access in Google AI Studio.' }, 503);
    if (response.status === 401 || response.status === 403) return json({ error: 'Gemini rejected the API key. Check GEMINI_API_KEY in Vercel.' }, 503);
    if (response.status === 429) return json({ error: 'Gemini quota was reached. Try again later.' }, 429);
    return json({ error: 'Gemini returned HTTP ' + response.status + '. Try again later.' }, 502);
  }
  try {
    const rawResponse = await response.json();
    const rawText = rawResponse.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
    const answer = safeModelOutput(rawText);
    return json({ figures, answer });
  } catch {
    return json({ error: 'Gemini returned an explanation the site could not read. Try again.' }, 502);
  }
}
