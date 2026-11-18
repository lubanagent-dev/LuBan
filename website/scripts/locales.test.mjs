import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, '.vitepress/dist');
const read = (path) => readFileSync(path, 'utf8');
function markdownPages(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? markdownPages(path) : entry.name.endsWith('.md') ? [path] : [];
  });
}
const pages = ['index.md', ...markdownPages('manual'), ...markdownPages('tutorial')];

test('every public Chinese page has a nonempty English counterpart', () => {
  for (const page of pages) {
    const source = read(join(root, page));
    const translated = read(join(root, 'en', page));
    assert.notEqual(translated.trim(), source.trim(), `${page}: untranslated copy`);
    assert.ok(translated.length > 100, `${page}: empty translation`);
    // Preserve every executable example; translating prose must not drop a recipe.
    const fences = (text) => text.match(/^```[^\n]*$/gm) ?? [];
    assert.deepEqual(fences(translated), fences(source), `${page}: missing or changed code fences`);
  }
});

test('built pages declare the correct language and expose the corresponding language link', () => {
  assert.ok(existsSync(dist), 'Run npm run build before npm test');
  const base = process.env.DOCS_BASE || '/';
  for (const page of pages) {
    const htmlPath = page.replace(/\.md$/, '.html');
    const route = page.replace(/index\.md$/, '').replace(/\.md$/, '.html');
    const zh = read(join(dist, htmlPath));
    const en = read(join(dist, 'en', htmlPath));
    assert.match(zh, /<html[^>]+lang="zh-CN"/, `${page}: Chinese lang`);
    assert.match(en, /<html[^>]+lang="en"/, `${page}: English lang`);
    assert.ok(zh.includes(`href="${base}en/${route}"`), `${page}: English switch route`);
    assert.ok(en.includes(`href="${base}${route}"`), `${page}: Chinese switch route`);
    assert.ok(en.includes('Change language'), `${page}: language menu`);
    assert.ok(en.includes('Hosted documentation: AI tools'), `${page}: translated theme notice`);
  }
});

test('English pages keep localized navigation, usage policy and metadata', () => {
  const html = read(join(dist, 'en/manual/index.html'));
  assert.ok(html.includes('Search docs'));
  assert.ok(html.includes('On this page'));
  assert.ok(html.includes('Wide mode'));
  assert.ok(html.includes('LubanAgent documentation'));
  assert.ok(html.includes('id="docs-use-policy"'));
  assert.ok(html.includes('Apache-2.0'));
  assert.ok(html.includes('noindex, nofollow, noarchive, noai, noimageai'));
});

test('English built pages have no broken local links or section anchors', () => {
  const base = process.env.DOCS_BASE || '/';
  for (const page of pages) {
    const htmlPath = `en/${page.replace(/\.md$/, '.html')}`;
    const html = read(join(dist, htmlPath));
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const href = match[1].replaceAll('&amp;', '&');
      if (!href || href === '#' || /^(https?:|data:|mailto:|tel:)/.test(href)) continue;
      const url = new URL(href, `http://local${base}${htmlPath}`);
      assert.ok(url.pathname.startsWith(base), `${page}: outside deployment base ${href}`);
      let target = join(dist, decodeURIComponent(url.pathname.slice(base.length)));
      if (url.pathname.endsWith('/')) target = join(target, 'index.html');
      else if (!extname(target) && !existsSync(target)) target += '.html';
      assert.ok(existsSync(target), `${page}: missing local target ${href}`);
      if (url.hash && target.endsWith('.html')) {
        const id = decodeURIComponent(url.hash.slice(1));
        assert.ok(read(target).includes(`id="${id}"`), `${page}: missing section ${href}`);
      }
    }
  }
});
