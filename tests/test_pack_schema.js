'use strict';
// T2 Check 1: zh-TW.json validity + schema
const path = require('path');
const assert = require('assert');
const p = require(path.join(__dirname, '..', 'lang-packs', 'zh-TW.json'));

assert.strictEqual(p.id, 'zh-tw', 'id must be zh-tw');
assert.strictEqual(p.lang, 'zh-TW', 'lang must be zh-TW');
assert.ok(typeof p.name === 'string' && p.name.length > 0, 'name non-empty');
assert.ok(p.dict && typeof p.dict === 'object' && !Array.isArray(p.dict), 'dict is a plain object');

let n = 0;
for (const [k, v] of Object.entries(p.dict)) {
  assert.ok(typeof k === 'string' && typeof v === 'string', 'dict flat string-to-string, bad key: ' + k);
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
console.log('CHECK1 PASS — name:', p.name, '| dict entries:', n, '| rules:', rn);
