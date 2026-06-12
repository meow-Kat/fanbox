'use strict';
// T2 Check 2: coverage regression vs public/i18n-dict.js
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'public', 'i18n-dict.js'));
const p = require(path.join(__dirname, '..', 'lang-packs', 'zh-TW.json'));

const ks = Object.keys(global.window.FANBOX_DICT);
const miss = ks.filter((k) => !(k in p.dict));
console.log('dict keys total:', ks.length, '| covered:', ks.length - miss.length, '| missing:', miss.length);
if (miss.length) {
  console.log('--- missing keys (eyeball: should all be claimed-identical strings) ---');
  for (const k of miss) console.log(JSON.stringify(k));
}

// rules coverage vs built-in EN rules count (informational)
const enRules = global.window.FANBOX_DICT_RULES || [];
console.log('built-in EN rules:', enRules.length, '| pack rules:', (p.rules || []).length);

// simplified-only char scan on missing keys (these chars differ in Traditional)
const SIMP = /[检个条钟刚变边见项显师线导们这为对时间动开关闭后发设话语简译词读写错误请录复制贴粘搜寻档资夹应该当从让说]/;
const suspicious = miss.filter((k) => SIMP.test(k));
if (suspicious.length) {
  console.log('--- SUSPICIOUS missing keys (contain simplified-variant chars) ---');
  for (const k of suspicious) console.log(JSON.stringify(k));
  process.exitCode = 1;
} else {
  console.log('CHECK2: no missing key contains simplified-variant chars from scan set');
}
