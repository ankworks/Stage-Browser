/**
 * Address resolution — the security-relevant half of the address bar.
 *
 * `node --test` runs these against the compiled `dist/test/shared` output so the
 * tests exercise exactly the code the app ships.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInput, internalPage, isInternalPage, safeFilename, hostOf, prettyUrl } from '../dist/test/shared/url.js';

test('a full URL is kept, normalised', () => {
  assert.equal(resolveInput('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(resolveInput('  https://EXAMPLE.com/Path  '), 'https://example.com/Path');
});

test('a bare domain becomes http, not a search', () => {
  assert.equal(resolveInput('example.com'), 'http://example.com');
  assert.equal(resolveInput('sub.example.co.uk/x'), 'http://sub.example.co.uk/x');
  assert.equal(resolveInput('localhost:5173'), 'http://localhost:5173');
});

test('free text falls through to the search engine', () => {
  const out = resolveInput('how to study fractions');
  assert.ok(out.startsWith('https://duckduckgo.com/?q='), out);
  assert.ok(out.includes('how%20to%20study%20fractions'));
});

test('search can be disabled for a strict address field', () => {
  assert.equal(resolveInput('just some words', { search: false }), null);
});

test('dangerous schemes are refused outright', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', 'vbscript:x', 'blob:https://x/y']) {
    assert.equal(resolveInput(bad), null, bad);
  }
});

test('internal pages normalise and are recognised', () => {
  assert.equal(resolveInput('stage://newtab'), 'stage://newtab');
  assert.equal(resolveInput('stage://'), 'stage://newtab');
  assert.equal(resolveInput('stage://nonsense'), 'stage://newtab');
  assert.equal(isInternalPage('stage://favorites'), true);
  assert.equal(internalPage('stage://reader?id=x'), 'reader');
  assert.equal(internalPage('https://stage'), null);
});

test('only Stage internal pages are navigable', () => {
  assert.equal(resolveInput('juzt://newtab'), null);
  assert.equal(resolveInput('juzt://settings'), null);
  assert.equal(resolveInput('stage://boards'), 'stage://newtab');
});

test('empty input resolves to nothing', () => {
  assert.equal(resolveInput(''), null);
  assert.equal(resolveInput('   '), null);
});

test('host labels are human-friendly', () => {
  assert.equal(hostOf('https://www.example.com/a'), 'www.example.com');
  // The query is kept: two links to the same path with different queries are
  // different pages, and the label is the only way to tell them apart.
  assert.equal(prettyUrl('https://www.example.com/a/b?c=1'), 'example.com/a/b?c=1');
  assert.equal(prettyUrl('stage://newtab'), '');
});

test('file names are sanitised for the save dialog', () => {
  const name = safeFilename('My Board: 1/2*', 'png');
  assert.ok(name.startsWith('My-Board-12-'), name);
  assert.ok(name.endsWith('.png'));
  assert.ok(!/[\\/:*?"<>|]/.test(name), name);

  assert.ok(safeFilename('', 'png').startsWith('stage-'));
  assert.ok(!safeFilename('..\\../etc', 'png').includes('/'));
});
