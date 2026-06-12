'use strict';
// P4 (english-base-i18n-migration): engine simulation on the ENGLISH key space.
// Replicates the CURRENT public/i18n.js tr() semantics verbatim (post-flip):
//   trim -> empty early-return -> dict whole-match -> rules first-match
//   (function or string replacement) -> ' · ' segment fallback. NO HAN gate.
// The same English samples are run through three dict/rule sources:
//   A. lang-packs/zh-TW.json  -> assert no English residue + no simplified-variant chars
//   B. built-in FANBOX_DICT/_RULES (en->zh, incl. R1-R5 function rules) -> assert zh output
//   C. lang-packs/TEMPLATE.json -> assert strict identity round-trip
// Residue whitelist: product nouns (FanBox/Claude Code/Codex/Volt/Monaco/...), units
// (KB/MB/GB), and per-sample user-content captures (paths, EACCES..., /brainstorm...).
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'public', 'i18n-dict.js'));
const twPack = require(path.join(ROOT, 'lang-packs', 'zh-TW.json'));
const tplPack = require(path.join(ROOT, 'lang-packs', 'TEMPLATE.json'));

const compile = (rawRules) => (rawRules || []).map(([src, rep]) => {
  try { return [new RegExp(src), rep]; } catch { return null; }
}).filter(Boolean);

// --- verbatim port of public/i18n.js trOne()/tr() (zh/custom branches share it) ---
const makeTr = (dictObj, rulesArr) => {
  const dict = () => dictObj;
  const rules = () => rulesArr;
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
  return (s) => {
    if (!s) return s;
    const core = s.trim();
    if (!core) return s;
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
};
// --- end port ---

const trTW = makeTr(twPack.dict || {}, compile(twPack.rules));
const trZH = makeTr(global.window.FANBOX_DICT || {}, global.window.FANBOX_DICT_RULES || []);
const trID = makeTr(tplPack.dict || {}, compile(tplPack.rules));

// samples: [input, per-sample allowed residue substrings (user-content captures)]
const SAMPLES = [
  // statics
  ['Search all files'],
  ['Open in Terminal'],
  ['Cancel'],
  ["Can't preview this file type"],
  ['Skills overview'],
  ['Import language pack…'],
  // relative time singular/plural + just now
  ['just now'],
  ['1 minute ago'],
  ['5 minutes ago'],
  ['1 hour ago'],
  ['12 hours ago'],
  ['1 day ago'],
  ['3 days ago'],
  // counts singular/plural (R1 statusbar + archive truncated)
  ['1 item'],
  ['500+ items'],
  ['12 items · 3 folders · 9 files 1.2 MB'],
  ['2 items · 1 folder'],
  ['5 items · 1 file 2 KB'],
  ['1 copy'],
  ['3 copies'],
  // R2 mem-session meta (incl. ISO-date branch)
  ['just now · 12 messages · changed 16 files'],
  ['5 minutes ago · 1 message · changed 1 file'],
  ['2026-06-01 · 3 messages'],
  // R3 multiline agent-project tooltip
  ['/Users/x/proj\nclaude · active 3h', ['/Users/x/proj', 'claude']],
  ['/Users/x/proj\nclaude, codex · active just now', ['/Users/x/proj', 'claude', 'codex']],
  ['/Users/x/proj\nclaude · active 5m', ['/Users/x/proj', 'claude']],
  ['/Users/x/proj\nclaude · active 2d', ['/Users/x/proj', 'claude']],
  // R4 usage snapshot
  ['Snapshot: Codex session from 2 hours ago'],
  ['Snapshot: Codex session from just now'],
  // R5 replay header
  ['Session replay · 1 write · over 45 s'],
  ['Session replay · 12 writes · over 1.5 hr'],
  ['Session replay · 3 writes · over 3 min'],
  // fmtDur / agoShort short forms
  ['3 min'],
  ['7m'],
  ['45 s'],
  // ' · ' composite fallback (both halves independent dict entries)
  ['New file (not in HEAD) · read-only'],
  ['Total 1.2 GB · top 50 shown'],
  ['120 chars · past cutoff'],
  // server error strings
  ['Save failed: EACCES permission denied', ['EACCES permission denied']],
  ['id has an invalid format (lowercase letters/digits/- only, 1-40 chars)'],
  ['this pack targets an old FanBox text base — please get a pack updated for the English base (base: "en")'],
  ['Missing SKILL.md — not a valid skill'],
  // contract §2 misc round-trips
  ['v1.8.0 is out'],
  ['Injected /brainstorm — add a sentence and press Enter', ['/brainstorm']],
  ['Move folder "草稿" to Trash? You can restore it from Trash.'],
  ['Created 2026-06-01 12:00'],
];

// global residue whitelist: product nouns + units + tech tokens legitimately kept in
// zh/zh-TW translations (word-boundary stripped before the [A-Za-z]{2,} residue scan)
const WHITELIST = ['Claude Code', 'FanBox', 'Claude', 'Codex', 'Volt', 'Monaco',
  'SKILL.md', 'Skills', 'skill', 'HEAD', 'Enter', 'KB', 'MB', 'GB', 'base', 'en', 'id'];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stripAllowed = (out, allows) => {
  let x = out;
  for (const a of (allows || [])) x = x.split(a).join(' ');
  for (const w of WHITELIST) x = x.replace(new RegExp('\\b' + esc(w) + '\\b', 'g'), ' ');
  return x;
};

let fail = 0;
const check = (ok, label, detail) => {
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + label + (detail && !ok ? ' | ' + detail : ''));
  if (!ok) fail++;
};

