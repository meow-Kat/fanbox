'use strict';
// T2 Check 3b: GET /api/lang-pack?id=zh-tw round-trips deep-equal against the source file
const path = require('path');
const assert = require('assert');
const file = require(path.join(__dirname, '..', 'lang-packs', 'zh-TW.json'));

const port = process.env.FANBOX_PORT || '4599';
fetch('http://localhost:' + port + '/api/lang-pack?id=zh-tw')
  .then((r) => r.json())
  .then((served) => {
    assert.deepStrictEqual(served, file, 'served pack differs from lang-packs/zh-TW.json');
    console.log('CHECK3b PASS — served pack deep-equals lang-packs/zh-TW.json');
  })
  .catch((e) => {
    console.error('CHECK3b FAIL:', e.message);
    process.exitCode = 1;
  });
