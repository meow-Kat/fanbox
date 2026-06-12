'use strict';
// P2 stage gate (english-base-i18n-migration): dict integrity + engine simulation
// + contract §2 round-trips + electron M(en,zh) cross-surface consistency.
// Engine port is verbatim from public/i18n.js zh branch (post-flip: no HAN gate,
// trim-empty early return, dict whole-hit -> rules first-match -> '·' fallback).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (ok, label, detail) => {
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + label + (detail ? ' | ' + detail : ''));
  if (!ok) fail++;
};

// ---------- Check 3: dict integrity ----------
global.window = {};
require(path.join(ROOT, 'public/i18n-dict.js'));
const DICT = global.window.FANBOX_DICT;
const RULES = global.window.FANBOX_DICT_RULES;
const HAN = /[一-鿿豈-﫿]/; // Han only (no punctuation false positives)

// 369 = 368 (P2c) + 1 base-error entry added in P3 (schema base:"en" check)
check(Object.keys(DICT).length === 369, 'dict has 369 entries', 'actual=' + Object.keys(DICT).length);

const hanKeys = Object.keys(DICT).filter((k) => HAN.test(k));
const emptyKeys = Object.keys(DICT).filter((k) => !k.trim());
// known-by-design: 素材/ is a real on-disk path component kept verbatim (contract §2 row 35)
const hanKeyViolations = hanKeys.filter((k) => k.replace(/素材/g, '').match(HAN));
check(emptyKeys.length === 0, 'no empty dict keys', JSON.stringify(emptyKeys));
check(hanKeyViolations.length === 0, 'no Han in EN keys (素材/ path literal excepted)',
  'hanKeys=' + JSON.stringify(hanKeys));

const nonHanValues = Object.entries(DICT).filter(([, v]) => typeof v !== 'string' || !HAN.test(v));
check(nonHanValues.length === 0, 'all dict values contain Han', JSON.stringify(nonHanValues.slice(0, 10)));

check(Array.isArray(RULES) && RULES.length === 71, '71 rules', 'actual=' + (RULES && RULES.length));
const badRules = (RULES || []).filter(([re, rep]) => !(re instanceof RegExp) || !(typeof rep === 'function' || typeof rep === 'string'));
check(badRules.length === 0, 'all rules are [RegExp, fn|string]', String(badRules.length));

