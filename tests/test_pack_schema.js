'use strict';
// T2 Check 1: zh-TW.json validity + schema
// T5: 可選 CLI 參數指定其他語言包路徑（不傳則沿用預設 zh-TW.json，保持既有用法不破壞）
const path = require('path');
const assert = require('assert');
const target = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(__dirname, '..', 'lang-packs', 'zh-TW.json');
const p = require(target);

// id / lang 的精確值只在預設（zh-TW）目標上斷言；其他語言包僅檢查格式合法
const LANG_PACK_ID_RE = /^[a-z0-9-]{1,40}$/;
const LANG_TAG_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
if (!process.argv[2]) {
  assert.strictEqual(p.id, 'zh-tw', 'id must be zh-tw');
  assert.strictEqual(p.lang, 'zh-TW', 'lang must be zh-TW');
} else {
  assert.ok(typeof p.id === 'string' && LANG_PACK_ID_RE.test(p.id), 'id 格式不合法（仅允许小写字母/数字/-，1~40 字符）: ' + p.id);
  assert.ok(typeof p.lang === 'string' && LANG_TAG_RE.test(p.lang), 'lang 不是合法的语言标签: ' + p.lang);
}
assert.strictEqual(p.base, 'en', 'base must be "en"');
assert.ok(typeof p.name === 'string' && p.name.length > 0, 'name non-empty');
assert.ok(p.dict && typeof p.dict === 'object' && !Array.isArray(p.dict), 'dict is a plain object');

let n = 0;
for (const [k, v] of Object.entries(p.dict)) {
  assert.ok(typeof k === 'string' && k.length > 0 && typeof v === 'string' && v.length > 0, 'dict 键值都必须是非空字符串, bad key: ' + k);
  n++;
}

let rn = 0;
if (p.rules !== undefined) {
  assert.ok(Array.isArray(p.rules), 'rules is an array');
  for (const r of p.rules) {
    assert.ok(
      Array.isArray(r) && r.length === 2 && typeof r[0] === 'string' && typeof r[1] === 'string',
      'rule must be [string,string]: ' + JSON.stringify(r)
    );
    new RegExp(r[0]); // throws if regex source does not compile
    rn++;
  }
}

const MAX_LANG_PACK_SIZE = 1024 * 1024; // 1MB，与 server.js validateLangPack 一致
const size = Buffer.byteLength(JSON.stringify(p), 'utf8');
assert.ok(size <= MAX_LANG_PACK_SIZE, '语言包过大（上限 1MB）：' + size + ' bytes');

console.log('CHECK1 PASS — name:', p.name, '| dict entries:', n, '| rules:', rn, '| size:', size, 'bytes');