// simplified-variant chars that must never appear in zh-TW output
const SIMP = /[检个条钟刚变边见项显师线时写会发讯启动复历开关闭后这为对们读错误请录归还体]/;

for (const [input, allows] of SAMPLES) {
  const j = JSON.stringify(input);
  // A. zh-TW pack
  const tw = trTW(input);
  check(tw !== input, 'zh-TW translated: ' + j, 'out unchanged');
  const twResidue = stripAllowed(tw, allows).match(/[A-Za-z]{2,}/g);
  check(!twResidue, 'zh-TW no EN residue: ' + j,
    'out=' + JSON.stringify(tw) + ' residue=' + JSON.stringify(twResidue));
  check(!SIMP.test(tw), 'zh-TW no simplified-variant chars: ' + j, 'out=' + JSON.stringify(tw));
  // B. built-in en->zh
  const zh = trZH(input);
  check(zh !== input, 'zh translated: ' + j, 'out unchanged');
  const zhResidue = stripAllowed(zh, allows).match(/[A-Za-z]{2,}/g);
  check(!zhResidue, 'zh no EN residue: ' + j,
    'out=' + JSON.stringify(zh) + ' residue=' + JSON.stringify(zhResidue));
  // C. TEMPLATE identity
  const ident = trID(input);
  check(ident === input, 'TEMPLATE identity: ' + j, 'out=' + JSON.stringify(ident));
}

// exact-output spot checks (R1-R5 composite branches), both directions
const expectEq = (fn, name, input, expected) => {
  const out = fn(input);
  check(out === expected, name + ' exact: ' + JSON.stringify(input),
    'out=' + JSON.stringify(out) + ' want=' + JSON.stringify(expected));
};
expectEq(trZH, 'zh R1', '12 items · 3 folders · 9 files 1.2 MB', '12 项 · 3 文件夹 · 9 文件 1.2 MB');
expectEq(trZH, 'zh R2', 'just now · 12 messages · changed 16 files', '刚刚 · 12 条消息 · 改了 16 个文件');
expectEq(trZH, 'zh R2-ISO', '2026-06-01 · 3 messages', '2026-06-01 · 3 条消息');
expectEq(trZH, 'zh R3', '/Users/x/proj\nclaude · active 3h', '/Users/x/proj\nclaude · 3时前活跃');
expectEq(trZH, 'zh R4', 'Snapshot: Codex session from 2 hours ago', '快照：2 小时前的 Codex 会话');
expectEq(trZH, 'zh R5', 'Session replay · 12 writes · over 1.5 hr', '会话回放 · 12 次写入 · 跨 1.5 小时');
expectEq(trTW, 'zh-TW R1', '12 items · 3 folders · 9 files 1.2 MB', '12 項 · 3 個資料夾 · 9 個檔案 1.2 MB');
expectEq(trTW, 'zh-TW R2-ISO', '2026-06-01 · 3 messages', '2026-06-01 · 3 條訊息');
expectEq(trTW, 'zh-TW R3', '/Users/x/proj\nclaude · active 3h', '/Users/x/proj\nclaude · 3時前活躍');
expectEq(trTW, 'zh-TW R4', 'Snapshot: Codex session from just now', '快照：剛剛的 Codex 會話');
expectEq(trTW, 'zh-TW R5', 'Session replay · 12 writes · over 1.5 hr', '會話回放 · 12 次寫入 · 跨 1.5 小時');

// unknown English passes through unchanged in ALL three configs
for (const s of ['The quick brown fox jumps over the lazy dog.',
  'Totally novel sentence not in any dict 42.',
  'A path like /tmp/x/y.txt stays as is']) {
  check(trTW(s) === s && trZH(s) === s && trID(s) === s,
    'passthrough (all configs): ' + JSON.stringify(s),
    'tw=' + JSON.stringify(trTW(s)) + ' zh=' + JSON.stringify(trZH(s)));
}

console.log('samples: ' + SAMPLES.length);
process.exitCode = fail ? 1 : 0;
console.log(fail ? `ENGINE SIM FAIL (${fail} failures)` : 'ENGINE SIM PASS');
