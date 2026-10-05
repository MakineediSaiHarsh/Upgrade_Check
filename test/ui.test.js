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
  let photoDetails = { brand: 'LG', model: 'GL-B199OSLC', type: 'direct_cool', capacity: null, annualUnits: null };
  let photoCalls = 0;
  let explainCalls = 0;
  const stored = new Map();
  const queries = [];
  const context = {
    Intl, Number, String, Math, console, URLSearchParams, setTimeout, clearTimeout,
    location: { protocol: 'https:' },
    navigator: { clipboard: { writeText: async () => {} } },
    localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    FileReader: class {
      readAsDataURL() { this.result = 'data:image/png;base64,dGVzdA=='; this.onload(); }
    },
    fetch: async (url, options) => {
      if (String(url).includes('/api/label')) { photoCalls++; return { ok: true, json: async () => ({ details: photoDetails }) }; }
      if (String(url).includes('/api/check')) {
        explainCalls++;
        return { ok: true, json: async () => ({ answer: { summary: 'Scenario', caveat: 'Check labels', next_step: 'Compare costs' } }) };
      }
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
  failCatalog = true;
  await elements['try-sample'].listeners.click();
  assert.equal(queries.length, 0, 'the filled example should work without Supabase');
  failCatalog = false;
  assert.equal(elements['old-type'].value, 'direct_cool');
  assert.equal(elements['old-brand'].value, 'Example');
  assert.equal(elements['old-model'].value, 'Current 190 L');
  assert.equal(elements['new-model'].value, 'New 220 L');
  assert.equal(elements['old-units'].value, '360');
  assert.equal(elements['new-units'].value, '160');
  assert.equal(elements['result-content'].hidden, false);
  assert.match(elements['result-headline'].textContent, /years/);
  assert.match(elements['units-result'].textContent, /200 fewer/);
  assert.match(elements['result-basis'].textContent, /Illustrative example only/);
  assert.match(elements['data-note'].textContent, /illustrative example figures/);
  assert.match(elements['ai-remaining'].textContent, /5 of 5/);

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
  assert.equal(elements['new-capacity'].value, '');
  assert.equal(elements['new-price'].value, '');
  assert.match(elements['new-source'].textContent, /Searching|annual units/);
  elements['new-brand'].value = 'Samsung';
  elements['new-brand'].listeners.input();
  elements['new-model'].value = 'FrostFree 260';
  elements['new-model'].listeners.input();
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.ok(queries.length > 0);
  assert.ok(queries.every(q => q.parsed.hostname.endsWith('.supabase.co') && q.options.headers.apikey.startsWith('sb_publishable_')));
  assert.ok(queries.every(q => q.parsed.searchParams.get('select') === 'brand,model_number,fridge_type,annual_kwh,stars'));
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

  failCatalog = false;
  elements['old-label-photo'].files = [{ type: 'image/png', size: 10 }];
  await elements['old-read-label'].listeners.click();
  assert.equal(elements['old-photo-review'].hidden, false);
  assert.match(elements['old-photo-preview'].textContent, /GL-B199OSLC/);
  elements['old-use-photo'].listeners.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(elements['old-model'].value, 'GL-B199OSLC');
  assert.equal(elements['old-units'].value, '190');
  assert.match(elements['old-source'].textContent, /Catalogue match/);

  photoDetails = { brand: 'LG', model: '', type: 'direct_cool', capacity: null, annualUnits: null };
  await elements['old-read-label'].listeners.click();
  elements['old-use-photo'].listeners.click();
  assert.equal(elements['old-model'].value, '');
  assert.equal(elements['old-units'].value, '');
  assert.match(elements['old-source'].textContent, /exact model or annual units were not visible/);
  assert.match(elements['old-identified'].textContent, /annual units unknown/);
  assert.equal(photoCalls, 2);
  assert.equal(stored.get('upgradecheck_ai_attempts_v1'), '2');
  assert.match(elements['ai-remaining'].textContent, /3 of 5/);
  await elements['explain-button'].listeners.click();
  assert.equal(explainCalls, 1);
  assert.match(elements['ai-remaining'].textContent, /2 of 5/);
  for (let i = 0; i < 2; i++) await elements['old-read-label'].listeners.click();
  assert.equal(photoCalls, 4);
  assert.match(elements['ai-remaining'].textContent, /0 of 5/);
  await elements['old-read-label'].listeners.click();
  assert.equal(photoCalls, 4);
  assert.match(elements['old-photo-status'].textContent, /used five AI attempts/);
  await elements['explain-button'].listeners.click();
  assert.equal(explainCalls, 1);
  assert.match(elements['ai-message'].textContent, /used five AI attempts/);
});
