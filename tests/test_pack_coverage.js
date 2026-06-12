'use strict';
// P4 (english-base-i18n-migration): pack key-space regression vs public/i18n-dict.js.
// Key space is now ENGLISH (en -> target language). Checks:
//   1. pack dict keys are a SUBSET of FANBOX_DICT keys (extra keys = orphans, FAIL);
//   2. zh-TW (default target): FULL coverage required — the fallback language is now
//      English, so any omitted key leaks English into the zh-TW UI (old "繁简同形可省略"
//      rationale no longer applies);
//   3. TEMPLATE.json: exact key-set equality (it is generated from FANBOX_DICT).
// Usage: node tests/test_pack_coverage.js [path/to/pack.json]   (default lang-packs/zh-TW.json)
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'public', 'i18n-dict.js'));
const DICT = global.window.FANBOX_DICT;
const DICT_KEYS = new Set(Object.keys(DICT));

const target = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(__dirname, '..', 'lang-packs', 'zh-TW.json');
const p = require(target);
const packKeys = Object.keys(p.dict || {});

const missing = [...DICT_KEYS].filter((k) => !(k in p.dict));
const extra = packKeys.filter((k) => !DICT_KEYS.has(k));

let fail = 0;
const check = (ok, label, detail) => {
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + label + (detail ? ' | ' + detail : ''));
  if (!ok) fail++;
};

console.log('pack:', path.basename(target), '| id:', p.id, '| base:', p.base);
console.log('dict keys total:', DICT_KEYS.size, '| covered:', DICT_KEYS.size - missing.length,
  '| missing:', missing.length, '| extra (not in FANBOX_DICT):', extra.length);

// 1. subset — always enforced
check(extra.length === 0, 'pack keys ⊆ FANBOX_DICT keys (no orphan keys)',
  extra.length ? extra.slice(0, 10).map((k) => JSON.stringify(k)).join(', ') : undefined);

const isTemplate = path.basename(target) === 'TEMPLATE.json' || p.id === 'my-language';
const isZhTW = p.id === 'zh-tw';

if (isTemplate) {
  // 3. exact key-set equality
  check(missing.length === 0 && extra.length === 0,
    'TEMPLATE key set == FANBOX_DICT key set',
    `missing=${missing.length} extra=${extra.length}`);
} else if (isZhTW) {
  // 2. full coverage
  check(missing.length === 0,
    `zh-TW FULL coverage (${DICT_KEYS.size - missing.length}/${DICT_KEYS.size}) — omissions leak English`,
    missing.length ? missing.slice(0, 10).map((k) => JSON.stringify(k)).join(', ') : undefined);
} else {
  console.log('INFO | third-party pack: coverage informational only ('
    + (DICT_KEYS.size - missing.length) + '/' + DICT_KEYS.size + ')');
  if (missing.length) for (const k of missing.slice(0, 20)) console.log('  missing: ' + JSON.stringify(k));
}

// rules count — informational (zh-TW flattens the 5 function-style built-ins into string templates)
console.log('INFO | built-in EN rules:', (global.window.FANBOX_DICT_RULES || []).length,
  '| pack rules:', (p.rules || []).length);

process.exitCode = fail ? 1 : 0;
console.log(fail ? `COVERAGE FAIL (${fail} failures)` : 'COVERAGE PASS');
