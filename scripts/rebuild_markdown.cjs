#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ROOT, buildLists, generateReport, mdTable, listMdFields, listTitles } = require('./collect.cjs');

const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'latest.json'), 'utf8'));
const quality = JSON.parse(fs.readFileSync(path.join(ROOT, 'quality', 'latest.json'), 'utf8'));
const date = quality.date || products[0]?.date;
if (!date || !products.length) throw new Error('Yeniden oluşturulacak geçerli veri bulunamadı.');

const report = generateReport(products, date, quality);
fs.writeFileSync(path.join(ROOT, 'reports', `${date}.md`), report);
fs.writeFileSync(path.join(ROOT, 'reports', 'latest.md'), report);

const listDir = path.join(ROOT, 'lists', date);
fs.mkdirSync(listDir, { recursive: true });
for (const [name, rows] of Object.entries(buildLists(products))) {
  fs.writeFileSync(path.join(listDir, name.replace(/\.csv$/, '.md')), `# ${listTitles[name]} — ${date}\n\n${mdTable(rows, listMdFields)}\n`);
}

console.log(`Markdown raporları ${products.length} tıklanabilir ürünle yenilendi.`);
