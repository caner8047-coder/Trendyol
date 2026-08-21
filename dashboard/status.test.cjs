const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStatus, cronTime, errorSummary, progressFromLog, discoverProfiles } = require('./server.cjs');

test('cron saatini okunabilir biçime çevirir', () => assert.equal(cronTime('30 14 * * *'), '14:30'));
test('timeout hatasını sadeleştirir', () => assert.match(errorSummary('page.goto: net::ERR_TIMED_OUT'), /zaman aşım/i));
test('canlı detay ilerlemesini logdan çıkarır', () => assert.deepEqual(progressFromLog('DETAIL_PROGRESS profile=hobi completed=40/200 refreshed=39'), { phase:'detail', current:40, total:200, refreshed:39, percent:20 }));
test('bütün profil ayarlarını otomatik keşfeder', () => {
  const slugs = discoverProfiles().map(profile => profile.slug);
  for (const expected of ['cocuk','erkek','mobilya','otomobil-motosiklet','hamile','hobi']) assert.ok(slugs.includes(expected));
});
test('canlı durum modeli görev ve kalite verisini birleştirir', () => {
  const status = buildStatus({ bypassCache:true });
  assert.ok(status.profiles.length >= 12);
  assert.equal(status.summary.total, status.profiles.length);
  assert.ok(status.profiles.every(profile => profile.schedule && profile.quality));
  assert.ok(status.recentEvents.length > 0);
});
