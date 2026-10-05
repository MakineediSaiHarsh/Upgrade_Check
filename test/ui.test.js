import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

test('model-first page calculates locally and handles missing and cross-type models', async () => {
  const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /href="\.\.\/index\.html"|src="models\.js"/);
  assert.match(html, /<script src="catalog\.js"><\/script>/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, new Set(ids).size);
  const elements = Object.fromEntries(ids.map(id => [id, {
    value: '', textContent: '', hidden: false, disabled: false, checked: false, files: [],
    listeners: {}, children: [], addEventListener(type, fn) { this.listeners[type] = fn; },
    appendChild(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
    scrollIntoView() {}
  }]));
  for (const side of ['old', 'new']) {
    elements[side + '-photo-review'].hidden = true;
  }
  elements['result-content'].hidden = true;
  elements['rate-low'].value = '7';
  elements['rate-high'].value = '10';
  elements['trade-in'].value = '0';
  const rows = [
    { brand: 'LG', model_number: 'GL-B199OSLC', fridge_type: 'Direct Cool', total_volume_l: 185, annual_kwh: 190, stars: 3, verification_status: 'provisional' },
    { brand: 'LG', model_number: 'GLD235', fridge_type: 'Direct Cool', total_volume_l: 224, annual_kwh: 118, stars: 5, verification_status: 'provisional' },
    { brand: 'Samsung', model_number: 'FrostFree 260', fridge_type: 'Frost Free', total_volume_l: 260, annual_kwh: 240, stars: 3, verification_status: 'provisional' }
  ];
  let failCatalog = false;
  const queries = [];
  const context = {
    Intl, Number, String, Math, console, URLSearchParams, setTimeout, clearTimeout,
    location: { protocol: 'https:' },
    navigator: { clipboard: { writeText: async () => {} } },
    fetch: async (url, options) => {
      if (String(url).includes('/api/stats')) return { ok: false };
      const parsed = new URL(url);
      queries.push({ parsed, options });
      if (failCatalog) throw new TypeError('Failed to fetch');
      const params = parsed.searchParams;
      const matches = rows.filter(row => row.fridge_type === params.get('fridge_type').slice(3) &&
        (!params.has('brand') || row.brand.toLowerCase().includes(params.get('brand').slice(7, -1).toLowerCase())) &&
        (!params.has('model_number') || row.model_number.toLowerCase().includes(params.get('model_number').slice(7, -1).toLowerCase())));
      return { ok: true, json: async () => matches };
    },
    document: { getElementById: id => elements[id], createElement: () => ({ value: '', label: '' }) }
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ['catalog.js', 'payback.js', 'app.js']) {
    vm.runInContext(await fs.readFile(new URL('../' + file, import.meta.url), 'utf8'), context, { filename: file });
  }
  await elements['try-sample'].listeners.click();
  assert.equal(queries.length, 2);
  assert.ok(queries.every(q => q.parsed.hostname.endsWith('.supabase.co') && q.options.headers.apikey.startsWith('sb_publishable_')));
  assert.ok(queries.every(q => q.parsed.searchParams.get('select') === 'brand,model_number,fridge_type,annual_kwh,stars'));
  assert.equal(elements['old-type'].value, 'direct_cool');
  assert.equal(elements['old-brand'].value, 'LG');
  assert.equal(elements['old-model'].value, 'GL-B199OSLC');
  assert.equal(elements['new-model'].value, 'GLD235');
  assert.equal(elements['old-units'].value, '190');
  assert.equal(elements['new-units'].value, '118');
  assert.equal(elements['result-content'].hidden, false);
  assert.match(elements['result-headline'].textContent, /years/);
  assert.match(elements['units-result'].textContent, /72 fewer/);
  assert.equal(elements['usage-total'].textContent, '');

  elements['old-units'].value = '220';
  elements['old-units'].listeners.input();
  elements['new-units'].value = '310';
  elements['new-units'].listeners.input();
  assert.equal(elements['result-headline'].textContent, 'No payback from electricity savings');
  assert.match(elements['saving-result'].textContent, /₹630–₹900 more\/year/);

  elements['new-units'].value = '120';
  elements['new-units'].listeners.input();
  elements['new-price'].value = '';
  elements['check-form'].listeners.input({ target: elements['new-price'] });
  assert.equal(elements['result-headline'].textContent, 'Add the new fridge’s price');

  elements['new-price'].value = '25000';
  elements['check-form'].listeners.input({ target: elements['new-price'] });
  elements['old-model'].value = 'Unlisted old fridge';
  elements['old-model'].listeners.input();
  assert.equal(elements['old-units'].value, '');
  assert.equal(elements['result-headline'].textContent, 'Need label figures for payback');
  assert.equal(elements['threshold-result'].hidden, false);
  assert.match(elements['threshold-result'].textContent, /Five-year test/);

  elements['trade-in'].value = '';
  elements['check-form'].listeners.input({ target: elements['trade-in'] });
  assert.equal(elements['form-message'].hidden, true);

  elements['current-unusable'].checked = true;
  elements['check-form'].listeners.change({ target: { id: 'current-unusable' } });
  assert.equal(elements['result-headline'].textContent, 'Compare running costs instead');

  elements['new-type'].value = 'frost_free';
  elements['new-type'].listeners.change();
  assert.equal(elements['new-units'].value, '');
  assert.match(elements['new-source'].textContent, /Searching|annual units/);
  elements['new-brand'].value = 'Samsung';
  elements['new-brand'].listeners.input();
  elements['new-model'].value = 'FrostFree 260';
  elements['new-model'].listeners.input();
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(elements['new-units'].value, '240');
  assert.match(elements['new-source'].textContent, /Catalogue match/);
  elements['new-units'].value = '240';
  elements['new-units'].listeners.input();
  assert.equal(elements['new-type'].value, 'frost_free');
  assert.match(elements['data-note'].textContent, /annual units entered by you/);

  failCatalog = true;
  elements['old-model'].value = 'No such fridge';
  elements['old-model'].listeners.input();
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.match(elements['old-source'].textContent, /Could not connect to Supabase/);
  elements['old-units'].value = '210';
  elements['old-units'].listeners.input();
  assert.equal(elements['old-units'].value, '210');
  assert.equal(elements['result-content'].hidden, false);
});
