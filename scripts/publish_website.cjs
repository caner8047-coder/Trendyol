#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROFILES = [
  ['cocuk', ''],
  ['erkek', 'categories/erkek'],
  ['ev-yasam', 'categories/ev-yasam'],
  ['kadin', 'categories/kadin'],
  ['genel-cok-satanlar', 'categories/genel-cok-satanlar'],
  ['supermarket', 'categories/supermarket'],
  ['kozmetik', 'categories/kozmetik'],
  ['elektronik', 'categories/elektronik'],
  ['mobilya', 'categories/mobilya']
];

function cliArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  const inline = process.argv.find(arg => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  return index >= 0 ? process.argv[index + 1] : null;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function publishProfile(baseUrl, secret, profile, prefix) {
  const root = path.join(ROOT, prefix);
  const quality = readJson(path.join(root, 'quality', 'latest.json'));
  const products = readJson(path.join(root, 'data', 'latest.json'));
  if (quality.status !== 'PASS' || products.length < 200) {
    throw new Error(`${profile}: kalite kapısı yayınlamayı reddetti`);
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/pazar-nabzi/ingest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      profile,
      quality,
      products,
      sourceCommit: process.env.GITHUB_SHA || null
    }),
    signal: AbortSignal.timeout(90000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) {
    throw new Error(`${profile}: HTTP ${response.status} ${JSON.stringify(result)}`);
  }
  console.log(`PUBLISH_OK profile=${profile} products=${result.productCount}`);
}

async function main() {
  const baseUrl = process.env.VERI_MIMARI_INGEST_URL || '';
  const secret = process.env.VERI_MIMARI_INGEST_SECRET || '';
  if (!baseUrl || !secret) {
    console.log('PUBLISH_SKIPPED Veri Mimarı yayın sırları henüz tanımlanmadı.');
    return;
  }
  const requested = cliArg('profile');
  const selected = requested ? PROFILES.filter(([profile]) => profile === requested) : PROFILES;
  if (!selected.length) throw new Error(`Bilinmeyen profil: ${requested}`);
  for (const [profile, prefix] of selected) {
    await publishProfile(baseUrl, secret, profile, prefix);
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
