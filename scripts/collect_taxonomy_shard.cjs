#!/usr/bin/env node

const path = require('path');
const {
  ROOT, readJson, writeGzipJsonAtomic, writeJsonAtomic, nowIstanbul, sleep,
  launchBrowser, prepareRankingPage, fetchRankingPage, normalizeProduct
} = require('./taxonomy_common.cjs');

function arg(name, fallback) {
  const inline = process.argv.find(value => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
function dayNumber(date) { return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000); }
function categoryPages(node, date, options = {}) {
  if (options.pages) return Number(options.pages);
  if (node.level <= 1) return 10;
  const cycleDays = Number(options.deepCycleDays || 20);
  return (node.categoryId + dayNumber(date)) % cycleDays === 0 ? 10 : 1;
}
function shardNodes(nodes, shard, shardCount) {
  return nodes.filter(node => node.categoryId % shardCount === shard);
}

async function collect() {
  const shard = Number(arg('shard', '0'));
  const shardCount = Number(arg('shards', '4'));
  const limit = Number(arg('limit-categories', '0'));
  const forcedPages = Number(arg('pages', '0'));
  if (!Number.isInteger(shard) || !Number.isInteger(shardCount) || shard < 0 || shard >= shardCount) throw new Error('Geçersiz shard ayarı.');
  const catalog = readJson(path.join(ROOT, 'taxonomy', 'catalog.json'));
  if (!catalog?.nodes?.length) throw new Error('taxonomy/catalog.json bulunamadı; önce keşif çalıştırılmalı.');
  const { date, timestamp } = nowIstanbul();
  let nodes = shardNodes(catalog.nodes, shard, shardCount);
  if (limit > 0) nodes = nodes.slice(0, limit);
  const runtimeDir = path.join(ROOT, '.runtime', 'taxonomy', date);
  const statusFile = path.join(runtimeDir, `shard-${shard}.status.json`);
  const startedAt = new Date().toISOString();
  writeJsonAtomic(statusFile, { schemaVersion: 1, date, shard, shardCount, status: 'running', startedAt, totalCategories: nodes.length, completedCategories: 0, failedCategories: 0, products: 0, memberships: 0 });
  const { browser, context } = await launchBrowser();
  const memberships = []; const products = new Map(); const failures = [];
  try {
    const page = await prepareRankingPage(context);
    for (let categoryIndex = 0; categoryIndex < nodes.length; categoryIndex++) {
      const node = nodes[categoryIndex];
      const pages = categoryPages(node, date, { pages: forcedPages || null });
      let categoryProducts = 0;
      try {
        for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
          const items = await fetchRankingPage(page, node.categoryId, pageNumber);
          for (let index = 0; index < items.length; index++) {
            const product = normalizeProduct(items[index]);
            if (!product.productId) continue;
            const productKey = `${product.productId}:${product.merchantId}`;
            products.set(productKey, product);
            memberships.push({ categoryId: node.categoryId, rank: (pageNumber - 1) * 20 + index + 1, productKey });
            categoryProducts++;
          }
          if (items.length < 20) break;
          await sleep(220);
        }
      } catch (error) { failures.push({ categoryId: node.categoryId, path: node.path, error: error.message }); }
      if ((categoryIndex + 1) % 10 === 0 || categoryIndex + 1 === nodes.length) {
        writeJsonAtomic(statusFile, {
          schemaVersion: 1, date, shard, shardCount, status: 'running', startedAt, updatedAt: new Date().toISOString(),
          totalCategories: nodes.length, completedCategories: categoryIndex + 1, failedCategories: failures.length,
          products: products.size, memberships: memberships.length, lastCategory: node.path, lastCategoryProducts: categoryProducts
        });
        console.log(`TAXONOMY_SHARD_PROGRESS shard=${shard} completed=${categoryIndex + 1}/${nodes.length} failures=${failures.length} memberships=${memberships.length}`);
      }
      await sleep(280);
    }
  } finally { await context.close(); await browser.close(); }
  const successRate = nodes.length ? Math.round((nodes.length - failures.length) / nodes.length * 10000) / 100 : 0;
  const status = successRate >= 95 ? 'PASS' : 'FAIL';
  const result = {
    schemaVersion: 1, date, capturedAt: timestamp, shard, shardCount, status,
    totalCategories: nodes.length, completedCategories: nodes.length, failedCategories: failures.length,
    successRate, products: [...products.entries()].map(([productKey, product]) => ({ productKey, ...product })), memberships, failures
  };
  writeGzipJsonAtomic(path.join(runtimeDir, `shard-${shard}.json.gz`), result);
  writeJsonAtomic(statusFile, { ...result, products: products.size, memberships: memberships.length, finishedAt: new Date().toISOString(), failures: failures.slice(0, 50) });
  if (status !== 'PASS') throw new Error(`Shard ${shard} kalite kapısı başarısız: %${successRate}`);
  return result;
}

if (require.main === module) collect().then(result => console.log(`TAXONOMY_SHARD_OK shard=${result.shard} categories=${result.totalCategories} products=${result.products.length} memberships=${result.memberships.length} success=${result.successRate}`)).catch(error => { console.error(`TAXONOMY_SHARD_FAILED ${error.stack || error.message}`); process.exitCode = 1; });

module.exports = { collect, categoryPages, shardNodes };
