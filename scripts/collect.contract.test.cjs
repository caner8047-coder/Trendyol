const test = require('node:test');
const assert = require('node:assert/strict');

const { parseSalesSignal, scoreProducts } = require('./collect.cjs');

test('public sales label is normalized as an explicit lower-bound daily signal', () => {
  assert.deepEqual(parseSalesSignal('Son 3 günde 1,5B+ ürün satıldı!'), {
    sales_signal_days: 3,
    sales_signal_min: 1500,
    sales_signal_daily_min: 500
  });
  assert.deepEqual(parseSalesSignal('satış etiketi yok'), {
    sales_signal_days: null,
    sales_signal_min: null,
    sales_signal_daily_min: null
  });
});

test('rank movement is calculated only inside the same source scope', () => {
  const history = [{
    date: '2026-08-19', product_id: 'p1', merchant_id: 'm1', source_segment: 'oyuncak',
    rank_scope: 'cocuk:oyuncak', rank_scope_position: '18', price: '100', review_count: '20'
  }];
  const [sameScope] = scoreProducts([{
    product_id: 'p1', merchant_id: 'm1', source_segment: 'oyuncak', rank_scope: 'cocuk:oyuncak',
    rank_scope_position: 8, price: 90, review_count: 24, rating_count: 30
  }], history, '2026-08-20');
  const [differentScope] = scoreProducts([{
    product_id: 'p1', merchant_id: 'm1', source_segment: 'kitap', rank_scope: 'cocuk:kitap',
    rank_scope_position: 8, price: 90, review_count: 24, rating_count: 30
  }], history, '2026-08-20');

  assert.equal(sameScope.rank_delta, 10);
  assert.equal(sameScope.price_delta_percent, -10);
  assert.equal(sameScope.review_delta, 4);
  assert.equal(differentScope.rank_delta, null);
});

test('price movement resets when the observed merchant changes', () => {
  const history = [{
    date: '2026-08-19', product_id: 'p1', merchant_id: 'm1', source_segment: 'oyuncak',
    rank_scope: 'cocuk:oyuncak', rank_scope_position: '5', price: '100', review_count: '20'
  }];
  const [product] = scoreProducts([{
    product_id: 'p1', merchant_id: 'm2', source_segment: 'oyuncak', rank_scope: 'cocuk:oyuncak',
    rank_scope_position: 4, price: 80, review_count: 21, rating_count: 30
  }], history, '2026-08-20');

  assert.equal(product.rank_delta, 1);
  assert.equal(product.price_delta_percent, null);
});
