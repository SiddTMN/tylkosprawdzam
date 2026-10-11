'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validDay, makeWindow, inWindow, dayInWarsaw, parseEip, parseStellar, inspectReleases, deduplicate, parseArgs } = require('../scripts/test-crypto-calendar.cjs');
const verifiedAt = '2026-10-11T12:00:00Z';
const file = text => ({ type: 'file', encoding: 'base64', content: Buffer.from(text).toString('base64'), sha: 'a'.repeat(40) });
const eip = rows => file('---\neip: 7773\ntitle: Hardfork Meta - Glamsterdam\n---\n### Activation\n| Network Name | Activation Epoch | Activation Timestamp |\n| --- | --- | --- |\n' + rows + '\n## Copyright\nCC0\n');
const rows = '| Sepolia | 353024 | 1791294816 (2026-10-06 13:53:36 UTC) |\n| Hoodi | | |\n| Mainnet | | TBD |';
test('30 calendar days in Warsaw, exclusive upper bound', () => {
  const w=makeWindow(Date.parse(verifiedAt));
  assert.equal(w.from,'2026-10-11'); assert.equal(w.toExclusive,'2026-11-10');
  assert.equal(inWindow({date:'2026-11-09'},w),true);
  assert.equal(inWindow({date:'2026-11-10'},w),false);
  assert.equal(inWindow({date:'2026-10-10'},w),false);
});
test('day boundary and daylight saving time use Warsaw, not fixed UTC offset', () => {
  assert.equal(dayInWarsaw(Date.parse('2026-10-24T22:30:00Z')),'2026-10-25');
  assert.equal(dayInWarsaw(Date.parse('2026-10-25T22:30:00Z')),'2026-10-25');
  assert.equal(dayInWarsaw(Date.parse('2026-11-09T23:00:00Z')),'2026-11-10');
});
test('timed event earlier today is not future',()=>{
  assert.equal(inWindow({date:'2026-10-11',startsAt:'2026-10-11T11:59:59Z'},makeWindow(Date.parse(verifiedAt))),false);
});
test('impossible dates rejected',()=>{
  assert.equal(validDay('2026-02-30'),false);assert.equal(validDay('2026-02-29'),false);assert.equal(validDay('2028-02-29'),true);
  assert.throws(()=>makeWindow(Date.parse(verifiedAt),'2026-02-30'));
});
test('EIP uses explicit activation, publication/frontmatter dates ignored, TBD skipped',()=>{
  const p=parseEip(eip(rows),verifiedAt);
  assert.equal(p.events.length,1);assert.equal(p.events[0].startsAt,'2026-10-06T13:53:36Z');
  assert.equal(p.rejected.length,2);assert.equal(inWindow(p.events[0],makeWindow(Date.parse(verifiedAt))),false);
});
test('EIP inconsistent epoch timestamp/date rejected',()=>{
  assert.throws(()=>parseEip(eip(rows.replace('1791294816','1791294817')),verifiedAt),/disagreement/);
});
test('missing or duplicate EIP activation network fails source validation',()=>{
  assert.throws(()=>parseEip(eip(rows.replace('| Hoodi | | |','')),verifiedAt),/Missing\/duplicate/);
  assert.throws(()=>parseEip(eip(rows+'\n| Hoodi | | |'),verifiedAt),/Missing\/duplicate/);
});
test('Stellar network date retained without inventing an hour; previews excluded',()=>{
  const p=parseStellar(file('## Protocol 29 (Mainnet, October 1, 2026)\n## Protocol 30 Release Candidate (Testnet only, October 20, 2026)\ncreated: 2026-10-25'),verifiedAt);
  assert.equal(p.events.length,1);assert.equal(p.events[0].date,'2026-10-01');
  assert.equal(p.events[0].time,null);assert.equal(p.events[0].startsAt,null);assert.equal(p.rejected.length,1);
});
test('malformed schedule shape is not treated as verified empty data',()=>{
  assert.throws(()=>parseStellar(file('Article posted October 21, 2026'),verifiedAt),/headings missing/);
  assert.throws(()=>parseEip({content:'bad'},verifiedAt),/schema/);
});
test('release published_at never becomes a calendar event',()=>{
  const p=inspectReleases([{tag_name:'v1',html_url:'https://github.com/stellar/stellar-core/releases/tag/v1',published_at:'2026-10-20T00:00:00Z',body:'Future software release'}]);
  assert.deepEqual(p.events,[]);assert.equal(p.rejected.length,1);
});
test('identical events deduplicated; inconsistent dates fail rather than guess',()=>{
  const e=parseEip(eip(rows),verifiedAt).events[0];
  assert.equal(deduplicate([e,{...e}]).length,1);
  assert.throws(()=>deduplicate([e,{...e,date:'2026-10-07'}]),/Conflicting/);
});
test('CLI cannot overwrite production data or workflows',()=>{
  assert.throws(()=>parseArgs(['--output','data/macro-calendar.json']),/must stay inside/);
  assert.throws(()=>parseArgs(['--cache-dir','.github']),/must stay inside/);
  assert.throws(()=>parseArgs(['--output']),/Missing value/);
});
