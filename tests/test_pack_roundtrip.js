'use strict';
// P4 (english-base-i18n-migration): import/serve round-trip + old-base rejection.
// Self-contained: spawns `FANBOX_PORT=4599 node server.js`, then
//   1. POST /api/lang-pack/import with lang-packs/zh-TW.json (base:"en")
//      -> {ok:true,id:"zh-tw"}; this intentionally refreshes the installed copy at
//      ~/.fanbox/lang-packs/zh-tw.json (official pack location).
//   2. GET /api/lang-pack?id=zh-tw -> deepStrictEqual vs the repo file.
//   3. POST the OLD-base pack (git show HEAD:lang-packs/zh-TW.json — pre-migration,
//      no `base` field; if HEAD already carries base:"en" post-commit, synthesize an
//      old pack by deleting `base`) -> {ok:false, error: old-base message}. Rejected
//      before write, so no junk lands in ~/.fanbox/lang-packs/.
// Kills the server on exit either way.
const path = require('path');
const assert = require('assert');
const { spawn, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const PORT = process.env.FANBOX_PORT || '4599';
const BASE = 'http://localhost:' + PORT;
const file = require(path.join(ROOT, 'lang-packs', 'zh-TW.json'));

let fail = 0;
const check = (ok, label, detail) => {
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + label + (detail && !ok ? ' | ' + detail : ''));
  if (!ok) fail++;
};

const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
  env: { ...process.env, FANBOX_PORT: PORT },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvErr = '';
server.stderr.on('data', (d) => { srvErr += d; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitUp = async () => {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(BASE + '/api/lang-packs');
      if (r.ok) return true;
    } catch { /* not up yet */ }
    if (server.exitCode !== null) return false;
    await sleep(100);
  }
  return false;
};

const oldBasePack = () => {
  try {
    const raw = execFileSync('git', ['show', 'HEAD:lang-packs/zh-TW.json'], { cwd: ROOT, encoding: 'utf8' });
    const p = JSON.parse(raw);
    if (p.base !== 'en') return p; // 真·旧包（迁移前，无 base 字段）
  } catch { /* not a git repo / file absent at HEAD */ }
  // post-commit fallback：用当前包合成一个「缺 base」的旧格式包
  const clone = JSON.parse(JSON.stringify(file));
  delete clone.base;
  return clone;
};

const post = (pack) => fetch(BASE + '/api/lang-pack/import', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pack),
}).then((r) => r.json());

(async () => {
  try {
    check(await waitUp(), 'server up on :' + PORT, 'stderr=' + srvErr.slice(0, 500));
    if (fail) return;

    // 1. import current pack (base:"en") — refreshes ~/.fanbox/lang-packs/zh-tw.json
    const imp = await post(file);
    check(imp && imp.ok === true && imp.id === 'zh-tw',
      'import current zh-TW pack -> {ok:true,id:"zh-tw"}', JSON.stringify(imp));

    // 2. GET back, deep-equal vs repo file
    const served = await fetch(BASE + '/api/lang-pack?id=zh-tw').then((r) => r.json());
    try {
      assert.deepStrictEqual(served, file);
      check(true, 'served pack deep-equals lang-packs/zh-TW.json');
    } catch (e) {
      check(false, 'served pack deep-equals lang-packs/zh-TW.json', e.message.slice(0, 300));
    }

    // 3. old-base pack must be rejected with the base error
    const old = oldBasePack();
    check(old.base === undefined, 'old pack has no base field (pre-migration shape)', 'base=' + old.base);
    const rej = await post(old);
    check(rej && rej.ok === false, 'old-base import rejected (ok:false)', JSON.stringify(rej).slice(0, 300));
    check(rej && /old FanBox text base/.test(String(rej.error)),
      'rejection error is the base-mismatch message', 'error=' + JSON.stringify(rej && rej.error));

    // installed copy must still be the NEW pack (rejection happened before write)
    const after = await fetch(BASE + '/api/lang-pack?id=zh-tw').then((r) => r.json());
    check(after && after.base === 'en', 'installed pack still base:"en" after rejected import',
      'base=' + (after && after.base));
  } catch (e) {
    check(false, 'unexpected error', String(e && e.stack || e));
  } finally {
    server.kill();
    process.exitCode = fail ? 1 : 0;
    console.log(fail ? `ROUNDTRIP FAIL (${fail} failures)` : 'ROUNDTRIP PASS');
  }
})();
