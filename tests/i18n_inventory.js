'use strict';
// P1 清点脚本（english-base-i18n-migration）：扫出源码里的中文 UI 字串并分类。
// - JS 词法级扫描：区分 注释 / 'x' "x" 字符串 / `x` 模板（含 ${} 嵌套）/ 正则字面量（启发式）
// - 直接 fs 读取，绕开 grep 对 app.js 内字面 NUL 的二进制误判（conventions.md）
// - 交叉比对 FANBOX_DICT：命中 = 可机械替换为既有英文；未命中 = 需人工翻译/模板重写
// 输出：docs/i18n-map.json（机器用）+ stdout 摘要
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const HAN = /[㐀-鿿豈-﫿「」（）：；！？…]/;

function lexJS(src) {
  const out = [];
  let i = 0, line = 1, n = src.length;
  let prevSig = ''; // 上一个有效字符，用于正则/除号启发式
  const push = (type, value, startLine) => out.push({ type, value, line: startLine });
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && src[i + 1] === '/') {
      const start = line; let j = src.indexOf('\n', i); if (j < 0) j = n;
      push('comment', src.slice(i + 2, j), start); i = j; continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const start = line; let j = src.indexOf('*/', i + 2); if (j < 0) j = n;
      const body = src.slice(i + 2, j);
      line += (body.match(/\n/g) || []).length;
      push('comment', body, start); i = j + 2; continue;
    }
    if (c === "'" || c === '"') {
      const q = c, start = line; let j = i + 1, buf = '';
      while (j < n && src[j] !== q) {
        if (src[j] === '\\') { buf += src[j] + (src[j + 1] || ''); j += 2; continue; }
        if (src[j] === '\n') line++;
        buf += src[j]; j++;
      }
      push('string', buf, start); prevSig = q; i = j + 1; continue;
    }
    if (c === '`') {
      const start = line; let j = i + 1, buf = '', depth = 0;
      while (j < n) {
        if (src[j] === '\\') { buf += src[j] + (src[j + 1] || ''); j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') { depth++; buf += '${'; j += 2; continue; }
        if (depth > 0) { // ${} 内部不细分（嵌套字符串里的中文会在整体 value 里看到）
          if (src[j] === '{') depth++;
          if (src[j] === '}') depth--;
          if (src[j] === '\n') line++;
          buf += src[j]; j++; continue;
        }
        if (src[j] === '`') break;
        if (src[j] === '\n') line++;
        buf += src[j]; j++;
      }
      push('template', buf, start); prevSig = '`'; i = j + 1; continue;
    }
    if (c === '/') { // 正则 or 除号：启发式看前一个有效字符
      const reStarters = '=([{,;:!&|?+-*%~^<>';
      if (prevSig === '' || reStarters.includes(prevSig) || /\breturn$/.test(srcBefore(src, i))) {
        const start = line; let j = i + 1, buf = '', inClass = false;
        while (j < n) {
          if (src[j] === '\\') { buf += src[j] + (src[j + 1] || ''); j += 2; continue; }
          if (src[j] === '[') inClass = true;
          if (src[j] === ']') inClass = false;
          if (src[j] === '/' && !inClass) break;
          if (src[j] === '\n') { buf = null; break; } // 跨行 → 误判为正则，当除号处理
          buf += src[j]; j++;
        }
        if (buf !== null) { push('regex', buf, start); i = j + 1; prevSig = '/'; continue; }
      }
      prevSig = '/'; i++; continue;
    }
    if (!/\s/.test(c)) prevSig = c;
    i++;
  }
  return out;
}
function srcBefore(src, i) { return src.slice(Math.max(0, i - 8), i).trimEnd(); }

function scanHTML(src) {
  const out = [];
  const lineOf = (idx) => src.slice(0, idx).split('\n').length;
  // 标签间文字
  const text = /<[^>]*>([^<>]+)</g; let m;
  while ((m = text.exec(src))) {
    const t = m[1].trim();
    if (t) out.push({ type: 'text', value: t, line: lineOf(m.index) });
  }
  // title / placeholder / alt 属性
  const attr = /\b(title|placeholder|alt)="([^"]+)"/g;
  while ((m = attr.exec(src))) out.push({ type: `attr:${m[1]}`, value: m[2], line: lineOf(m.index) });
  // HTML 注释
  const com = /<!--([\s\S]*?)-->/g;
  while ((m = com.exec(src))) out.push({ type: 'comment', value: m[1], line: lineOf(m.index) });
  return out;
}

// 载入 FANBOX_DICT（zh→en）
global.window = {};
require(path.join(ROOT, 'public/i18n-dict.js'));
const DICT = global.window.FANBOX_DICT || {};

const FILES = ['public/app.js', 'public/i18n.js', 'server.js', 'electron/main.js', 'public/index.html'];
const report = { generated: new Date().toISOString(), files: {} };
const totals = { comment: 0, dictHit: 0, template: 0, noDict: 0, regex: 0 };

for (const rel of FILES) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const toks = rel.endsWith('.html') ? scanHTML(src) : lexJS(src);
  const han = toks.filter((t) => HAN.test(t.value));
  const buckets = { comments: [], dictHits: [], templates: [], noDict: [], regexes: [] };
  for (const t of han) {
    if (t.type === 'comment') { buckets.comments.push(t); totals.comment++; continue; }
    if (t.type === 'regex') { buckets.regexes.push(t); totals.regex++; continue; }
    if (t.type === 'template' || t.value.includes('${')) { buckets.templates.push(t); totals.template++; continue; }
    if (DICT[t.value.trim()] !== undefined) { buckets.dictHits.push({ ...t, en: DICT[t.value.trim()] }); totals.dictHit++; }
    else { buckets.noDict.push(t); totals.noDict++; }
  }
  report.files[rel] = {
    counts: { comments: buckets.comments.length, dictHits: buckets.dictHits.length, templates: buckets.templates.length, noDict: buckets.noDict.length, regexes: buckets.regexes.length },
    dictHits: buckets.dictHits, templates: buckets.templates, noDict: buckets.noDict, regexes: buckets.regexes,
  };
}

fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs/i18n-map.json'), JSON.stringify(report, null, 2));
console.log('== i18n inventory ==');
for (const [f, r] of Object.entries(report.files)) console.log(f, JSON.stringify(r.counts));
console.log('totals', JSON.stringify(totals));
console.log('dict keys:', Object.keys(DICT).length);
console.log('written: docs/i18n-map.json');
