const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { discoverProfiles, profileLabel } = require('./publish_website.cjs');

test('all profile configs are discovered in daily run order', () => {
  const root = path.resolve(__dirname, '..');
  const profiles = discoverProfiles(root);

  assert.equal(profiles[0].slug, 'cocuk');
  assert.ok(profiles.some(profile => profile.slug === 'otomobil-motosiklet'));
  assert.ok(profiles.some(profile => profile.slug === 'hamile'));
  assert.ok(profiles.some(profile => profile.slug === 'hobi'));
  assert.equal(profiles.length, 12);
});

test('website label is derived from collector config', () => {
  assert.equal(profileLabel({ profile: 'ev-yasam', name: 'Trendyol Ev & Yaşam En Çok Satanlar' }), 'Ev & Yaşam');
  assert.equal(profileLabel({ profile: 'hamile', name: 'Trendyol Hamile Çok Satanlar' }), 'Hamile');
  assert.equal(profileLabel({ profile: 'ozel', name: 'Ignored', website: { label: 'Özel Kategori' } }), 'Özel Kategori');
});
