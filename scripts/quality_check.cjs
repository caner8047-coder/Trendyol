#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const q = JSON.parse(fs.readFileSync(path.join(root, 'quality', 'latest.json'), 'utf8'));
const required = ['data/latest.csv','data/history.csv','reports/latest.md','reports/telegram-latest.txt'];
for (const file of required) {
  const full = path.join(root, file);
  if (!fs.existsSync(full) || fs.statSync(full).size === 0) throw new Error(`Eksik çıktı: ${file}`);
}
const dayList = path.join(root, 'lists', q.date);
for (const file of ['rising.csv','falling.csv','trending.csv','niche.csv','campaigns.csv','stock-risk.csv','price-drops.csv']) {
  const full = path.join(dayList, file);
  if (!fs.existsSync(full) || fs.statSync(full).size === 0) throw new Error(`Eksik liste: ${file}`);
}
if (q.status !== 'PASS') throw new Error(`Kalite kapısı başarısız: ${JSON.stringify(q)}`);
console.log(`QUALITY PASS — ${q.productCount} ürün, detay ${q.detailSuccessRate}%, çekirdek alan ${q.coreCoverage}%`);
