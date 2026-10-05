// This is a public, read-only Supabase publishable key. RLS on refrigerator_models
// must allow SELECT for anon; never put a service_role/secret key in browser code.
(() => {
  const url = 'https://enyjhhdvbvhgdsgxutlm.supabase.co/rest/v1/';
  const key = 'sb_publishable_A1LLXlDIJl180hcRbwY0Fg_2cNMkqK9';
  const typeNames = {
    direct_cool: 'Direct Cool', frost_free: 'Frost Free',
    side_by_side: 'Side by Side', multi_door: 'Multi Door'
  };
  const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const searchValue = value => String(value || '').replace(/[^\p{L}\p{N} ._/-]/gu, '').trim().slice(0, 60);

  function mapRow(row) {
    const type = Object.keys(typeNames).find(name => normalize(typeNames[name]) === normalize(row.fridge_type));
    const kwh = Number(row.annual_kwh);
    if (!type || !row.brand || !row.model_number || !Number.isFinite(kwh) || kwh <= 0) return null;
    return {
      brand: String(row.brand).trim(), model: String(row.model_number).trim(),
      type, litres: row.total_volume_l == null ? null : Number(row.total_volume_l),
      kwh, stars: row.stars == null ? null : Number(row.stars),
      status: row.verification_status || 'provisional',
      source: row.source_url || '', validUntil: row.label_valid_until || ''
    };
  }

  async function search({ type, brand = '', model = '' }) {
    if (!typeNames[type]) return [];
    const params = new URLSearchParams({
      select: 'brand,model_number,fridge_type,total_volume_l,annual_kwh,stars,label_valid_until,source_url,verification_status',
      fridge_type: 'eq.' + typeNames[type], order: 'brand.asc,model_number.asc', limit: '60'
    });
    if (searchValue(brand)) params.set('brand', 'ilike.*' + searchValue(brand) + '*');
    if (searchValue(model)) params.set('model_number', 'ilike.*' + searchValue(model) + '*');
    const response = await fetch(url + '/rest/v1/refrigerator_models?' + params, {
      headers: { apikey: key }, cache: 'no-store'
    });
    if (!response.ok) throw new Error('Model search is unavailable (' + response.status + ').');
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Unexpected catalogue response.');
    return rows.map(mapRow).filter(Boolean);
  }

  globalThis.UpgradeCatalog = { search };
})();
