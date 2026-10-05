(() => {
  const byId = id => document.getElementById(id);
  const catalog = globalThis.UpgradeCatalog;
  const compare = globalThis.UpgradePayback.compare;
  const form = byId('check-form');
  const typeNames = { direct_cool: 'Direct Cool', frost_free: 'Frost Free', side_by_side: 'Side by Side', multi_door: 'Multi Door', other: 'Other / not sure' };
  const state = {
    old: { selected: null, origin: null, photo: null },
    new: { selected: null, origin: null, photo: null }
  };
  const currency = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
  const number = n => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
  const year = n => (Math.ceil(n * 10) / 10).toFixed(1);
  const norm = value => String(value || '').trim().toLocaleLowerCase('en-IN').replace(/\s+/g, ' ');
  const field = (side, name) => byId(side + '-' + name);
  let currentInput = null;
  let renderVersion = 0;
  const searchVersions = { old: 0, new: 0 };
  const searchTimers = { old: null, new: null };
  const brands = new Set();

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
    field(side, 'units').value = '';
    if (state[side].selected) field(side, 'capacity').value = '';
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
          ' units/year' + (match.stars ? ', ' + match.stars + ' stars' : '') +
          '. ' + (match.status === 'provisional' ? 'Provisional entry; ' : '') + 'Check your exact BEE label.';
        render();
      } else {
        field(side, 'source').textContent = rows.length ?
          (model ? 'Select an exact model suggestion, or enter its annual units from the label.' : 'Start typing a model number, or enter annual units manually.') :
          'No catalogue match found. Enter the annual units from this fridge’s label.';
      }
    } catch {
      if (version !== searchVersions[side]) return;
      refreshModels(side);
      field(side, 'source').textContent = 'Model search is unavailable. Enter annual units from your fridge’s label; the calculator still works.';
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
    field(side, 'dismiss-photo').addEventListener('click', () => {
      state[side].photo = null;
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
    return origin === 'catalog' ? 'refrigerator catalogue, check exact BEE label' : origin === 'photo' ? 'photo extraction confirmed by you' : origin === 'label' ? 'annual units entered by you' : 'annual units missing';
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
      '\nLabel-based scenario; actual use may differ.';
  }
  function render() {
    renderVersion++;
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
      detail.textContent = 'Choose the type and enter the brand for each fridge. Search the model number if you know it; other fridges can use their label’s annual units.';
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
      input.newModel + ' — ' + sourceName(input.newSource) + '. Each fridge’s type and capacity are shown in its card.';
    byId('result-basis').textContent = 'This is a label-based electricity scenario. Standard-test figures do not measure your ageing fridge today. Prices, tariffs and future use may differ; it is not guaranteed profit.';
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
  byId('try-sample').addEventListener('click', async () => {
    for (const [side, model] of [['old', 'GL-B199OSLC'], ['new', 'GLD235']]) {
      invalidateSearch(side);
      clearUnits(side);
      field(side, 'type').value = 'direct_cool';
      field(side, 'brand').value = 'LG';
      field(side, 'model').value = model;
    }
    byId('new-price').value = '25000';
    byId('current-unusable').checked = false;
    render();
    await Promise.all(['old', 'new'].map(side => searchModels(side, searchVersions[side])));
    byId('result-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  async function showUsage() {
    if (location.protocol === 'file:') return;
    try {
      const response = await fetch('/api/stats', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (Number.isSafeInteger(data.total)) byId('usage-total').textContent = number(data.total);
    } catch { /* Local calculation is unaffected. */ }
  }
  byId('explain-button').addEventListener('click', async () => {
    if (!currentInput) return;
    const message = byId('ai-message');
    if (location.protocol === 'file:') {
      message.textContent = 'Gemini needs the deployed website. The calculator above still works here.';
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
      if (!response.ok) throw new Error(data.error || 'The AI explanation is unavailable.');
      if (version !== renderVersion) return;
      byId('answer-summary').textContent = data.answer.summary;
      byId('answer-caveat').textContent = data.answer.caveat;
      byId('answer-next').textContent = data.answer.next_step;
      byId('ai-answer').hidden = false;
      message.textContent = 'Explanation ready. The calculation above was done separately.';
      if (Number.isSafeInteger(data.total)) byId('usage-total').textContent = number(data.total);
    } catch (error) {
      if (version === renderVersion) message.textContent = error.message + ' Your comparison is still available.';
    } finally {
      if (version === renderVersion) button.disabled = false;
    }
  });

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
    status.textContent = 'Reading label with Gemini…';
    field(side, 'photo-review').hidden = true;
    try {
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Could not read that file.'));
        reader.readAsDataURL(file);
      });
      const response = await fetch('/api/label', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mime: file.type, image, side })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Label reading is unavailable.');
      state[side].photo = data.details;
      const d = data.details;
      field(side, 'photo-preview').textContent = 'Gemini read: ' + (d.brand || 'brand unclear') + ' ' + (d.model || 'model unclear') +
        '; ' + (typeNames[d.type] || 'type unclear') + '; ' + (d.capacity || 'capacity unclear') +
        ' L; ' + (d.annualUnits || 'annual units unclear') + ' kWh/year. Check every value against your photo before using it.';
      field(side, 'photo-review').hidden = false;
      status.textContent = 'Review before applying. The photo was sent for extraction but is not saved with the comparison.';
      if (Number.isSafeInteger(data.total)) byId('usage-total').textContent = number(data.total);
    } catch (error) {
      status.textContent = error.message + ' You can enter the label details manually.';
    } finally { button.disabled = false; }
  }
  function usePhoto(side) {
    const d = state[side].photo;
    if (!d) return;
    invalidateSearch(side);
    if (d.type && typeNames[d.type]) field(side, 'type').value = d.type;
    if (d.brand) field(side, 'brand').value = d.brand;
    if (d.model) field(side, 'model').value = d.model;
    if (d.capacity) field(side, 'capacity').value = String(d.capacity);
    if (d.annualUnits) field(side, 'units').value = String(d.annualUnits);
    state[side].selected = null;
    state[side].origin = d.annualUnits ? 'photo' : null;
    refreshModels(side);
    field(side, 'source').textContent = d.annualUnits ? 'You confirmed Gemini’s label reading. Check the exact annual units on your photo.' : 'Annual units were unreadable. Enter them from the label.';
    field(side, 'photo-review').hidden = true;
    state[side].photo = null;
    render();
  }
  render();
  showUsage();
})();
