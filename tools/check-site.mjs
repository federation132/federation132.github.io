#!/usr/bin/env node
/* Checks for the multilingual contract of this static site.

   Run locally with `node tools/check-site.mjs`; CI runs it too, before anything
   is deployed (.github/workflows/pages.yml). Every rule here exists because a
   hand-maintained translation is easy to half-finish: a page that forgets its
   hreflang, its switcher entry or a hint variant still *looks* fine in the
   language you happen to be reading. */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SITE = 'https://federation132.github.io';

const pages = [
  { file: 'index.html', lang: 'zh-CN', path: '/' },
  { file: 'zh-HK/index.html', lang: 'zh-HK', path: '/zh-HK/' },
  { file: 'en/index.html', lang: 'en', path: '/en/' },
];
const codes = pages.map((p) => p.lang);

const problems = [];
const fail = (message) => problems.push(message);

for (const page of pages) {
  if (!existsSync(page.file)) {
    fail(`${page.file}: file is missing`);
    continue;
  }
  const html = readFileSync(page.file, 'utf8');
  const dir = dirname(page.file);

  // Language and direction, declared on the element Intl reads from.
  if (!html.includes(`<html lang="${page.lang}" dir=`)) {
    fail(`${page.file}: <html> must declare lang="${page.lang}" and a dir`);
  }

  // Canonical is this page; every language is advertised, including x-default.
  if (!html.includes(`rel="canonical" href="${SITE}${page.path}"`)) {
    fail(`${page.file}: canonical should be ${SITE}${page.path}`);
  }
  for (const code of [...codes, 'x-default']) {
    if (!html.includes(`hreflang="${code}"`)) fail(`${page.file}: missing hreflang="${code}"`);
  }

  // Switcher: this page marked as current, and only one such marker.
  if (!html.includes(`class="lang-switch__opt is-active" href="${page.path}" hreflang="${page.lang}"`)) {
    fail(`${page.file}: the active switcher entry should be ${page.lang}`);
  }
  const active = (html.match(/aria-current="true"/g) || []).length;
  if (active !== 1) fail(`${page.file}: expected exactly one aria-current="true", found ${active}`);

  // Every switcher entry and every hint action must point at the real page.
  // (A typo like /zh-hk/ looks harmless on the page you're reading and 404s
  //  only for the reader who follows it.)
  for (const target of pages) {
    const option = new RegExp(`<a[^>]*class="lang-switch__opt[^"]*"[^>]*hreflang="${target.lang}"[^>]*>`).exec(html);
    if (!option) fail(`${page.file}: switcher has no entry for ${target.lang}`);
    else if (!option[0].includes(`href="${target.path}"`)) {
      fail(`${page.file}: switcher entry for ${target.lang} should link to ${target.path}`);
    }

    if (target.lang === page.lang) continue;
    const action = new RegExp(`<a[^>]*data-lang-variant="${target.lang}"[^>]*>`).exec(html);
    if (!action) fail(`${page.file}: hint has no link for ${target.lang}`);
    else if (!action[0].includes(`href="${target.path}"`)) {
      fail(`${page.file}: hint link for ${target.lang} should lead to ${target.path}`);
    }
  }

  // Language hint: one variant per *other* language, never for its own.
  for (const code of codes.filter((c) => c !== page.lang)) {
    if (!html.includes(`data-lang-variant="${code}"`)) {
      fail(`${page.file}: language hint has no variant for ${code}`);
    }
  }
  if (html.includes(`data-lang-variant="${page.lang}"`)) {
    fail(`${page.file}: language hint offers the page's own language`);
  }

  // Local references (stylesheets, scripts, images) must exist.
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const ref = match[1];
    if (/^(?:[a-z]+:|\/\/|#|\/)/i.test(ref)) continue;   // absolute, in-page, or site-root
    const target = resolve(dir, ref.split(/[?#]/)[0]);
    if (!existsSync(target)) fail(`${page.file}: ${ref} does not exist`);
  }

  // Images: alt text present, non-empty, and actually translated on this page.
  page.alts = new Map();
  for (const tag of html.match(/<img\b[^>]*>/g) || []) {
    const src = /src="([^"]+)"/.exec(tag)?.[1] ?? '(no src)';
    const alt = /alt="([^"]*)"/.exec(tag)?.[1];
    if (alt === undefined) fail(`${page.file}: <img src="${src}"> has no alt attribute`);
    else if (!alt.trim()) fail(`${page.file}: <img src="${src}"> has an empty alt`);
    else page.alts.set(src.split('/').pop(), alt);
  }
}

// The same photograph should be described in each page's own language.
const withAlts = pages.filter((p) => p.alts && p.alts.size);
for (const page of withAlts.slice(1)) {
  for (const [name, alt] of page.alts) {
    if (withAlts[0].alts.get(name) === alt) {
      fail(`${page.file}: alt text for ${name} is identical to ${withAlts[0].file} — it should be translated`);
    }
  }
}

// Sitemap: every page listed, well-formed enough for the crawlers that matter.
if (!existsSync('sitemap.xml')) {
  fail('sitemap.xml: file is missing');
} else {
  const sitemap = readFileSync('sitemap.xml', 'utf8');
  if (!sitemap.startsWith('<?xml') || !sitemap.includes('</urlset>')) fail('sitemap.xml: not a complete XML document');
  const locs = (sitemap.match(/<loc>/g) || []).length;
  if (locs !== pages.length) fail(`sitemap.xml: expected ${pages.length} <loc> entries, found ${locs}`);
  for (const page of pages) {
    if (!sitemap.includes(`<loc>${SITE}${page.path}</loc>`)) fail(`sitemap.xml: missing ${SITE}${page.path}`);
  }
  for (const code of codes) {
    const alternates = (sitemap.match(new RegExp(`hreflang="${code}"`, 'g')) || []).length;
    if (alternates !== pages.length) fail(`sitemap.xml: hreflang="${code}" appears ${alternates} times, expected ${pages.length}`);
  }
}

if (!existsSync('robots.txt') || !readFileSync('robots.txt', 'utf8').includes('Sitemap: ' + SITE + '/sitemap.xml')) {
  fail('robots.txt: should point at the sitemap');
}

if (problems.length) {
  console.error(`\u2717 ${problems.length} problem(s):`);
  for (const problem of problems) console.error('  \u00b7 ' + problem);
  process.exit(1);
}
console.log(`\u2713 ${pages.length} pages checked (${codes.join(', ')}), sitemap and robots.txt agree`);
