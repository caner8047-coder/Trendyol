#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function mkdir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function nowIstanbul() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(new Date()).reduce((a, p) => ({ ...a, [p.type]: p.value }), {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, timestamp: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+03:00` };
}
function normalize(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
function firstMatch(text, regex, group = 1) { const m = String(text || '').match(regex); return m ? normalize(m[group]) : null; }
function trNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s); return Number.isFinite(n) ? n : null;
}
function schemaNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function compactNumber(value) {
  if (!value) return null;
  const m = String(value).replace(',', '.').match(/([\d.]+)\s*(B|M|K)?\+?/i);
  if (!m) return null;
  const base = Number(m[1]);
  const mult = { B: 1000, K: 1000, M: 1000000 }[(m[2] || '').toUpperCase()] || 1;
  return Math.round(base * mult);
}
function productId(url) { return firstMatch(url, /-p-(\d+)/); }
function merchantId(url) { try { return new URL(url).searchParams.get('merchantId'); } catch { return null; } }
function brandFromUrl(url, title) {
  try {
    const slug = new URL(url).pathname.split('/').filter(Boolean)[0] || '';
    if (slug === 'h-m') return 'H&M';
    const wordCount = Math.max(1, slug.split('-').length);
    return normalize(title).split(' ').slice(0, wordCount).join(' ') || null;
  } catch { return null; }
}
function csvCell(v) {
  const raw = v === null || v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}
