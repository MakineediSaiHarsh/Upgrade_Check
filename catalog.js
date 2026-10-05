(() => {
  const typeNames = {
    direct_cool: 'Direct Cool', frost_free: 'Frost Free',
    side_by_side: 'Side by Side', multi_door: 'Multi Door'
  };
  const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

  function mapRow(row) {
    const type = Object.keys(typeNames).find(name => normalize(typeNames[name]) === normalize(row.fridge_type));
    const kwh = Number(row.annual_kwh);
    if (!type || !row.brand || !row.model_number || !Number.isFinite(kwh) || kwh <= 0) return null;
    const litres = row.total_volume_l == null || row.total_volume_l === '' ? null : Number(row.total_volume_l);
    return {
      brand: String(row.brand).trim(), model: String(row.model_number).trim(),
      type, litres: Number.isFinite(litres) && litres > 0 ? litres : null,
      kwh, stars: row.stars == null ? null : Number(row.stars)
    };
  }

  async function fetchRows(params) {
    const response = await fetch('/api/models?' + params, { cache: 'no-store' });
    if (!response.ok) throw new Error('Model search is unavailable. Check the Supabase environment variables and catalogue table.');
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Unexpected catalogue response.');
    return rows.map(mapRow).filter(Boolean);
  }

  async function search({ type, brand = '', model = '' }) {
    if (!typeNames[type]) return [];
    const params = new URLSearchParams({ type, brand, model });
    return fetchRows(params);
  }

  globalThis.UpgradeCatalog = { search };
})();
