#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const profileIndex = process.argv.indexOf('--profile');
const inlineProfile = process.argv.find(arg => arg.startsWith('--profile='));
const profile = inlineProfile ? inlineProfile.slice('--profile='.length) : (profileIndex >= 0 ? process.argv[profileIndex + 1] : 'cocuk');
const outputRoot = profile === 'cocuk' ? root : path.join(root, 'categories', profile);
const q = JSON.parse(fs.readFileSync(path.join(outputRoot, 'quality', 'latest.json'), 'utf8'));
const required = ['data/latest.csv','data/history.csv','reports/latest.md','reports/telegram-latest.txt'];
for (const file of required) {
  const full = path.join(outputRoot, file);
  if (!fs.existsSync(full) || fs.statSync(full).size === 0) throw new Error(`Eksik çıktı: ${file}`);
}
const dayList = path.join(outputRoot, 'lists', q.date);
for (const file of ['rising.csv','falling.csv','trending.csv','niche.csv','campaigns.csv','stock-risk.csv','price-drops.csv','rising.md','falling.md','trending.md','niche.md','campaigns.md','stock-risk.md','price-drops.md']) {
  const full = path.join(dayList, file);
  if (!fs.existsSync(full) || fs.statSync(full).size === 0) throw new Error(`Eksik liste: ${file}`);
}
if (q.status !== 'PASS') throw new Error(`Kalite kapısı başarısız: ${JSON.stringify(q)}`);
console.log(`QUALITY PASS — ${profile}: ${q.productCount} ürün, detay ${q.detailSuccessRate}%, çekirdek alan ${q.coreCoverage}%`);