function writeCsv(file, rows, columns) {
  mkdir(path.dirname(file));
  const out = [columns.join(','), ...rows.map(r => columns.map(c => csvCell(r[c])).join(','))].join('\n') + '\n';
  fs.writeFileSync(file, out);
}
function readCsv(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return [];
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted && ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (ch === '\n' && !quoted) { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  row.push(cell); rows.push(row);
  const headers = rows.shift();
  return rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])));
}
const numericHistoryFields = new Set([
  'source_page','search_position','bestseller_rank','category_rank','rank_delta','trend_score','niche_score','seller_score','price','original_price','discount_percent','price_delta_percent',
  'sales_signal_min','rating','rating_count','review_count','review_delta','question_count','shipping_cost','handling_days_min','handling_days_max','transit_days_min','transit_days_max','sample_review_count','sample_review_avg','detail_age_days'
]);
const jsonHistoryFields = new Set(['campaigns','properties','data_sources','field_availability','detail_selection']);
function hydrateHistoryRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (value === '') out[key] = null;
    else if (numericHistoryFields.has(key)) out[key] = Number(value);
    else if (jsonHistoryFields.has(key)) { try { out[key] = JSON.parse(value); } catch { out[key] = value; } }
    else if (key === 'detail_ok' || key === 'detail_attempted') out[key] = value === 'true' ? true : value === 'false' ? false : null;
    else out[key] = value;
  }
  return out;
}
function latestHistoryByProduct(history) {
  const rows = history.map(hydrateHistoryRow).sort((a, b) => String(b.captured_at || b.date || '').localeCompare(String(a.captured_at || a.date || '')));
  const map = new Map();
  for (const row of rows) if (row.product_id && !map.has(row.product_id)) map.set(row.product_id, row);
  return map;
}
function chooseDetailItems(listed, history, date) {
  const topN = Number(config.dailyFullDetailTopN || 200);
  const rotateN = Number(config.dailyRotatingDetailN || 200);
  const hotLimit = Number(config.hotDetailLimit || 50);
  const reasons = new Map();
  const add = (item, reason) => {
    if (!item) return;
    if (!reasons.has(item.product_id)) reasons.set(item.product_id, new Set());
    reasons.get(item.product_id).add(reason);
  };
  listed.slice(0, topN).forEach(item => add(item, 'daily_top'));
  const rotationPool = listed.slice(topN);
  const blockCount = Math.max(1, Math.ceil(rotationPool.length / rotateN));
  const dayNumber = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  const rotationIndex = ((dayNumber % blockCount) + blockCount) % blockCount;
  rotationPool.slice(rotationIndex * rotateN, rotationIndex * rotateN + rotateN).forEach(item => add(item, `rotation_${rotationIndex + 1}_of_${blockCount}`));
  const previous = latestHistoryByProduct(history.filter(row => row.date && row.date < date));
  const hot = listed.filter(item => {
    const old = previous.get(item.product_id);
    if (!old) return false;
    const rankMove = Math.abs(Number(old.bestseller_rank || 0) - Number(item.bestseller_rank || 0));
    const priceMove = Number(old.price) > 0 && Number(item.price) > 0 ? Math.abs(Number(item.price) / Number(old.price) - 1) * 100 : 0;
    return rankMove >= 20 || priceMove >= 5 || old.stock_status !== item.stock_status;
  }).sort((a, b) => {
    const ao = previous.get(a.product_id); const bo = previous.get(b.product_id);
    return Math.abs(Number(bo?.bestseller_rank || 0) - b.bestseller_rank) - Math.abs(Number(ao?.bestseller_rank || 0) - a.bestseller_rank);
  }).slice(0, hotLimit);
  hot.forEach(item => add(item, 'hot_change'));
  const items = listed.filter(item => reasons.has(item.product_id)).map(item => ({ ...item, detail_selection: [...reasons.get(item.product_id)] }));
  return { items, reasons, topN: Math.min(topN, listed.length), rotationN: Math.min(rotateN, rotationPool.length), rotationIndex, rotationBlocks: blockCount, hotN: hot.length };
}
function extractMoney(text) {
  const lines = String(text || '').split(/\n+/).map(normalize).filter(Boolean);
  const priceLines = lines.filter(line => /\bTL\b/.test(line) && !/Kupon|Taksit|aylık|başlayan|\/adet/i.test(line));
  return priceLines.flatMap(line => [...line.matchAll(/(?:^|\s)(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:,\d{2})?)\s*TL\b/g)].map(m => trNumber(m[1])));
}
function pickCampaigns(text) {
  const patterns = [
    /Sepette\s+%\d+\s+İndirim/gi, /\d+[.,]?\d*\s*TL\s+Kupon/gi,
    /Kargo Bedava/gi, /Peşin Fiyatına\s+\d+\s+Taksit/gi,
    /Son 10 Günün En Düşük Fiyatı/gi, /Trendyol Plus'a Özel/gi,
    /Süper Fırsat Ürünü/gi
  ];
  return [...new Set(patterns.flatMap(r => [...String(text || '').matchAll(r)].map(m => normalize(m[0]))))];
}
function parseListingCard(raw, position, href, listingTitle, listingBrand, sourcePage, sourceSegment, sourceQuery, segmentPosition) {
  const text = normalize(raw);
  const monies = extractMoney(raw);
  const explicitRank = firstMatch(text, /En Çok Satan\s+(\d+)\.\s*Ürün/i);
  const price = monies.length ? monies[monies.length >= 2 ? monies.length - 2 : 0] : null;
  const originalPrice = monies.length >= 2 ? monies[monies.length - 1] : null;
  const rating = schemaNumber(firstMatch(text, /\b([1-5][.,]\d)\s*\([\d.]+\)/));
  const ratingCount = trNumber(firstMatch(text, /\b[1-5][.,]\d\s*\(([\d.]+)\)/));
  const title = normalize(listingTitle);
  return {
    product_id: productId(href), url: href.split('#')[0], merchant_id: merchantId(href),
    search_position: position, bestseller_rank: position, category_rank: explicitRank ? Number(explicitRank) : null,
    source_segment: sourceSegment, source_query: sourceQuery, segment_position: segmentPosition, source_page: sourcePage,
    listing_title: title, listing_brand: normalize(listingBrand), title,
    brand: normalize(listingBrand || brandFromUrl(href, title)),
    listing_text: text, listing_price: price, listing_original_price: originalPrice,
    price, original_price: originalPrice && originalPrice > price ? originalPrice : null,
    discount_percent: originalPrice && price && originalPrice > price ? Math.round((1 - price / originalPrice) * 1000) / 10 : null,
    currency: 'TRY', rating, rating_count: ratingCount,
    stock_status: /Stokta Yok/i.test(text) ? 'OutOfStock' : 'InStock',
    stock_signal: firstMatch(text, /(son \d+ ürün|tükenmek üzere|stokta yok)/i),
    sales_signal: firstMatch(text, /(Son\s+\d+\s+günde\s+[\d.,]+[BMK]?\+?\s+ürün\s+satıldı!?)/i),
    sales_signal_min: compactNumber(firstMatch(text, /Son\s+\d+\s+günde\s+([\d.,]+[BMK]?\+?)/i)),
    campaigns: pickCampaigns(text),
    badge: firstMatch(text, /(En Çok Satan\s+\d+\.\s*Ürün|En Çok Ziyaret Edilen\s+\d+\.\s*Ürün|En Çok Favorilenen\s+\d+\.\s*Ürün|Fenomen Seçimi)/i),
    detail_status: 'listing_only', detail_attempted: false, detail_ok: null
  };
}
async function gotoWithRetry(page, url, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2600 + i * 1200);
      const title = await page.title();
      if (/Just a moment|Access denied|Cloudflare/i.test(title)) throw new Error(`blocked title: ${title}`);
      return;
    } catch (e) { last = e; await sleep(2500 * (i + 1)); }
  }
  throw last;
}
async function collectListing(page) {
  const seen = new Set(); const unique = []; const pageStats = [];
  const segments = config.searchSegments?.length ? config.searchSegments : [{ name: 'genel-cocuk', query: config.query }];
  const maxPages = Number(config.maxPagesPerSegment || 16);
  for (const segment of segments) {
    let zeroStreak = 0; let segmentPosition = 0;
    for (let pageNo = 1; pageNo <= maxPages && unique.length < config.maxProducts; pageNo++) {
      const pageUrl = new URL(config.searchUrl);
      pageUrl.searchParams.set('q', segment.query); pageUrl.searchParams.set('qt', segment.query); pageUrl.searchParams.set('st', segment.query);
      pageUrl.searchParams.set('pi', String(pageNo));
      let cards = [];
      const contentAttempts = segment === segments[0] && pageNo === 1 ? 3 : 1;
      for (let contentAttempt = 0; contentAttempt < contentAttempts; contentAttempt++) {
        await gotoWithRetry(page, pageUrl.toString());
        for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 2200); await page.waitForTimeout(650); }
        cards = await page.locator('a[href*="-p-"]').evaluateAll(els => els.map(e => ({
          href: e.href,
          text: e.innerText,
          title: e.querySelector('.prdct-desc-cntnr-name')?.textContent || e.querySelector('h2')?.innerText || e.querySelector('img[alt]')?.getAttribute('alt') || '',
          brand: e.querySelector('.prdct-desc-cntnr-ttl')?.textContent || e.querySelector('h2 strong')?.innerText || e.querySelector('strong')?.innerText || ''
        })));
        const usable = cards.filter(card => /-p-\d+/.test(card.href) && card.text.trim() && /Sepete Ekle/i.test(card.text)).length;
        if (usable >= 10 || contentAttempt === contentAttempts - 1) break;
        await sleep(15000 * (contentAttempt + 1));
      }
      let added = 0;
      for (const card of cards) {
        const id = (card.href.match(/-p-(\d+)/) || [])[1];
        if (!id || seen.has(id) || !card.text.trim() || !/Sepete Ekle/i.test(card.text)) continue;
        seen.add(id); segmentPosition++; unique.push({ ...card, sourcePage: pageNo, sourceSegment: segment.name, sourceQuery: segment.query, segmentPosition }); added++;
        if (unique.length >= config.maxProducts) break;
      }
      pageStats.push({ segment: segment.name, query: segment.query, page: pageNo, cards: cards.length, added, segmentTotal: segmentPosition, total: unique.length, url: pageUrl.toString() });
      if (segment === segments[0] && pageNo === 1 && added < 10) throw new Error(`İlk sonuç sayfasından yalnız ${added} ürün alındı; erişim engeli olabilir.`);
      zeroStreak = added === 0 ? zeroStreak + 1 : 0;
      if (zeroStreak >= 3) break;
      await sleep(added === 0 ? config.requestDelayMs * 3 : config.requestDelayMs);
    }
    if (unique.length >= config.maxProducts) break;
  }
  return {
    items: unique.slice(0, config.maxProducts).map((c, i) => parseListingCard(c.text, i + 1, c.href, c.title, c.brand, c.sourcePage, c.sourceSegment, c.sourceQuery, c.segmentPosition)),
    pageStats
  };
}
function jsonLdProduct(items) {
  for (const raw of items) {
    try {
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed) ? parsed : parsed['@graph'] || [parsed];
      const found = candidates.find(x => x && x['@type'] === 'Product');
      if (found) return found;
    } catch {}
  }
  return {};
}
async function collectDetail(context, item, index) {
  const page = await context.newPage();
  try {
    await gotoWithRetry(page, item.url);
    const payload = await page.evaluate(() => ({
      body: document.body.innerText,
      jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(x => x.textContent),
      canonical: document.querySelector('link[rel="canonical"]')?.href || location.href
    }));
    const p = jsonLdProduct(payload.jsonld);
    const body = payload.body;
    const offer = p.offers || {};
    const rating = p.aggregateRating || {};
    const shipping = offer.shippingDetails || {};
    const delivery = shipping.deliveryTime || {};
    const title = normalize(p.name) || item.listing_title || firstMatch(body, /En Çok Satılan #\d+\s+(.+?)\s+\d[.,]\d\s+\d+ Değerlendirme/s);
    const seller = firstMatch(body, /Bu ürün\s+(.+?)\s+tarafından gönderilecektir\./i) || firstMatch(body, /Öne Çıkan Özellikler:\s*Bu ürün\s+(.+?)\s+tarafından/i);
    const sellerBlock = seller ? body.slice(Math.max(0, body.lastIndexOf(seller)), body.lastIndexOf(seller) + 250) : '';
    const price = schemaNumber(offer.price) ?? item.listing_price;
    const original = item.listing_original_price && item.listing_original_price > price ? item.listing_original_price : null;
    const stockText = firstMatch(body, /(\d+\s+adetten fazla stok sunulmuştur|son \d+ ürün|tükenmek üzere|stokta yok)/i);
    const deliveryText = firstMatch(body, /([^\n]{0,80}(?:yarın kargoda|Tahmini Teslim|en geç)[^\n]{0,100})/i);
    const question = firstMatch(body, /([\d.,]+)\s+Soru-Cevap/i);
    const reviews = Array.isArray(p.review) ? p.review : [];
    const properties = Object.fromEntries((p.additionalProperty || []).map(x => [normalize(x.name), normalize(x.unitText || x.value)]));
    return {
      ...item, detail_status: 'refreshed', detail_attempted: true, detail_ok: true, detail_error: null, canonical_url: payload.canonical,
      title, brand: normalize(p.brand?.name || p.manufacturer || item.listing_brand || brandFromUrl(item.url, title)), category: normalize(p.pattern),
      seller_name: seller, seller_score: trNumber(firstMatch(sellerBlock, new RegExp(`${String(seller || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+([0-9]+(?:[.,][0-9]+)?)`))),
      price, original_price: original,
      discount_percent: original && price ? Math.round((1 - price / original) * 1000) / 10 : null,
      currency: offer.priceCurrency || 'TRY', campaigns: [...new Set([...(item.campaigns || []), ...pickCampaigns(body)])],
      stock_status: String(offer.availability || '').split('/').pop() || (/stokta yok/i.test(body) ? 'OutOfStock' : (/Sepete Ekle|Şimdi Al/i.test(body) ? 'InStock' : null)), stock_signal: stockText,
      rating: Number(rating.ratingValue) || schemaNumber(firstMatch(body, /\n(\d[.,]\d)\n[\d.]+\s+Değerlendirme/i)) || null,
      rating_count: Number(rating.ratingCount) || trNumber(firstMatch(body, /\n([\d.]+)\s+Değerlendirme/i)) || null,
      review_count: Number(rating.reviewCount) || null, question_count: trNumber(question),
      sales_signal: item.sales_signal || firstMatch(body, /(\d+\s+günde\s+[\d.,]+[BMK]?\+?\s+ürün satıldı!?)/i),
      sales_signal_min: compactNumber(firstMatch(body, /\d+\s+günde\s+([\d.,]+[BMK]?\+?)/i)),
      basket_signal: firstMatch(body, /([\d.,]+[BMK]?\s+kişinin sepetinde)/i),
      favorite_signal: firstMatch(body, /([\d.,]+[BMK]?\s+kişi favoriledi)/i),
      view_signal: firstMatch(body, /(Son 24 saatte\s+[\d.,]+[BMK]?\s+kişi görüntüledi)/i),
      shipping_cost: trNumber(shipping.shippingRate?.value), shipping_currency: shipping.shippingRate?.currency || null,
      handling_days_min: Number(delivery.handlingTime?.minValue) || 0, handling_days_max: Number(delivery.handlingTime?.maxValue) || null,
      transit_days_min: Number(delivery.transitTime?.minValue) || null, transit_days_max: Number(delivery.transitTime?.maxValue) || null,
      delivery_summary: deliveryText, image_url: Array.isArray(p.image?.contentUrl) ? p.image.contentUrl[0] : p.image?.contentUrl || p.image || null,
      properties, sample_review_count: reviews.length,
      sample_review_avg: reviews.length ? Math.round(reviews.reduce((a, r) => a + Number(r.reviewRating?.ratingValue || 0), 0) / reviews.length * 100) / 100 : null
    };
  } catch (e) {
    return { ...item, detail_status: 'failed', detail_attempted: true, detail_ok: false, detail_error: normalize(e.message).slice(0, 300) };
  } finally { await page.close(); await sleep(config.requestDelayMs); }
}
function ageInDays(date, timestamp) {
  if (!timestamp) return null;
  const current = Date.parse(`${date}T00:00:00Z`);
  const previous = Date.parse(`${String(timestamp).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(current) && Number.isFinite(previous) ? Math.max(0, Math.floor((current - previous) / 86400000)) : null;
}
function mergePoolProducts(listed, detailResults, history, timestamp, date, selection) {
  const resultMap = new Map(detailResults.map(p => [p.product_id, p]));
  const previous = latestHistoryByProduct(history);
  return listed.map(item => {
    const old = previous.get(item.product_id);
    const fresh = resultMap.get(item.product_id);
    let base;
    if (fresh?.detail_ok) {
      base = { ...old, ...fresh, detail_status: 'refreshed', detail_attempted: true, detail_ok: true, detail_refreshed_at: timestamp, detail_age_days: 0 };
    } else if (fresh) {
      const oldRefreshedAt = old?.detail_refreshed_at || old?.captured_at || null;
      base = { ...old, ...item, ...fresh, detail_status: old ? 'failed_carried_forward' : 'failed', detail_attempted: true, detail_ok: false, detail_refreshed_at: oldRefreshedAt, detail_age_days: ageInDays(date, oldRefreshedAt) };
    } else {
      const oldRefreshedAt = old?.detail_refreshed_at || (old?.detail_ok ? old.captured_at : null);
      base = { ...old, ...item, detail_status: oldRefreshedAt ? 'carried_forward' : 'listing_only', detail_attempted: false, detail_ok: null, detail_refreshed_at: oldRefreshedAt, detail_age_days: ageInDays(date, oldRefreshedAt), detail_selection: [] };
    }
    base.date = date; base.captured_at = timestamp; base.query = config.query; base.sort = config.sort;
    base.data_sources = base.detail_status === 'refreshed' ? ['search_result_dom','product_detail_jsonld','product_detail_dom'] : old ? ['search_result_dom','historical_product_detail'] : ['search_result_dom'];
    return base;
  });
}
function previousByProduct(history, today) {
  const prior = history.filter(r => r.date && r.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const map = new Map(); for (const r of prior) if (!map.has(r.product_id)) map.set(r.product_id, r); return map;
}
function scoreProducts(products, history, today) {
  const previous = previousByProduct(history, today);
  return products.map(p => {
    const old = previous.get(p.product_id);
    const rankDelta = old ? Number(old.bestseller_rank || 0) - Number(p.bestseller_rank || 0) : null;
    const priceDeltaPct = old && Number(old.price) ? Math.round((Number(p.price) / Number(old.price) - 1) * 1000) / 10 : null;
    const reviewDelta = old ? Number(p.review_count || 0) - Number(old.review_count || 0) : null;
    const competitionCount = p.review_count ?? p.rating_count;
    const trendScore = Math.round((Math.max(0, 40 - p.bestseller_rank) * 2 + Math.log10((competitionCount || 0) + 1) * 8 + Math.min(30, (p.sales_signal_min || 0) / 50) + Math.max(0, p.discount_percent || 0)) * 10) / 10;
    const nicheScore = competitionCount === null || competitionCount === undefined ? null : Math.round((Math.min(50, (p.sales_signal_min || 0) / 20) + Math.max(0, 30 - Math.log10(competitionCount + 1) * 8) + Math.max(0, 25 - p.bestseller_rank / 2)) * 10) / 10;
    return { ...p, rank_delta: rankDelta, price_delta_percent: priceDeltaPct, review_delta: reviewDelta, trend_score: trendScore, niche_score: nicheScore };
  });
}
const columns = [
  'date','captured_at','query','sort','source_segment','source_query','segment_position','source_page','search_position','bestseller_rank','category_rank','rank_delta','trend_score','niche_score',
  'product_id','merchant_id','title','brand','category','url','seller_name','seller_score','price','original_price','discount_percent','price_delta_percent','currency',
  'campaigns','stock_status','stock_signal','sales_signal','sales_signal_min','rating','rating_count','review_count','review_delta','question_count',
  'basket_signal','favorite_signal','view_signal','shipping_cost','shipping_currency','handling_days_min','handling_days_max','transit_days_min','transit_days_max','delivery_summary',
  'badge','image_url','properties','sample_review_count','sample_review_avg','detail_status','detail_selection','detail_attempted','detail_refreshed_at','detail_age_days','data_sources','field_availability','detail_ok','detail_error'
];
function mdTable(rows, fields) {
  if (!rows.length) return '_Bugün bu liste için yeterli karşılaştırmalı sinyal oluşmadı._';
  const header = `| ${fields.map(f => f[1]).join(' | ')} |\n| ${fields.map(() => '---').join(' | ')} |`;
  const body = rows.map(r => `| ${fields.map(([k]) => {
    const value = normalize(Array.isArray(r[k]) ? r[k].join('; ') : r[k] ?? '-').replace(/\|/g, '/');
    return k === 'title' && r.url && value !== '-' ? `[${value.replace(/\]/g, '\\]')}](${r.url})` : value;
  }).join(' | ')} |`).join('\n');
  return `${header}\n${body}`;
}
const listCols = ['bestseller_rank','rank_delta','trend_score','niche_score','product_id','title','brand','seller_name','price','original_price','price_delta_percent','stock_status','sales_signal','rating','review_count','review_delta','question_count','campaigns','delivery_summary','detail_status','detail_age_days','url'];
const listMdFields = [['bestseller_rank','Sıra'],['rank_delta','Sıra Δ'],['trend_score','Trend'],['niche_score','Niche'],['title','Ürün'],['brand','Marka'],['seller_name','Satıcı'],['price','Fiyat TL'],['stock_status','Stok'],['rating','Puan'],['review_count','Yorum'],['question_count','Soru'],['detail_status','Detay'],['detail_age_days','Yaş (gün)'],['campaigns','Kampanya']];
const listTitles = {
  'rising.csv': 'Yükselen Ürünler', 'falling.csv': 'Düşen Ürünler', 'trending.csv': 'Trend Ürünler',
  'niche.csv': 'Niche Fırsatlar', 'campaigns.csv': 'Kampanyalı Ürünler',
  'stock-risk.csv': 'Stok Riski', 'price-drops.csv': 'Fiyatı Düşen Ürünler'
};
function buildLists(scored) {
  return {
    'rising.csv': scored.filter(p=>(p.rank_delta||0)>0||(p.review_delta||0)>0).sort((a,b)=>(b.rank_delta||0)-(a.rank_delta||0)||(b.review_delta||0)-(a.review_delta||0)),
    'falling.csv': scored.filter(p=>(p.rank_delta||0)<0||p.stock_status==='OutOfStock').sort((a,b)=>(a.rank_delta||0)-(b.rank_delta||0)),
    'trending.csv': [...scored].sort((a,b)=>b.trend_score-a.trend_score),
    'niche.csv': scored.filter(p=>(p.sales_signal_min||0)>=100&&(p.review_count??p.rating_count)!==null&&(p.review_count??p.rating_count)<2500).sort((a,b)=>b.niche_score-a.niche_score),
    'campaigns.csv': scored.filter(p=>p.campaigns?.length||p.discount_percent).sort((a,b)=>(b.discount_percent||0)-(a.discount_percent||0)),
    'stock-risk.csv': scored.filter(p=>p.stock_status==='OutOfStock'||/son \d+ ürün|tüken/i.test(p.stock_signal||'')),
    'price-drops.csv': scored.filter(p=>(p.price_delta_percent||0)<0).sort((a,b)=>a.price_delta_percent-b.price_delta_percent)
  };
}
function median(nums) { const a = nums.filter(Number.isFinite).sort((x,y)=>x-y); return a.length ? a[Math.floor(a.length / 2)] : null; }
function generateReport(products, date, quality) {
  const rising = products.filter(p => (p.rank_delta || 0) > 0 || (p.review_delta || 0) > 0).sort((a,b)=>(b.rank_delta||0)-(a.rank_delta||0)||(b.review_delta||0)-(a.review_delta||0));
  const falling = products.filter(p => (p.rank_delta || 0) < 0 || p.stock_status === 'OutOfStock').sort((a,b)=>(a.rank_delta||0)-(b.rank_delta||0));
  const trending = [...products].sort((a,b)=>b.trend_score-a.trend_score);
  const niche = products.filter(p => (p.sales_signal_min || 0) >= 100 && (p.review_count ?? p.rating_count) !== null && (p.review_count ?? p.rating_count) < 2500).sort((a,b)=>b.niche_score-a.niche_score);
  const campaigns = products.filter(p => p.campaigns?.length || p.discount_percent).sort((a,b)=>(b.discount_percent||0)-(a.discount_percent||0));
  const stockRisk = products.filter(p => p.stock_status === 'OutOfStock' || /son \d+ ürün|tüken/i.test(p.stock_signal || ''));
  const prices = products.map(p => Number(p.price)).filter(Number.isFinite);
  const brandCounts = Object.entries(products.reduce((a,p)=>{a[p.brand||'Belirsiz']=(a[p.brand||'Belirsiz']||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const themes = [
    ['Manyetik yapı/puzzle', /manyetik|mıknatıs|magnet|puzzle|blok/i],
    ['Çocuk giyim/aksesuar', /pantolon|üst|boxer|ayakkabı|toka|çanta|giyim/i],
    ['Duyusal/eğitici oyuncak', /duyusal|eğitici|montessori|fidget|zeka/i]
  ].map(([name,re]) => [name, products.filter(p=>re.test(p.title||'')).length]).sort((a,b)=>b[1]-a[1]);
  const priceBands = [
    ['250 TL altı', p=>p<250], ['250–500 TL', p=>p>=250&&p<500],
    ['500–1.000 TL', p=>p>=500&&p<1000], ['1.000 TL+', p=>p>=1000]
  ].map(([name,fn])=>[name, prices.filter(fn).length]);
  const firstDay = products.every(p => p.rank_delta === null);
  const detailStrategy = Number(quality.selection?.topN || 0) >= products.length
    ? `${products.length} ürünün tamamı günlük detay yenilemesinde.`
    : `İlk ${quality.selection?.topN || 0} ürün günlük, ${quality.selection?.rotationN || 0} ürün dönüşümlü yenileniyor${quality.selection?.hotN ? `; ${quality.selection.hotN} hızlı değişen ürün ayrıca önceliklendirildi` : ''}.`;
  const topFields = [['bestseller_rank','Sıra'],['title','Ürün'],['price','Fiyat TL'],['seller_name','Satıcı'],['rating','Puan'],['rating_count','Değerlendirme'],['review_count','Yorum'],['question_count','Soru'],['sales_signal','Satış sinyali']];
  return `# Trendyol Çocuk En Çok Satanlar — ${date}\n\n` +
    `> Kaynak: [Trendyol çocuk / En Çok Satan](${config.searchUrl})\n> Toplama zamanı: ${products[0]?.captured_at || '-'}\n> Havuz: ${products.length} ürün | Bugün detay yenilenen: ${quality.detailRefreshed}/${quality.detailAttempted} | Kalite: **${quality.status}**\n\n` +
    `## Yönetici özeti\n\n` +
    `- İzlenen ürünlerde medyan fiyat **${median(prices)?.toLocaleString('tr-TR') || '-'} TL**.\n` +
    `- En görünür markalar: ${brandCounts.map(([b,c])=>`${b} (${c})`).join(', ') || '-'}.\n` +
    `- Baskın ürün temaları: ${themes.map(([t,c])=>`${t} (${c})`).join(', ')}.\n` +
    `- Fiyat dağılımı: ${priceBands.map(([b,c])=>`${b}: ${c}`).join(', ')}.\n` +
    `- Kampanyalı ürün: **${campaigns.length}**, açık stok riski: **${stockRisk.length}**.\n` +
    `- Detay stratejisi: ${detailStrategy}\n` +
    `- Havuz durumu: **${quality.detailRefreshed}** bugün yenilendi, **${quality.carriedForward}** geçmiş detay taşıyor, **${quality.listingOnly}** yalnız liste sinyalleriyle izleniyor.\n` +
    `- ${firstDay ? 'Bugün baz çizgisi oluşturuldu; yükseliş/düşüş yorumu ikinci günlük ölçümden itibaren güvenilirleşecek.' : `Yükseliş sinyali ${rising.length}, düşüş sinyali ${falling.length} üründe görüldü.`}\n\n` +
    `## En çok satan ürünler\n\n${mdTable(products.slice(0,15), topFields)}\n\n` +
    `## Yükselen ürünler\n\n${mdTable(rising.slice(0,15), [['rank_delta','Sıra artışı'],['title','Ürün'],['price_delta_percent','Fiyat Δ%'],['review_delta','Yorum Δ'],['sales_signal','Satış sinyali']])}\n\n` +
    `## Düşen ürünler\n\n${mdTable(falling.slice(0,15), [['rank_delta','Sıra değişimi'],['title','Ürün'],['price_delta_percent','Fiyat Δ%'],['stock_status','Stok'],['stock_signal','Stok sinyali']])}\n\n` +
    `## Trend listesi\n\n${mdTable(trending.slice(0,15), [['trend_score','Trend skoru'],['bestseller_rank','Sıra'],['title','Ürün'],['sales_signal','Satış'],['review_count','Yorum'],['campaigns','Kampanya']])}\n\n` +
    `## Niche fırsat listesi\n\n${mdTable(niche.slice(0,15), [['niche_score','Niche skoru'],['title','Ürün'],['sales_signal','Satış'],['rating_count','Değerlendirme'],['review_count','Yorum'],['price','Fiyat TL'],['seller_name','Satıcı']])}\n\n` +
    `## Kampanya ve fiyat fırsatları\n\n${mdTable(campaigns.slice(0,15), [['discount_percent','İndirim %'],['title','Ürün'],['price','Fiyat TL'],['original_price','Eski fiyat'],['campaigns','Kampanyalar']])}\n\n` +
    `## Stok ve teslimat izlemesi\n\n${mdTable(products.slice(0,15), [['title','Ürün'],['stock_status','Stok'],['stock_signal','Stok sinyali'],['delivery_summary','Teslimat'],['seller_name','Satıcı']])}\n\n` +
    `## E-ticaret ve dijital pazarlama yorumu\n\n` +
    `1. **Talep doğrulama:** Yüksek satış sinyali ile düşük/orta değerlendirme hacmini birlikte taşıyan ürünler niche testine öncelik vermeli; yalnız sıralama rozetine bakılmamalı.\n` +
    `2. **Fiyat stratejisi:** Kampanya oranı yüksek ürünlerde indirimin kalıcılığı günlük fiyat geçmişinden kontrol edilmeli. Tek günlük “indirim” etiketi marj kararı için yeterli değildir.\n` +
    `3. **Reklam stratejisi:** Trend skoru yüksek, stokta olan ve hızlı teslim sinyali taşıyan ürünler performans reklamı için ilk adaylardır. Stok riski olan ürünlerde bütçe azaltılmalıdır.\n` +
    `4. **Ürün geliştirme:** Niche listesinde tekrarlanan tema, yaş, paket içeriği ve özellikler yeni ürün/tedarik brief'ine dönüştürülmelidir.\n` +
    `5. **Müşteri içgörüsü:** Soru ve yorum artışı, satış sinyalinden önce hızlanıyorsa yaklaşan talebin öncü göstergesi olarak izlenmelidir.\n` +
    `6. **Bugünün aksiyonu:** ${niche[0] ? `Niche testinde önce “${niche[0].title}” benzeri ürünlerin tedarik maliyeti, reklam CPC'si ve yorum bariyeri doğrulansın.` : 'İlk karşılaştırma verisi oluşana kadar küçük bütçeli ürün/anahtar kelime testleriyle talep doğrulansın.'}\n\n` +
    `## Veri kalitesi\n\n` +
    `- ${products.length} ürünlük çekirdek alan kapsaması: **${quality.coreCoverage}%**\n- Planlanan detay denemesi: **${quality.detailAttempted}**\n- Detay sayfası başarısı: **${quality.detailSuccessRate}%**\n- Yenilenen detaylarda satıcı kapsaması: **${quality.detailCoverage?.seller_name || 0}%**\n- Yenilenen detaylarda değerlendirme kapsaması: **${quality.detailCoverage?.rating_count || 0}%**\n- Havuz genelinde eksikliği yüksek alanlar: ${quality.lowCoverageFields.join(', ') || 'yok'}\n` +
    `\n_Not: Sıralama ve görünür sinyaller Trendyol sayfasının toplama anındaki durumudur; gerçek satış adedi veya stok miktarı olarak yorumlanmamalıdır._\n`;
}
function qualityFor(products) {
  const fields = ['product_id','title','url','price','seller_name','stock_status','rating','rating_count','review_count','question_count','delivery_summary'];
  const coverageFor = rows => Object.fromEntries(fields.map(f => [f, rows.length ? Math.round(rows.filter(p => p[f] !== null && p[f] !== undefined && p[f] !== '').length / rows.length * 1000) / 10 : 0]));
  const coverage = coverageFor(products);
  const attempted = products.filter(p => p.detail_attempted === true);
  const refreshed = products.filter(p => p.detail_status === 'refreshed' && p.detail_ok === true);
  const detailCoverage = coverageFor(refreshed);
  const core = ['product_id','title','url','price'];
  const coreCoverage = Math.round(core.reduce((a,f)=>a+coverage[f],0)/core.length*10)/10;
  const detailSuccessRate = attempted.length ? Math.round(refreshed.length/attempted.length*1000)/10 : 0;
  const detailTarget = Math.min(products.length, Number(config.dailyFullDetailTopN || 200) + Number(config.dailyRotatingDetailN || 200));
  const status = products.length >= Number(config.minimumProducts || config.maxProducts || 200) && coreCoverage >= 95 && attempted.length >= detailTarget && detailSuccessRate >= 80 && detailCoverage.seller_name >= 80 && coverage.stock_status >= 90 && detailCoverage.rating_count >= 80 ? 'PASS' : 'FAIL';
  return {
    status, productCount: products.length, coreCoverage, detailTarget,
    detailAttempted: attempted.length, detailRefreshed: refreshed.length, detailSuccessRate,
    carriedForward: products.filter(p=>/carried_forward/.test(p.detail_status || '')).length,
    listingOnly: products.filter(p=>p.detail_status === 'listing_only').length,
    coverage, detailCoverage, lowCoverageFields: fields.filter(f=>coverage[f]<70)
  };
}
async function main() {
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome bulunamadı: ${CHROME}`);
  const { date, timestamp } = nowIstanbul();
  mkdir(path.join(ROOT, 'data')); mkdir(path.join(ROOT, 'reports')); mkdir(path.join(ROOT, 'quality'));
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--disable-blink-features=AutomationControlled','--lang=tr-TR'] });
  const context = await browser.newContext({ locale: 'tr-TR', timezoneId: config.timezone, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' });
  let scored;
  try {
    const listingPage = await context.newPage();
    const listingResult = await collectListing(listingPage); await listingPage.close();
    const listed = listingResult.items;
    if (process.argv.includes('--listing-only')) {
      console.log(JSON.stringify({ ok: listed.length >= Number(config.minimumProducts || config.maxProducts || 100), listingOnly: true, uniqueProducts: listed.length, pageStats: listingResult.pageStats, first: listed[0], last: listed[listed.length - 1] }, null, 2));
      if (listed.length < Number(config.minimumProducts || config.maxProducts || 100)) process.exitCode = 2;
      return;
    }
    if (listed.length < Number(config.minimumProducts || config.maxProducts || 100)) throw new Error(`Liste sayfalarından yalnız ${listed.length} benzersiz ürün alındı; gereken minimum ${config.minimumProducts || config.maxProducts || 100}. Son geçerli rapor korunuyor. Sayfa özeti: ${JSON.stringify(listingResult.pageStats)}`);
    const historyFile = path.join(ROOT, 'data', 'history.csv');
    const history = readCsv(historyFile);
    const selection = chooseDetailItems(listed, history, date);
    const detailed = new Array(selection.items.length); let cursor = 0;
    async function worker() { while (true) { const i = cursor++; if (i >= selection.items.length) return; detailed[i] = await collectDetail(context, selection.items[i], i); } }
    await Promise.all(Array.from({ length: Math.max(1, config.detailConcurrency) }, worker));
    const pooled = mergePoolProducts(listed, detailed, history, timestamp, date, selection);
    const availabilityFields = ['title','brand','seller_name','seller_score','price','original_price','campaigns','stock_status','stock_signal','rating','rating_count','review_count','question_count','delivery_summary','shipping_cost','properties'];
    const enriched = pooled.map(p => {
      const base = { ...p };
      base.field_availability = Object.fromEntries(availabilityFields.map(f => [f, base[f] === null || base[f] === undefined || base[f] === '' || (Array.isArray(base[f]) && !base[f].length) ? 'unavailable' : 'observed']));
      return base;
    });
    scored = scoreProducts(enriched, history, date);
    const quality = qualityFor(scored); quality.date = date; quality.generatedAt = timestamp;
    quality.selection = { topN: selection.topN, rotationN: selection.rotationN, rotationIndex: selection.rotationIndex + 1, rotationBlocks: selection.rotationBlocks, hotN: selection.hotN };
    if (quality.status !== 'PASS') {
      console.log(JSON.stringify({ ok: false, date, quality, preservedLastValidReport: true }, null, 2));
      process.exitCode = 2;
      return;
    }
    const snapshotDir = path.join(ROOT, 'snapshots', date); mkdir(snapshotDir);
    fs.writeFileSync(path.join(snapshotDir, 'products.json'), JSON.stringify(scored, null, 2) + '\n');
    writeCsv(path.join(snapshotDir, 'products.csv'), scored, columns);
    const oldOtherDays = history.filter(r => r.date !== date);
    writeCsv(historyFile, [...oldOtherDays, ...scored], columns);
    const listsDir = path.join(ROOT, 'lists', date); mkdir(listsDir);
    const lists = buildLists(scored);
    for (const [name, rows] of Object.entries(lists)) {
      writeCsv(path.join(listsDir, name), rows, listCols);
      fs.writeFileSync(path.join(listsDir, name.replace(/\.csv$/, '.md')), `# ${listTitles[name]} — ${date}\n\n${mdTable(rows, listMdFields)}\n`);
    }
    fs.writeFileSync(path.join(ROOT, 'quality', `${date}.json`), JSON.stringify(quality, null, 2) + '\n');
    fs.writeFileSync(path.join(ROOT, 'quality', 'latest.json'), JSON.stringify(quality, null, 2) + '\n');
    const report = generateReport(scored, date, quality);
    fs.writeFileSync(path.join(ROOT, 'reports', `${date}.md`), report);
    fs.writeFileSync(path.join(ROOT, 'reports', 'latest.md'), report);
    const topTrend = [...scored].sort((a,b)=>b.trend_score-a.trend_score).slice(0,3);
    const topNiche = scored.filter(p=>(p.sales_signal_min||0)>=100&&(p.review_count??p.rating_count)!==null&&(p.review_count??p.rating_count)<2500).sort((a,b)=>b.niche_score-a.niche_score).slice(0,3);
    const telegram = [
      `📊 Trendyol Çocuk Günlük Raporu — ${date}`,
      `✅ ${scored.length} ürünlük havuz | ${quality.detailRefreshed}/${quality.detailAttempted} detay yenilendi | kalite ${quality.status}`,
      `♻️ İlk ${quality.selection.topN} günlük + ${quality.selection.rotationN} dönüşümlü + ${quality.selection.hotN} hızlı değişen ürün`,
      `🔥 Trend: ${topTrend.map((p,i)=>`${i+1}) ${p.title} (${p.price} TL)`).join(' | ')}`,
      `🎯 Niche: ${topNiche.map((p,i)=>`${i+1}) ${p.title}`).join(' | ') || 'Baz çizgisi oluşuyor'}`,
      `📁 GitHub: https://github.com/caner8047-coder/Trendyol/blob/main/reports/${date}.md`,
      `Not: Yükselen/düşen listeleri ikinci ölçümden itibaren günlük farklarla dolacaktır.`
    ].join('\n');
    fs.writeFileSync(path.join(ROOT, 'reports', 'telegram-latest.txt'), telegram + '\n');
    fs.writeFileSync(path.join(ROOT, 'data', 'latest.json'), JSON.stringify(scored, null, 2) + '\n');
    writeCsv(path.join(ROOT, 'data', 'latest.csv'), scored, columns);
    console.log(JSON.stringify({ ok: quality.status === 'PASS', date, quality, files: { report: `reports/${date}.md`, snapshot: `snapshots/${date}/products.csv`, lists: `lists/${date}` } }, null, 2));
  } finally { await context.close(); await browser.close(); }
}
module.exports = { ROOT, columns, listCols, listMdFields, listTitles, buildLists, generateReport, mdTable, qualityFor, writeCsv };
if (require.main === module) main().catch(err => { console.error(err.stack || err.message); process.exit(1); });
