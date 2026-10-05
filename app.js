(() => {
  const byId = id => document.getElementById(id);
  const catalog = globalThis.UpgradeCatalog;
  const compare = globalThis.UpgradePayback.compare;
  const form = byId('check-form');
  const typeNames = { direct_cool: 'Direct Cool', frost_free: 'Frost Free', side_by_side: 'Side by Side', multi_door: 'Multi Door', other: 'Other / not sure' };
  const state = {
    old: { selected: null, origin: null, photo: null, suggestions: [] },
    new: { selected: null, origin: null, photo: null, suggestions: [], samplePrice: false }
  };
  const currency = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
  const number = n => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
  const year = n => (Math.ceil(n * 10) / 10).toFixed(1);
  const aiLimit = 5;
  const aiUsageKey = 'upgradecheck_ai_attempts_v3';
  let inMemoryAttempts = 0;
  function aiAttempts() {
    try {
      const value = Number.parseInt(localStorage.getItem(aiUsageKey), 10);
      return Number.isInteger(value) && value >= 0 ? Math.min(aiLimit, value) : 0;
    } catch { return inMemoryAttempts; }
  }
  function updateAiUsage() {
    const remaining = aiLimit - aiAttempts();
    byId('ai-remaining').textContent = remaining + ' of ' + aiLimit + ' AI attempts remaining on this browser.';
  }
  async function refreshRecordedCalls() {
    if (location.protocol === 'file:') {
      byId('gemini-call-count').textContent = 'Gemini request count is available on the deployed website.';
      return;
    }
    try {
      const response = await fetch('/api/stats', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !Number.isSafeInteger(data.recordedCalls)) throw new Error('Unavailable');
      byId('gemini-call-count').textContent = 'Gemini requests recorded: ' + number(data.recordedCalls);
    } catch {
      byId('gemini-call-count').textContent = 'Gemini request count is temporarily unavailable.';
    }
  }
  function claimAiAttempt() {
    const used = aiAttempts();
    if (used >= aiLimit) { updateAiUsage(); return false; }
    inMemoryAttempts = used + 1;
    try { localStorage.setItem(aiUsageKey, String(inMemoryAttempts)); } catch { /* Keep a page-only count when storage is disabled. */ }
    updateAiUsage();
    return true;
  }
  function refundAiAttempt() {
    inMemoryAttempts = Math.max(0, aiAttempts() - 1);
    try { localStorage.setItem(aiUsageKey, String(inMemoryAttempts)); } catch { /* Page-only count. */ }
    updateAiUsage();
  }
  const norm = value => String(value || '').trim().toLocaleLowerCase('en-IN').replace(/\s+/g, ' ');
  const field = (side, name) => byId(side + '-' + name);
  let currentInput = null;
  let renderVersion = 0;
  const searchVersions = { old: 0, new: 0 };
  const searchTimers = { old: null, new: null };
  const brands = new Set();
  function showIdentified(side) {
    const name = [field(side, 'brand').value.trim(), field(side, 'model').value.trim()].filter(Boolean).join(' ');
    const type = typeNames[field(side, 'type').value] || '';
    const units = field(side, 'units').value.trim();
    field(side, 'identified').textContent = name || type || units ?
      'Details: ' + [name || 'Brand/model unknown', type, units ? units + ' units/year' : 'annual units unknown'].filter(Boolean).join(' · ') :
      'No fridge details applied yet.';
  }

  const brandOptions = byId('brand-options');
  function addBrands(rows) {
    for (const row of rows) brands.add(row.brand);
    brandOptions.replaceChildren();
    for (const brand of [...brands].sort()) {
      const option = document.createElement('option');
      option.value = brand;
      brandOptions.appendChild(option);
    }
  }

  function refreshModels(side, rows = []) {
    const options = field(side, 'model-options');
    options.replaceChildren();
    for (const m of rows) {
      const option = document.createElement('option');
      option.value = m.model;
      option.label = m.brand + (m.litres ? ' · ' + m.litres + ' L' : '') + ' · ' + m.kwh + ' units/year';
      options.appendChild(option);
    }
  }

  function clearUnits(side) {
    if (side === 'new' && state.new.samplePrice) byId('new-price').value = '';
    if (side === 'new') state.new.samplePrice = false;
    field(side, 'units').value = '';
    field(side, 'capacity').value = '';
    state[side].selected = null;
    state[side].origin = null;
    field(side, 'source').textContent = 'Search by model number, or enter the annual units from its label.';
  }

  function invalidateSearch(side) {
    searchVersions[side]++;
    if (searchTimers[side]) clearTimeout(searchTimers[side]);
    searchTimers[side] = null;
  }

  async function searchModels(side, version) {
    const type = field(side, 'type').value;
    if (!type || type === 'other') {
      field(side, 'source').textContent = 'Enter the annual units from this fridge’s label.';
      return;
    }
    field(side, 'source').textContent = 'Searching the refrigerator catalogue…';
    try {
      const rows = await catalog.search({ type, brand: field(side, 'brand').value, model: field(side, 'model').value });
      if (version !== searchVersions[side]) return;
      refreshModels(side, rows);
      addBrands(rows);
      const model = norm(field(side, 'model').value);
      const brand = norm(field(side, 'brand').value);
      const matches = rows.filter(m => norm(m.model) === model && (!brand || norm(m.brand) === brand));
      if (model && matches.length === 1 && state[side].origin !== 'label' && state[side].origin !== 'photo') {
        const match = matches[0];
        state[side].selected = match;
        state[side].origin = 'catalog';
        field(side, 'brand').value = match.brand;
        if (match.litres > 0) field(side, 'capacity').value = String(match.litres);
        field(side, 'units').value = String(match.kwh);
        field(side, 'source').textContent = 'Catalogue match: ' + match.brand + ' ' + match.model + ', ' + match.kwh +
          ' units/year' + (match.stars ? ', ' + match.stars + ' stars' : '') + '. Check your exact BEE label.';
        render();
      } else {
        field(side, 'source').textContent = rows.length ?
          (model ? 'Select an exact model suggestion, or enter its annual units from the label.' : 'Start typing a model number, or enter annual units manually.') :
          'No catalogue match found. Enter the annual units from this fridge’s label.';
      }
    } catch (error) {
      if (version !== searchVersions[side]) return;
      refreshModels(side);
      field(side, 'source').textContent = (error && error.name === 'TypeError' ?
        'Could not reach model search. Check the network connection.' :
        error.message || 'Model search is unavailable.') + ' You can still enter the annual units from the label.';
    }
  }

  function queueSearch(side, immediate = false) {
    invalidateSearch(side);
    const version = searchVersions[side];
    if (immediate) void searchModels(side, version);
    else searchTimers[side] = setTimeout(() => void searchModels(side, version), 250);
  }

  for (const side of ['old', 'new']) {
    field(side, 'type').addEventListener('change', () => {
      if (state[side].selected) field(side, 'model').value = '';
      clearUnits(side);
      refreshModels(side);
      queueSearch(side, true);
      render();
    });
    field(side, 'brand').addEventListener('input', () => {
      if (state[side].selected) field(side, 'model').value = '';
      clearUnits(side);
      refreshModels(side);
      queueSearch(side);
      render();
    });
    field(side, 'model').addEventListener('input', () => {
      clearUnits(side);
      queueSearch(side);
      render();
    });
    field(side, 'units').addEventListener('input', () => {
      invalidateSearch(side);
      state[side].selected = null;
      state[side].origin = field(side, 'units').value ? 'label' : null;
      field(side, 'source').textContent = state[side].origin ? 'Using the annual units you entered. Verify them against the exact label.' : 'Enter the annual units from this model’s label.';
      render();
    });
    field(side, 'capacity').addEventListener('input', () => {
      if (state[side].selected && Number(field(side, 'capacity').value) !== state[side].selected.litres) {
        const typedCapacity = field(side, 'capacity').value;
        invalidateSearch(side);
        clearUnits(side);
        field(side, 'capacity').value = typedCapacity;
      }
      render();
    });
    field(side, 'read-label').addEventListener('click', () => readLabel(side));
    field(side, 'use-photo').addEventListener('click', () => usePhoto(side));
    field(side, 'use-suggestion').addEventListener('click', () => useSuggestion(side));
    field(side, 'photo-options').addEventListener('change', () => {
      field(side, 'use-suggestion').disabled = field(side, 'photo-options').value === '';
    });
    field(side, 'dismiss-photo').addEventListener('click', () => {
      state[side].photo = null;
      state[side].suggestions = [];
      field(side, 'photo-review').hidden = true;
    });
  }

  function optionalNumber(id) {
    const raw = byId(id).value.trim();
    return raw === '' ? null : Number(raw);
  }
  function readInput() {
    const oldBrand = field('old', 'brand').value.trim();
    const newBrand = field('new', 'brand').value.trim();
    const oldCode = field('old', 'model').value.trim();
    const newCode = field('new', 'model').value.trim();
    return {
      oldType: field('old', 'type').value, newType: field('new', 'type').value,
      oldBrand, newBrand, oldCode, newCode,
      oldModel: (oldBrand + ' ' + oldCode).trim(), newModel: (newBrand + ' ' + newCode).trim(),
      oldCapacity: optionalNumber('old-capacity'), newCapacity: optionalNumber('new-capacity'),
      oldUnits: optionalNumber('old-units'), newUnits: optionalNumber('new-units'),
      oldSource: state.old.origin || 'unknown', newSource: state.new.origin || 'unknown',
      newPrice: optionalNumber('new-price'), tradeIn: optionalNumber('trade-in') ?? 0,
      rateLow: optionalNumber('rate-low'), rateHigh: optionalNumber('rate-high'),
      currentUsable: !byId('current-unusable').checked, concern: byId('concern').value.trim()
    };
  }
  const inRange = (n, min, max) => n != null && Number.isFinite(n) && n >= min && n <= max;
  function validate(input) {
    for (const side of ['old', 'new']) {
      if (!typeNames[input[side + 'Type']] || input[side + 'Brand'].length > 60 || input[side + 'Code'].length > 80) return 'Choose a valid type and keep the brand and model concise.';
      for (const key of ['Capacity', 'Units']) {
        const n = input[side + key];
        if (n != null && !inRange(n, key === 'Capacity' ? 30 : 1, key === 'Capacity' ? 1500 : 5000)) return 'Check the capacity and annual-unit fields.';
      }
    }
    if (input.newPrice != null && !inRange(input.newPrice, 1, 1000000)) return 'Check the new fridge’s checkout price.';
    if (!inRange(input.rateLow, 0.1, 100) || !inRange(input.rateHigh, 0.1, 100) || input.rateLow > input.rateHigh) return 'Check the electricity price range.';
    if (!inRange(input.tradeIn, 0, 1000000) || (input.newPrice == null && input.tradeIn > 0) || (input.newPrice != null && input.tradeIn > input.newPrice)) return 'Trade-in cannot exceed the checkout price.';
    if (input.concern.length > 180) return 'Keep the optional question under 180 characters.';
    return null;
  }
  function sourceName(origin) {
    return origin === 'catalog' ? 'refrigerator catalogue, check exact BEE label' : origin === 'photo' ? 'photo extraction confirmed by you' : origin === 'label' ? 'annual units entered by you' : origin === 'example' ? 'illustrative example figures' : origin === 'proxy' ? 'similar catalogue model, not an exact match' : 'annual units missing';
  }
  function moneyRange(values) {
    const amounts = values.map(Math.abs).sort((a, b) => a - b).map(currency);
    return amounts[0] === amounts[1] ? amounts[0] : amounts.join('–');
  }
  function resultText(input, result) {
    const oldName = input.oldModel + ' (' + typeNames[input.oldType] + ')';
    const newName = input.newModel + ' (' + typeNames[input.newType] + ')';
    return 'UpgradeCheck: ' + oldName + ' → ' + newName + '\n' +
      byId('result-headline').textContent + '. ' + byId('result-detail').textContent + '\n' +
      (result.annualUnitsSaved == null ? 'Annual use comparison needs both labels.' : 'Annual units saved: ' + number(result.annualUnitsSaved) + '.') +
      (input.oldSource === 'proxy' || input.newSource === 'proxy' ? '\nIllustrative proxy scenario; the suggested model is not verified as your fridge.' :
        input.oldSource === 'example' || input.newSource === 'example' ? '\nIllustrative example; replace every figure with your own.' : '\nLabel-based scenario; actual use may differ.');
  }
  function render() {
    renderVersion++;
    showIdentified('old');
    showIdentified('new');
    currentInput = null;
    byId('ai-answer').hidden = true;
    byId('ai-message').textContent = '';
    byId('explain-button').disabled = true;
    const input = readInput();
    const completeNames = input.oldType && input.newType && input.oldBrand && input.newBrand;
    const headline = byId('result-headline');
    const detail = byId('result-detail');
    const message = byId('form-message');
    byId('result-content').hidden = !completeNames;
    byId('copy-result').hidden = !completeNames;
    message.hidden = true;
    if (!completeNames) {
      headline.textContent = 'Start with your two fridges';
      detail.textContent = 'Upload a photo of each fridge and apply the details Gemini can identify. You can review or enter missing details in either fridge card.';
      return;
    }
    const error = validate(input);
    if (error) {
      headline.textContent = 'Check the values entered';
      detail.textContent = 'Fix the field described below to see a comparison.';
      message.hidden = false;
      message.textContent = error;
      byId('result-content').hidden = true;
      byId('copy-result').hidden = true;
      return;
    }
    currentInput = input;
    const result = compare(input);
    const hasProxy = input.oldSource === 'proxy' || input.newSource === 'proxy';
    byId('units-label').textContent = hasProxy ? 'Illustrative annual use difference' : 'Labelled annual use difference';
    const delta = result.annualUnitsSaved;
    byId('units-result').textContent = delta == null ? 'Need both labels' : delta === 0 ? 'Same annual units' :
      number(Math.abs(delta)) + (delta > 0 ? ' fewer units/year' : ' more units/year');
    byId('saving-result').textContent = delta == null ? 'Need both labels' : delta === 0 ? 'No difference' :
      moneyRange(result.annualRupeesSaved) + (delta > 0 ? ' saved/year' : ' more/year');
    byId('milestone-result').textContent = delta == null ? 'Need both labels' : delta === 0 ? 'No electricity saving' :
      moneyRange(result.annualRupeesSaved.map(value => 5 * value)) + (delta > 0 ? ' saved on electricity' : ' more on electricity');
    const threshold = byId('threshold-result');
    threshold.hidden = true;
    if (result.status === 'replacement_required') {
      headline.textContent = 'Compare running costs instead';
      detail.textContent = delta == null ?
        'You have to replace the current fridge, so a keep-versus-buy payback would be misleading. Enter both annual-unit figures to compare labelled running costs.' :
        'You have to replace the current fridge, so keeping it is not an available choice. The figures below compare labelled electricity use; a keep-versus-buy payback would be misleading.';
    } else if (result.status === 'missing_energy') {
      headline.textContent = 'Need label figures for payback';
      const missing = [input.oldUnits == null ? 'current fridge' : null, input.newUnits == null ? 'desired fridge' : null].filter(Boolean).join(' and ');
      detail.textContent = 'Enter annual units (kWh/year) for the ' + missing + '. A name, type or star count alone cannot establish actual energy use.';
      if (input.oldUnits == null && input.newUnits != null && result.fiveYearOldUnits) {
        threshold.hidden = false;
        threshold.textContent = 'Five-year test: at ₹' + input.rateLow + '–' + input.rateHigh + '/unit, your current fridge would need to use roughly ' +
          number(Math.ceil(result.fiveYearOldUnits[0])) + '–' + number(Math.ceil(result.fiveYearOldUnits[1])) +
          ' units/year or more for electricity savings to recover the net price within five years. This is a threshold, not an estimate of your fridge.';
      }
    } else if (result.status === 'no_electricity_payback') {
      headline.textContent = 'No payback from electricity savings';
      detail.textContent = delta === 0 ? 'Both labels show the same annual units. Lower electricity use would not recover the purchase price.' :
        'The desired fridge has higher labelled electricity use. Its electricity bills would not recover the purchase price, though its size or features may still matter to you.';
    } else if (result.status === 'missing_price') {
      headline.textContent = 'Add the new fridge’s price';
      detail.textContent = 'Its label shows lower annual electricity use. Enter the checkout price to see how many years it would take for those estimated savings to recover what you spend.';
    } else {
      const [fast, slow] = result.paybackYears;
      headline.textContent = fast === slow ? 'About ' + year(fast) + ' years' : year(fast) + '–' + year(slow) + ' years';
      detail.textContent = input.oldModel + ' uses ' + number(delta) + ' more labelled units per year than ' + input.newModel +
        '. At ₹' + input.rateLow + '–' + input.rateHigh + '/unit, those electricity savings could recover the ' +
        currency(result.netPurchaseCost) + ' net checkout price in the range shown.' +
        (slow > 15 ? ' This is a long payback from electricity alone.' : '');
    }
    byId('data-note').textContent = 'Figures: ' + input.oldModel + ' — ' + sourceName(input.oldSource) + '; ' +
      input.newModel + ' — ' + sourceName(input.newSource) + '. Review each fridge’s details in its card.';
    if (hasProxy && result.status === 'payback') headline.textContent = 'Illustrative: ' + headline.textContent;
    byId('result-basis').textContent = hasProxy ?
      'Illustrative proxy comparison: Gemini suggested a catalogue model based on visible clues. Its annual units may differ from your actual fridge, so the payback is not a reliable forecast. Check your exact label before deciding.' :
      input.oldSource === 'example' || input.newSource === 'example' ?
      'Illustrative example only. Replace both fridges, annual units, checkout price and electricity rate with your own details before deciding.' :
      'This is a label-based electricity scenario. Standard-test figures do not measure your ageing fridge today. Prices, tariffs and future use may differ; it is not guaranteed profit.';
    byId('explain-button').disabled = input.newUnits == null || (input.oldUnits == null && result.fiveYearOldUnits == null);
    byId('copy-result').onclick = async () => {
      try {
        await navigator.clipboard.writeText(resultText(input, result));
        message.hidden = false;
        message.textContent = 'Result copied.';
      } catch {
        message.hidden = false;
        message.textContent = 'Copying is unavailable here; you can select the result text instead.';
      }
    };
  }

  form.addEventListener('input', event => {
    if (event.target.id === 'old-brand' || event.target.id === 'new-brand' || event.target.id === 'old-model' || event.target.id === 'new-model' ||
        event.target.id === 'old-units' || event.target.id === 'new-units' || event.target.id === 'old-capacity' || event.target.id === 'new-capacity') return;
    render();
  });
  form.addEventListener('change', event => {
    if (event.target.id === 'current-unusable') render();
  });
  form.addEventListener('submit', event => event.preventDefault());
  byId('try-sample').addEventListener('click', () => {
    const examples = {
      old: { model: 'Current 190 L', capacity: 190, units: 360 },
      new: { model: 'New 220 L', capacity: 220, units: 160 }
    };
    for (const side of ['old', 'new']) {
      invalidateSearch(side);
      clearUnits(side);
      refreshModels(side);
      state[side].photo = null;
      state[side].suggestions = [];
      field(side, 'photo-review').hidden = true;
      field(side, 'photo-suggestion').hidden = true;
      field(side, 'photo-options-label').hidden = true;
      field(side, 'use-suggestion').hidden = true;
      field(side, 'photo-status').textContent = '';
      field(side, 'label-photo').value = '';
      field(side, 'type').value = 'direct_cool';
      field(side, 'brand').value = 'Example';
      field(side, 'model').value = examples[side].model;
      field(side, 'capacity').value = String(examples[side].capacity);
      field(side, 'units').value = String(examples[side].units);
      state[side].origin = 'example';
      field(side, 'source').textContent = 'Illustrative figures only. Replace these with your fridge and its exact label before deciding.';
    }
    byId('new-price').value = '25000';
    state.new.samplePrice = true;
    byId('rate-low').value = '7';
    byId('rate-high').value = '10';
    byId('trade-in').value = '0';
    byId('concern').value = '';
    byId('current-unusable').checked = false;
    render();
    byId('result-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  byId('explain-button').addEventListener('click', async () => {
    if (!currentInput) return;
    const message = byId('ai-message');
    if (location.protocol === 'file:') {
      message.textContent = 'Gemini needs the deployed website. The calculator above still works here.';
      return;
    }
    if (!claimAiAttempt()) {
      message.textContent = 'You have used five AI attempts on this browser. The calculator still works without Gemini.';
      return;
    }
    const version = renderVersion;
    const input = currentInput;
    const button = byId('explain-button');
    button.disabled = true;
    message.textContent = 'Asking Gemini to explain this scenario…';
    try {
      const response = await fetch('/api/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 503 || response.status === 429) refundAiAttempt();
        throw new Error(data.error || 'The AI explanation is unavailable.');
      }
      if (version !== renderVersion) return;
      byId('answer-summary').textContent = data.answer.summary;
      byId('answer-caveat').textContent = data.answer.caveat;
      byId('answer-next').textContent = data.answer.next_step;
      byId('ai-answer').hidden = false;
      message.textContent = 'Explanation ready. The calculation above was done separately.';
    } catch (error) {
      if (version === renderVersion) message.textContent = error.message + ' Your comparison is still available.';
    } finally {
      void refreshRecordedCalls();
      if (version === renderVersion) button.disabled = false;
    }
  });

  function representativeIndex(rows, capacity) {
    const withCapacity = rows.filter(row => Number.isFinite(row.litres) && row.litres > 0);
    let pool = rows;
    if (withCapacity.length) {
      const capacities = withCapacity.map(row => row.litres).sort((a, b) => a - b);
      const target = capacity || capacities[Math.floor((capacities.length - 1) / 2)];
      const distance = Math.min(...withCapacity.map(row => Math.abs(row.litres - target)));
      pool = withCapacity.filter(row => Math.abs(row.litres - target) === distance);
    }
    const energies = pool.map(row => row.kwh).sort((a, b) => a - b);
    const targetEnergy = energies[Math.floor((energies.length - 1) / 2)];
    return rows.indexOf(pool.find(row => row.kwh === targetEnergy));
  }

  function applyProxy(side, row) {
    invalidateSearch(side);
    clearUnits(side);
    field(side, 'type').value = row.type;
    field(side, 'brand').value = row.brand;
    field(side, 'model').value = row.model;
    field(side, 'capacity').value = row.litres ? String(row.litres) : '';
    field(side, 'units').value = String(row.kwh);
    state[side].origin = 'proxy';
    field(side, 'source').textContent = 'Illustrative catalogue match: ' + row.brand + ' ' + row.model +
      (row.litres ? ', ' + row.litres + ' L' : '') + (row.stars ? ', ' + row.stars + ' stars' : '') +
      ', ' + row.kwh + ' units/year. Please check the model and figures against your fridge’s label.';
    render();
  }

  async function readLabel(side) {
    const status = field(side, 'photo-status');
    const file = field(side, 'label-photo').files[0];
    if (!file) { status.textContent = 'Choose a photo first.'; return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      status.textContent = 'Choose a JPG, PNG or WebP image under 2 MB.';
      return;
    }
    if (location.protocol === 'file:') {
      status.textContent = 'Photo reading needs the deployed website. You can enter the label details manually now.';
      return;
    }
    const button = field(side, 'read-label');
    button.disabled = true;
    status.textContent = 'Identifying fridge details with Gemini…';
    field(side, 'photo-review').hidden = true;
    field(side, 'photo-suggestion').hidden = true;
    field(side, 'photo-options-label').hidden = true;
    field(side, 'use-suggestion').hidden = true;
    field(side, 'use-suggestion').disabled = true;
    state[side].suggestions = [];
    try {
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Could not read that file.'));
        reader.readAsDataURL(file);
      });
      if (!claimAiAttempt()) {
        status.textContent = 'You have used five AI attempts on this browser. Enter the label details manually.';
        return;
      }
      const response = await fetch('/api/label', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mime: file.type, image, side })
      });
      let data;
      try { data = await response.json(); }
      catch {
        if (response.status === 503 || response.status === 429) refundAiAttempt();
        throw new Error('The photo service returned an unreadable response (HTTP ' + response.status + '). Check the Vercel function logs.');
      }
      if (!response.ok) {
        if (response.status === 503 || response.status === 429) refundAiAttempt();
        throw new Error(data.error || 'Photo identification is unavailable.');
      }
      state[side].photo = data.details;
      const d = data.details;
      field(side, 'photo-preview').textContent = 'Gemini found: ' + (d.brand || 'brand unknown') + ' ' + (d.model || '(model number not visible)') +
        '; ' + (typeNames[d.type] || 'type unknown') + '; ' + (d.capacity || 'capacity unknown') +
        ' L; ' + (d.annualUnits || 'annual units unknown') + ' kWh/year. Review these details before using them.';
      field(side, 'photo-review').hidden = false;
      status.textContent = 'Review before applying. The photo was sent to Gemini but its image bytes are not saved in the comparison.';
      if (d.brand && d.type && d.type !== 'other' && !d.model && !d.annualUnits) {
        try {
          const rows = (await catalog.search({ brand: d.brand, type: d.type }))
            .filter(row => norm(row.brand) === norm(d.brand) && row.type === d.type);
          if (rows.length) {
            state[side].suggestions = rows;
            const options = field(side, 'photo-options');
            options.replaceChildren();
            const empty = document.createElement('option');
            empty.value = '';
            empty.textContent = 'Choose another model';
            options.appendChild(empty);
            rows.forEach((row, index) => {
              const option = document.createElement('option');
              option.value = String(index);
              option.textContent = row.model + (row.litres ? ' · ' + row.litres + ' L' : '') +
                (row.stars ? ' · ' + row.stars + ' stars' : '') + ' · ' + row.kwh + ' units/year';
              options.appendChild(option);
            });
            const pick = representativeIndex(rows, d.capacity);
            options.value = String(pick);
            field(side, 'photo-options-label').hidden = false;
            field(side, 'use-suggestion').hidden = false;
            field(side, 'use-suggestion').disabled = false;
            field(side, 'photo-suggestion').textContent = d.capacity ?
              'We prefilled a catalogue model of the same brand and type with the nearest listed capacity. This is an illustrative match, not an identification. Check its model, capacity and annual units.' :
              'We prefilled a representative ' + d.brand + ' ' + typeNames[d.type] + ' catalogue model. The photo did not show its model or capacity, so it may use very different electricity. Check its model, capacity and annual units.';
            field(side, 'photo-suggestion').hidden = false;
            applyProxy(side, rows[pick]);
            status.textContent = 'Illustrative catalogue details filled. Please check them before relying on the comparison.';
          } else {
            status.textContent = 'No ' + d.brand + ' ' + typeNames[d.type] + ' models found in the catalogue. Apply visible details or enter your label manually.';
          }
        } catch {
          status.textContent = 'Catalogue search is unavailable. Apply visible details or enter your label manually.';
        }
      }
    } catch (error) {
      status.textContent = error instanceof TypeError ? 'Could not reach the photo service. Try again later or enter details manually.' : error.message;
    } finally { void refreshRecordedCalls(); button.disabled = false; }
  }
  function usePhoto(side) {
    const d = state[side].photo;
    if (!d) return;
    invalidateSearch(side);
    clearUnits(side);
    field(side, 'type').value = d.type && typeNames[d.type] ? d.type : '';
    field(side, 'brand').value = d.brand || '';
    field(side, 'model').value = d.model || '';
    field(side, 'capacity').value = d.capacity ? String(d.capacity) : '';
    field(side, 'units').value = d.annualUnits ? String(d.annualUnits) : '';
    state[side].origin = d.annualUnits ? 'photo' : null;
    refreshModels(side);
    field(side, 'source').textContent = d.annualUnits ?
      'Photo details applied. Check the exact annual units visible in your photo.' : d.model && d.type && d.type !== 'other' ?
      'Checking the visible model number against our catalogue…' :
      'Photo details applied. The exact model or annual units were not visible, so an electricity payback cannot be calculated yet.';
    field(side, 'photo-review').hidden = true;
    state[side].photo = null;
    state[side].suggestions = [];
    render();
    if (!d.annualUnits && d.model && d.type && d.type !== 'other') void searchModels(side, searchVersions[side]);
  }
  function useSuggestion(side) {
    const index = Number(field(side, 'photo-options').value);
    const suggestion = field(side, 'photo-options').value === '' ? null : state[side].suggestions[index];
    if (!suggestion) return;
    applyProxy(side, suggestion);
    field(side, 'photo-status').textContent = 'Illustrative catalogue details updated. Please check them before relying on the comparison.';
  }
  render();
  updateAiUsage();
  void refreshRecordedCalls();
})();
