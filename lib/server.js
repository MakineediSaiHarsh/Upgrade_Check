export const MODEL = 'gemini-2.5-flash-lite';
export const MAX_OUTPUT_TOKENS = 300;

export function config() {
  const { GEMINI_API_KEY } = process.env;
  if (!GEMINI_API_KEY) throw new Error('Gemini is not configured.');
  return { geminiKey: GEMINI_API_KEY };
}

export function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
