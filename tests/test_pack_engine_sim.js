'use strict';
// T2 Check 4: replicate public/i18n.js custom-pack tr() semantics exactly and
// feed dynamic samples; assert no simplified-only chars remain in output.
// tr() logic copied from public/i18n.js (custom branch): dict whole-string hit
// -> rules first-match via core.replace(re, rep) -> '·' segment fallback.
const path = require('path');
const pack = require(path.join(__dirname, '..', 'lang-packs', 'zh-TW.json'));

const dictObj = pack.dict || {};
const compiled = (pack.rules || []).map(([src, rep]) => {
  try { return [new RegExp(src), rep]; } catch { return null; }
}).filter(Boolean);
const dict = () => dictObj;
const rules = () => compiled;

// --- verbatim port of i18n.js tr()/trOne() ---
const HAN = /[㐀-鿿「」（）：；！？…·]/;
const trOne = (core) => {
  const hit = dict()[core];
  if (hit !== undefined) return hit;
  for (const [re, rep] of rules()) {
    const m = core.match(re);
    if (m) {
      try { return typeof rep === 'function' ? rep(m) : core.replace(re, rep); } catch { /* 规则异常不挡显示 */ }
    }
  }
  return null;
};
const tr = (s) => {
  if (!s || !HAN.test(s)) return s;
  const core = s.trim();
  const whole = trOne(core);
  if (whole !== null) return s.replace(core, whole);
  if (core.includes('·')) {
    const segs = core.split('·').map((x) => x.trim()).filter(Boolean);
    const parts = segs.map((x) => trOne(x) ?? x);
    if (parts.some((x, i) => x !== segs[i])) {
      const joined = parts.join(' · ') + (/·\s*$/.test(core) ? ' · ' : '');
      return s.replace(core, joined);
    }
  }
  return s;
};
// --- end port ---

const SIMP = /[检个条钟刚变边见项显师线时]/;
let fail = 0;
const expectClean = (label, input) => {
  const out = tr(input);
  const bad = out.match(new RegExp(SIMP.source, 'g'));
  const ok = !bad;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + label);
  console.log('  in : ' + JSON.stringify(input));
  console.log('  out: ' + JSON.stringify(out));
  if (!ok) { console.log('  simplified chars left: ' + bad.join(' ')); fail++; }
};

// real producer (app.js statusbar): `${n} 项${dirs?` · ${dirs} 文件夹`:''}${files?` · ${files} 文件 ${size}`:''}`
expectClean('counts (real producer)', '8 项 · 2 文件夹 · 6 文件 1.2 MB');
expectClean('counts (dirs only)', '8 项 · 2 文件夹');
expectClean('minutes ago', '3 分钟前');
expectClean('just now', '刚刚');
expectClean('seg fallback', '刚刚 · 12 条消息 · 改了 16 个文件');
expectClean('size + first N', '共 1.2 GB · 只显示前 50 项');
expectClean('chars + truncation', '120 字符 · 超截断线');
expectClean('multiline 刚变更', '刚变更：\nsrc/app.js\npublic/style.css');

// real producer (app.js agent-projects tooltip): `${path}\n${agents} · ${agoShort(t)}前活跃`
// agoShort returns 刚刚 / N 分 / N 时 / N 天; pack rule replacement reuses $3 verbatim.
expectClean('activity tooltip 刚刚 (real producer)', '/Users/x/proj\nclaude · 刚刚前活跃');
expectClean('activity tooltip N 时 (real producer)', '/Users/x/proj\nclaude · 3 时前活跃');
expectClean('activity tooltip N 分 (real producer)', '/Users/x/proj\nclaude · 5 分前活跃');

// informational: task-spec synthetic string with 「个」 — NOT a real producer; the
// built-in EN ruleset produces the same partial result ("8 items · 2 个文件夹 · 6 个文件").
console.log('INFO | synthetic 个-variant out: ' + JSON.stringify(tr('8 项 · 2 个文件夹 · 6 个文件')) + ' (EN baseline equally partial; real producer has no 个)');

// static dict spot checks
const spot = (key, mustContain) => {
  const v = dictObj[key];
  const ok = typeof v === 'string' && v.includes(mustContain);
  console.log((ok ? 'PASS' : 'FAIL') + ' | dict ' + JSON.stringify(key) + ' -> ' + JSON.stringify(v) + ' (expect contains ' + JSON.stringify(mustContain) + ')');
  if (!ok) fail++;
};
spot('搜索全部文件', '搜尋');
spot('新建文件夹', '資料夾');
spot('这个文件夹是空的', '資料夾');
spot('导入语言包…', '匯入語言包…');

process.exitCode = fail ? 1 : 0;
console.log(fail ? 'CHECK4 FAIL (' + fail + ' failures)' : 'CHECK4 PASS');
