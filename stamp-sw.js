#!/usr/bin/env node
/* ==================================================================
   tools/stamp-sw.js — inject a build id into sw.js
   ==================================================================
   The service worker's cache name must change on every deploy, otherwise the
   previous shell survives the update (the cache-poisoning risk in the audit).
   Hand-editing CACHE_VERSION was the old, forgettable way; this script derives
   it from the content of the files that make up the shell.

   Usage:
     node tools/stamp-sw.js            # rewrite sw.js in place
     node tools/stamp-sw.js --check    # exit 1 if sw.js still has __BUILD_ID__
     node tools/stamp-sw.js --out dist # write dist/sw.js instead

   No dependencies.
   ================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const outDir = outArg > -1 ? path.resolve(root, args[outArg + 1]) : root;
const checkOnly = args.includes('--check');

const PLACEHOLDER = '__BUILD_ID__';
/* Only the CACHE_VERSION declaration is the stamp target. sw.js also compares
   against the placeholder at runtime (to warn when unstamped), so searching the
   whole file made --check fail forever and a second run rewrite that comparison. */
const DECL = /(var\s+CACHE_VERSION\s*=\s*)'__BUILD_ID__'/;
const swPath = path.join(root, 'sw.js');
const shellFiles = ['index.html', 'style.css', 'script.js', 'config.js'];

if (checkOnly) {
  const src = fs.readFileSync(swPath, 'utf8');
  if (DECL.test(src)) {
    console.error('sw.js is unstamped — run `node tools/stamp-sw.js` before deploying.');
    process.exit(1);
  }
  console.log('sw.js is stamped.');
  process.exit(0);
}

const hash = crypto.createHash('sha256');
shellFiles.forEach((f) => {
  const p = path.join(root, f);
  hash.update(f);
  if (fs.existsSync(p)) hash.update(fs.readFileSync(p));
});
const id = hash.digest('hex').slice(0, 12);
const buildId = 'das-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + id;

const src = fs.readFileSync(swPath, 'utf8');
if (!DECL.test(src)) {
  console.log('sw.js already stamped with a fixed id; nothing to do.');
  process.exit(0);
}

const out = src.replace(DECL, "$1'" + buildId + "'");
fs.mkdirSync(outDir, { recursive: true });
const target = path.join(outDir, 'sw.js');
fs.writeFileSync(target, out, 'utf8');
console.log('Stamped ' + path.relative(root, target) + ' with CACHE_VERSION "' + buildId + '".');
