import { SYSTEM_PROMPT, parseInput, compare, safeModelOutput } from '../lib/decision.js';
import { MODEL, MAX_OUTPUT_TOKENS, VISITOR_LIMIT, config, json, visitorFrom, claimQuota, writeExchange, getSuccessCount } from '../lib/server.js';

export async function POST(request) {
  if ((request.headers.get('content-length') ?? '0') > 4096) return json({ error: 'Request is too large.' }, 413);
  let input;
  try { input = parseInput(await request.json()); }
  catch (error) { return json({ error: error.message || 'Invalid comparison.' }, 400); }

  const { visitor, cookie } = visitorFrom(request);
  const headers = cookie ? { 'Set-Cookie': cookie } : {};
  let cfg;
  try { cfg = config(); }
  catch { return json({ error: 'This check is not configured yet.' }, 503, headers); }

  try {
    if (!(await claimQuota(visitor))) return json({ error: `You have used ${VISITOR_LIMIT} checks on this browser.`, remaining: 0 }, 429, headers);
  } catch {
    return json({ error: 'The usage limit could not be checked. Please try again later.' }, 503, headers);
  }

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
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: {
        summary: { type: 'STRING' }, caveat: { type: 'STRING' }, next_step: { type: 'STRING' }
      }, required: ['summary', 'caveat', 'next_step'] }
    }
  };
  let rawResponse = null;
  let usage = { input_tokens: 0, output_tokens: 0 };
  let answer;
  let failure;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.geminiKey },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(7500)
    });
    if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);
    rawResponse = await response.json();
    usage = {
      input_tokens: rawResponse.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: rawResponse.usageMetadata?.candidatesTokenCount ?? 0
    };
    const rawText = rawResponse.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
    answer = safeModelOutput(rawText);
  } catch (error) { failure = error; }

  try {
    await writeExchange({
      visitor_id: visitor, input, output: answer ?? { error: String(failure?.message ?? 'Model error') },
      ...usage, status: answer ? 'success' : 'error', model: MODEL
    });
  } catch {
    return json({ error: 'The response could not be saved. Please try again later.' }, 503, headers);
  }
  if (failure) return json({ error: 'The AI explanation was unavailable. Your attempt was recorded.' }, 502, headers);
  let total = null;
  try { total = await getSuccessCount(); } catch { /* The answer is still available; stats can retry. */ }
  return json({ figures, answer, total, remaining: null }, 200, headers);
}
