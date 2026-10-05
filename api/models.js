import { dataRequest } from '../lib/supabase.js';
import { json } from '../lib/server.js';

const typeNames = { direct_cool: 'Direct Cool', frost_free: 'Frost Free',
  side_by_side: 'Side by Side', multi_door: 'Multi Door' };
const searchValue = value => String(value || '').replace(/[^\p{L}\p{N} ._/-]/gu, '').trim().slice(0, 60);

export async function GET(request) {
  const search = new URL(request.url).searchParams;
  const type = typeNames[search.get('type')];
  if (!type) return json({ error: 'Choose a valid fridge type.' }, 400);
  const params = new URLSearchParams({
    select: 'brand,model_number,fridge_type,total_volume_l,annual_kwh,stars',
    fridge_type: 'eq.' + type, order: 'brand.asc,model_number.asc', limit: '60'
  });
  for (const [field, input] of [['brand', 'brand'], ['model_number', 'model']]) {
    const value = searchValue(search.get(input));
    if (value) params.set(field, 'ilike.*' + value + '*');
  }
  try {
    const response = await dataRequest('refrigerator_models?' + params);
    return json(await response.json());
  } catch {
    return json({ error: 'Model search is unavailable. Enter annual units from the label instead.' }, 503);
  }
}