// duplicate keys: object literal dedups silently -> parse SOURCE text
const dictSrc = fs.readFileSync(path.join(ROOT, 'public/i18n-dict.js'), 'utf8');
const dictBody = dictSrc.slice(dictSrc.indexOf('window.FANBOX_DICT = {'), dictSrc.indexOf('window.FANBOX_DICT_RULES'));
const keyRe = /^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*:/gm;
const seen = new Map();
let m;
while ((m = keyRe.exec(dictBody))) {
  const k = (m[1] !== undefined ? m[1] : m[2]).replace(/\\(['"\\])/g, '$1');
  seen.set(k, (seen.get(k) || 0) + 1);
}
const dupes = [...seen.entries()].filter(([, n]) => n > 1);
check(seen.size === Object.keys(DICT).length, 'source key count == loaded key count',
  `source=${seen.size} loaded=${Object.keys(DICT).length}`);
check(dupes.length === 0, 'no duplicate quoted keys in dict source', JSON.stringify(dupes));

// ---------- Check 4: engine simulation (verbatim port of i18n.js zh-mode tr) ----------
const dict = () => DICT;
const rules = () => RULES;
const trOne = (core) => {
  const hit = dict()[core];
  if (hit !== undefined) return hit;
  for (const [re, rep] of rules()) {
    const mm = core.match(re);
    if (mm) {
      try { return typeof rep === 'function' ? rep(mm) : core.replace(re, rep); } catch { /* 规则异常不挡显示 */ }
    }
  }
  return null;
};
const tr = (s) => {
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
// --- end port ---

const expectZh = (input, expected, label) => {
  const out = tr(input);
  check(out === expected, 'zh: ' + (label || JSON.stringify(input)),
    out === expected ? undefined : `in=${JSON.stringify(input)} out=${JSON.stringify(out)} want=${JSON.stringify(expected)}`);
};

// static dict strings
expectZh('Search all files', '搜索全部文件');
expectZh('Open in Terminal', '在终端打开');
expectZh('Skills overview', 'Skills 透视');
expectZh('Cancel', '取消');
expectZh("Can't preview this file type", '这个文件类型无法预览');
// relative time singular/plural + just now
expectZh('just now', '刚刚');
expectZh('1 minute ago', '1 分钟前');
expectZh('5 minutes ago', '5 分钟前');
expectZh('1 hour ago', '1 小时前');
expectZh('12 hours ago', '12 小时前');
expectZh('1 day ago', '1 天前');
expectZh('3 days ago', '3 天前');
// counts singular/plural (statusbar R1 + archive)
expectZh('1 item', '1 项', 'R1 single item');
expectZh('12 items · 3 folders · 9 files 1.2 MB', '12 项 · 3 文件夹 · 9 文件 1.2 MB', 'R1 full composite');
expectZh('2 items · 1 folder', '2 项 · 1 文件夹', 'R1 dirs only singular folder');
expectZh('5 items · 1 file 2 KB', '5 项 · 1 文件 2 KB', 'R1 files singular');
expectZh('500+ items', '500+ 项', 'archive truncated count');
// R2 mem-session meta
expectZh('just now · 12 messages · changed 16 files', '刚刚 · 12 条消息 · 改了 16 个文件', 'R2 just now plural');
expectZh('5 minutes ago · 1 message · changed 1 file', '5 分钟前 · 1 条消息 · 改了 1 个文件', 'R2 singular');
expectZh('2026-06-01 · 3 messages', '2026-06-01 · 3 条消息', 'R2 ISO date no files');
// R3 agent tooltip multiline
expectZh('/Users/x/proj\nclaude · active 3h', '/Users/x/proj\nclaude · 3时前活跃', 'R3 Nh');
expectZh('/Users/x/proj\nclaude, codex · active just now', '/Users/x/proj\nclaude, codex · 刚刚前活跃', 'R3 just now');
// R4 usage snapshot
expectZh('Snapshot: Codex session from 2 hours ago', '快照：2 小时前的 Codex 会话', 'R4');
expectZh('Snapshot: Codex session from just now', '快照：刚刚的 Codex 会话', 'R4 just now');
// R5 replay header
expectZh('Session replay · 1 write · over 45 s', '会话回放 · 1 次写入 · 跨 45 秒', 'R5 singular s');
expectZh('Session replay · 12 writes · over 1.5 hr', '会话回放 · 12 次写入 · 跨 1.5 小时', 'R5 plural hr');
// fmtDur / agoShort short forms
expectZh('3 min', '3 分钟');
expectZh('7m', '7 分');
// ` · ` composite fallback (no whole-string dict hit; both halves independent entries)
expectZh('New file (not in HEAD) · read-only', '新文件（HEAD 中不存在） · 只读', 'middot segment fallback');
// server error strings
expectZh('id has an invalid format (lowercase letters/digits/- only, 1-40 chars)',
  DICT['id has an invalid format (lowercase letters/digits/- only, 1-40 chars)'] || '<<MISSING DICT ENTRY>>',
  'server error: pack id format');
check(HAN.test(String(DICT['id has an invalid format (lowercase letters/digits/- only, 1-40 chars)'])),
  'server pack-id error has zh dict entry', JSON.stringify(DICT['id has an invalid format (lowercase letters/digits/- only, 1-40 chars)']));
expectZh('Missing SKILL.md — not a valid skill', DICT['Missing SKILL.md — not a valid skill'] || '<<MISSING>>', 'server skills issue');
check(HAN.test(String(DICT['Missing SKILL.md — not a valid skill'])), 'Missing SKILL.md has zh dict entry',
  JSON.stringify(DICT['Missing SKILL.md — not a valid skill']));
// error-prefix rule with user-content capture (capture stays verbatim)
expectZh('Save failed: EACCES permission denied', '保存失败：EACCES permission denied', 'error prefix keeps capture');

// residue scan: zh outputs above should not contain English words except
// product nouns / units / user-content captures — do a broad scan over rule outputs
const residueSamples = ['1 minute ago', '12 items · 3 folders · 9 files 1.2 MB',
  'just now · 12 messages · changed 16 files', 'Session replay · 12 writes · over 1.5 hr',
  'Snapshot: Codex session from 2 hours ago', '500+ items'];
const ALLOWED = /\b(KB|MB|GB|B|Codex|Claude|FanBox|HEAD|CHANGELOG|EACCES)\b/g;
for (const s of residueSamples) {
  const out = tr(s).replace(ALLOWED, '');
  check(!/[A-Za-z]{2,}/.test(out), 'no EN residue: ' + JSON.stringify(s), 'out=' + JSON.stringify(tr(s)));
}

// unknown English passes through unchanged (5 random sentences)
for (const s of ['The quick brown fox jumps over the lazy dog.',
  'Totally novel sentence not in any dict 42.',
  'Drag and drop my custom report here',
  'lorem ipsum dolor sit amet',
  'A path like /tmp/x/y.txt stays as is']) {
  check(tr(s) === s, 'passthrough: ' + JSON.stringify(s), 'out=' + JSON.stringify(tr(s)));
}

// en mode: i18n.js source must set identity + return before observer
const i18nSrc = fs.readFileSync(path.join(ROOT, 'public/i18n.js'), 'utf8');
check(/if \(lang === 'en'\) \{ window\.t = \(s\) => s; return; \}/.test(i18nSrc),
  "en mode: window.t identity + early return before MutationObserver (i18n.js)");
const enLineIdx = i18nSrc.indexOf("if (lang === 'en')");
const obIdx = i18nSrc.indexOf('new MutationObserver');
check(enLineIdx >= 0 && obIdx > enLineIdx, 'en-mode return precedes MutationObserver construction');

// ---------- Check 6 round-trips (contract §2 rows, concrete samples) ----------
expectZh('Created 2026-06-01 12:00', '创建 2026-06-01 12:00', 'row25 Created');
expectZh('Modified 2026-06-01 12:00', '改 2026-06-01 12:00', 'row25 Modified');
expectZh('Move folder "草稿" to Trash? You can restore it from Trash.',
  '把文件夹「草稿」移到废纸篓？可从废纸篓恢复。', 'row32');
expectZh('Project memory · ~/Desktop', '项目记忆 · ~/Desktop', 'row36');
expectZh('v1.7.2 release pipeline running in terminal', 'v1.7.2 发版序列已在终端开跑', 'row43');
expectZh('Total 1.2 GB · top 50 shown', '共 1.2 GB · 只显示前 50 项', 'row47');
expectZh('Total 1.2 GB', '共 1.2 GB', 'row47 no-top');
expectZh('1 copy', '1 处副本', 'row57 singular');
expectZh('3 copies', '3 处副本', 'row57 plural');
expectZh('Injected /brainstorm — add a sentence and press Enter', '已注入 /brainstorm，接着补一句话回车', 'row64');
expectZh('v1.8.0 is out', '新版本 v1.8.0 已发布', 'row67');

// ---------- Check 9: electron M(en, zh) consistency ----------
const elSrc = fs.readFileSync(path.join(ROOT, 'electron/main.js'), 'utf8');
// match M('...', '...') / M(`...`, `...`) call sites (template args may contain ${})
const mRe = /\bM\(\s*('(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\s*,\s*('(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\s*\)/g;
let mCount = 0; const mViolations = [];
while ((m = mRe.exec(elSrc))) {
  mCount++;
  const en = m[1].slice(1, -1), zh = m[2].slice(1, -1);
  if (HAN.test(en)) mViolations.push('EN arg has Han: ' + m[0]);
  if (!HAN.test(zh)) mViolations.push('zh arg has no Han: ' + m[0]);
}
check(mCount > 0, 'M() call sites found in electron/main.js', 'count=' + mCount);
check(mViolations.length === 0, 'all M(en, zh): first arg English, second Han',
  JSON.stringify(mViolations, null, 1));
console.log('INFO | M() call sites: ' + mCount);

process.exitCode = fail ? 1 : 0;
console.log(fail ? `STAGE GATE FAIL (${fail} failures)` : 'STAGE GATE PASS');
