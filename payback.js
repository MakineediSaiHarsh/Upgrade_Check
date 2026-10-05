(function (root) {
  function compare(input) {
    const price = input.newPrice;
    const tradeIn = input.tradeIn || 0;
    const netPurchaseCost = price == null ? null : Math.round((price - tradeIn) * 100) / 100;
    const annualUnitsSaved = input.oldUnits == null || input.newUnits == null ? null : input.oldUnits - input.newUnits;
    const annualRupeesSaved = annualUnitsSaved == null ? null :
      [annualUnitsSaved * input.rateLow, annualUnitsSaved * input.rateHigh].sort((a, b) => a - b);
    const paybackYears = annualUnitsSaved > 0 && netPurchaseCost != null && input.currentUsable !== false ?
      [netPurchaseCost / (annualUnitsSaved * input.rateHigh), netPurchaseCost / (annualUnitsSaved * input.rateLow)] : null;
    const fiveYearOldUnits = netPurchaseCost != null && input.newUnits != null && input.currentUsable !== false ?
      [input.newUnits + netPurchaseCost / (5 * input.rateHigh), input.newUnits + netPurchaseCost / (5 * input.rateLow)] : null;
    const status = input.currentUsable === false ? 'replacement_required' :
      annualUnitsSaved == null ? 'missing_energy' :
      annualUnitsSaved <= 0 ? 'no_electricity_payback' :
      netPurchaseCost == null ? 'missing_price' : 'payback';
    return { netPurchaseCost, annualUnitsSaved, annualRupeesSaved, paybackYears, fiveYearOldUnits, status };
  }
  root.UpgradePayback = { compare };
})(globalThis);
