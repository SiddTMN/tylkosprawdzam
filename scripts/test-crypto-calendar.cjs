'use strict';
// Stage 1 audit; shared audited helpers also support the separate local calendar.
const fs = require('node:fs/promises');
const path = require('node:path');
const {validDay,addDays,dayInWarsaw,makeWindow,inWindow,approvedEventUrl,parseIcs,deduplicate,readCache,atomicJson,getSource}=require('./crypto-calendar/shared.cjs');
const BASE = path.resolve(__dirname, '../docs/crypto-calendar-stage1');
const SOURCES = [
  { id: 'eth-glamsterdam', token: 'ETH', kind: 'eip', url: 'https://api.github.com/repos/ethereum/EIPs/contents/EIPS/eip-7773.md', license: 'CC0-1.0', licenseUrl: 'https://github.com/ethereum/EIPs/blob/master/LICENSE.md' },
  { id: 'xlm-protocols', token: 'XLM', kind: 'stellar', url: 'https://api.github.com/repos/stellar/stellar-docs/contents/docs/networks/software-versions.mdx', license: 'Apache-2.0', licenseUrl: 'https://github.com/stellar/stellar-docs/blob/main/LICENSE' },
  ...[
    ['eth-geth', 'ETH', 'ethereum/go-ethereum'],
    ['dot-sdk', 'DOT', 'paritytech/polkadot-sdk'],
    ['dot-runtime', 'DOT', 'polkadot-fellows/runtimes'],
    ['xlm-core', 'XLM', 'stellar/stellar-core']
  ].map(([id, token, repo]) => ({ id, token, kind: 'releases', url: 'https://api.github.com/repos/' + repo + '/releases?per_page=10' }))
];
const DISABLED = [
  { url: 'https://ethereum.org/community/events/', reason: 'Terms prohibit automated access; not collected.', terms: 'https://ethereum.org/terms-of-use/' },
  { url: 'https://blog.ethereum.org/feed.xml', reason: 'EF website terms prohibit automated access; RSS presence is not an exception.', terms: 'https://ethereum.org/terms-of-use/' },
  { url: 'https://stellar.org/events', reason: 'Public reuse not cleared under website terms; not collected.', terms: 'https://stellar.org/terms-of-service' },
  { url: 'https://stellar.org/blog', reason: 'Public reuse not cleared under website terms; not collected.', terms: 'https://stellar.org/terms-of-service' },
  { url: 'https://forum.polkadot.network/latest.rss', reason: 'Forum terms prohibit automated monitoring; not collected.', terms: 'https://forum.polkadot.network/tos' }
];
function contentFile(data) {
  if (!data || data.type !== 'file' || data.encoding !== 'base64' || typeof data.content !== 'string' || !/^[a-f0-9]{40}$/.test(data.sha)) throw new Error('Unexpected GitHub contents schema');
  return { text: Buffer.from(data.content, 'base64').toString('utf8'), sha: data.sha };
}
function eventRow(token, network, identity, date, startsAt, title, sourceUrl, verifiedAt, license, licenseUrl) {
  return { id: token + ':' + network.toLowerCase() + ':' + identity, token, date, time: startsAt ? startsAt.slice(11, 19) : null,
    timezone: startsAt ? 'UTC' : null, startsAt: startsAt || null, title, type: 'protocol-upgrade',
    priority: network === 'Mainnet' ? 'high' : 'medium', network, sourceUrl, verifiedAt, license, licenseUrl };
}
function parseEip(data, verifiedAt) {
  const { text, sha } = contentFile(data);
  if (!/^eip: 7773$/m.test(text) || !/^title: Hardfork Meta - Glamsterdam$/m.test(text) || !/CC0/.test(text)) throw new Error('EIP identity or license changed');
  const section = text.match(/^### Activation\s*\n([\s\S]*?)(?=^#{1,3} |$(?![\s\S]))/m)?.[1];
  if (!section || !/Activation Timestamp/.test(section)) throw new Error('EIP activation table missing or changed');
  const events = [], rejected = [];
  for (const network of ['Sepolia', 'Hoodi', 'Mainnet']) {
    const lines = section.split('\n').filter(l => new RegExp('^\\|\\s*' + network + '\\s*\\|', 'i').test(l));
    if (lines.length !== 1) throw new Error('Missing/duplicate EIP network: ' + network);
    const cells = lines[0].split('|').slice(1, -1).map(c => c.trim());
    const value = cells[2];
    if (!value || /^(TBD|TBA)$/i.test(value)) { rejected.push({ network, reason: 'no-confirmed-activation-date' }); continue; }
    const m = value.match(/^(\d{10})\s*\((\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC\)$/);
    if (!m || !validDay(m[2])) throw new Error('Unsupported or invalid EIP activation value: ' + value);
    const iso = m[2] + 'T' + m[3] + 'Z';
    if (!Number.isFinite(Date.parse(iso)) || new Date(Number(m[1]) * 1000).toISOString() !== new Date(iso).toISOString()) throw new Error('EIP timestamp/date disagreement');
    if (!/^\d+$/.test(cells[1])) throw new Error('Activation epoch missing');
    events.push(eventRow('ETH', network, 'glamsterdam', m[2], iso, 'Glamsterdam — aktywacja na ' + network,
      'https://github.com/ethereum/EIPs/blob/master/EIPS/eip-7773.md', verifiedAt, 'CC0-1.0', SOURCES[0].licenseUrl));
    events.at(-1).sourceBlobSha = sha;
  }
  return { events, rejected, inspected: 3, sourceBlobSha: sha };
}
const MONTHS = Object.fromEntries(['January','February','March','April','May','June','July','August','September','October','November','December'].map((s,i) => [s, String(i+1).padStart(2,'0')]));
function parseStellar(data, verifiedAt) {
  const { text, sha } = contentFile(data);
  const events = [], rejected = [];
  const headings = text.split('\n').filter(l => /^## .*Protocol \d+/i.test(l) || /^## Protocol \d+/i.test(l));
  if (!headings.length) throw new Error('Stellar protocol headings missing or changed');
  for (const line of headings) {
    // Only network activation headings. Preview, phase and software release dates never qualify.
    const m = line.match(/^## (?:[\w ,'-]+, )?Protocol (\d+) \((Mainnet|Testnet), ([A-Za-z]+) (\d{1,2}), (\d{4})\)\s*$/);
    if (!m) { rejected.push({ heading: line, reason: 'unsupported-or-not-explicit-network-date' }); continue; }
    const date = m[5] + '-' + MONTHS[m[3]] + '-' + m[4].padStart(2, '0');
    if (!validDay(date)) throw new Error('Invalid Stellar date: ' + line);
    const e = eventRow('XLM', m[2], 'protocol-' + m[1], date, null,
      'Stellar Protocol ' + m[1] + ' — ' + m[2], 'https://github.com/stellar/stellar-docs/blob/main/docs/networks/software-versions.mdx',
      verifiedAt, 'Apache-2.0', SOURCES[1].licenseUrl);
    e.sourceBlobSha = sha;
    events.push(e);
  }
  return { events, rejected, inspected: headings.length, sourceBlobSha: sha };
}
function inspectReleases(data) {
  if (!Array.isArray(data) || data.some(r => !r || typeof r.html_url !== 'string' || typeof r.tag_name !== 'string' || typeof r.published_at !== 'string')) throw new Error('Unexpected releases schema');
  return { events: [], inspected: data.length, rejected: data.map(r => ({ sourceUrl: r.html_url, tag: r.tag_name,
    reason: 'software-release-is-not-a-scheduled-network-event', publishedAt: r.published_at })),
    note: 'Monitoring only: release bodies require a dedicated reviewed schedule adapter; published_at is never an event date.' };
}

// Optional alternative-source audit. Public subscriptions only, never Luma's paid/internal API.
const ALTERNATIVE_SOURCES = [
  { id:'eth-protocol-calls', token:'ETH', kind:'ics', url:'https://calendar.google.com/calendar/ical/c_upaofong8mgrmrkegn7ic7hk5s%40group.calendar.google.com/public/basic.ics', pageUrl:'https://github.com/ethereum/pm', calendarUrl:'https://calendar.google.com/calendar/embed?src=c_upaofong8mgrmrkegn7ic7hk5s%40group.calendar.google.com', reuse:'review-required', reuseReason:'Public subscription and embedding supported; no explicit permission found for republication of derived calendar records. Repository CC-BY-SA-3.0 is not assumed to license the external calendar.', terms:'https://support.google.com/calendar/answer/37083' },
  { id:'eth-event-gardeners', token:'ETH', kind:'ics', url:'https://api.lu.ma/ics/get?entity=calendar&id=cal-w4F5OCEtiPWTF9H', pageUrl:'https://luma.com/ethereumeg', reuse:'review-required', reuseReason:'Documented public ICS and supported-interface exception in Luma terms; scope of public aggregation and organizer rights needs clarification.', terms:'https://luma.com/terms', minRefreshHours:12 },
  { id:'xlm-sdf-calendar', token:'XLM', kind:'ics', url:'https://api.lu.ma/ics/get?entity=calendar&id=cal-4SDwG16dMzxx2eh', pageUrl:'https://luma.com/stellar.org', reuse:'review-required', reuseReason:'Public ICS supported by Luma. Organizer permission and interaction with SDF terms for public aggregation not expressly settled.', terms:'https://luma.com/terms', minRefreshHours:12 },
  { id:'xlm-meridian-side-calendar', token:'XLM', kind:'ics', url:'https://api.lu.ma/ics/get?entity=calendar&id=cal-j4WD21uqn69rXHy', pageUrl:'https://luma.com/meridian-2026-side-events', reuse:'review-required', reuseReason:'Official Meridian website links this community side-event calendar; this does not establish permission to republish host content.', terms:'https://luma.com/terms', minRefreshHours:12 },
  { id:'dot-opengov', token:'DOT', kind:'opengov', url:'https://api.data.parity.io/api/daily-opengov-referenda-results?relay_chain=polkadot&chain=polkadot_asset_hub', pageUrl:'https://api.data.parity.io/docs', reuse:'allowed-with-attribution', attribution:'Data: Parity Dotlake API', terms:'https://api.data.parity.io/openapi.json' }
];
function inspectOpenGov(data) {
  if (!Array.isArray(data) || data.some(r=>!Number.isSafeInteger(r.referendum_index) || typeof r.outcome!=='string' || typeof r.end_date!=='string' || !Number.isSafeInteger(r.end_block))) throw new Error('Unexpected Dotlake referendum schema');
  const monitoring=data.filter(r=>r.outcome==='Ongoing').map(r=>({token:'DOT', referendumIndex:r.referendum_index, state:r.outcome, chain:r.chain, endDate:r.end_date==='NaT'?null:r.end_date, endBlock:r.end_block || null, sourceUrl:'https://api.data.parity.io/docs', attribution:'Data: Parity Dotlake API'}));
  return {events:[], monitoring, inspected:data.length, rejected:data.map(r=>({token:'DOT',referendumIndex:r.referendum_index,reason:r.outcome==='Ongoing'?'no-confirmed-calendar-deadline':'historical-referendum-result',date:validDay(r.end_date)?r.end_date:null})), note:'Historical results API, not a future UTC schedule. Ongoing records monitored separately; block heights, periods, start_date and observed end_date never become predicted calendar events.'};
}
async function run(options = {}) {
  options = { cacheDir: path.join(BASE, '.cache'), output: path.join(BASE, options.alternatives?'events.alternatives.json':'events.sample.json'), ...options };
  const startedAt = new Date().toISOString(), window = makeWindow(Date.parse(startedAt), options.from);
  const receipts = [], events = [], rejected = [], reviewRequired = [], monitoring = []; let requests = 0;
  // Six fixed endpoints, serial requests: no search API or unbounded pagination.
  for (const source of [...SOURCES,...(options.alternatives?ALTERNATIVE_SOURCES:[])]) {
    try {
      const fetched = await getSource(source, { ...options, onRequest: () => requests++ });
      const parsed = source.kind==='ics'?parseIcs(fetched.data,fetched.verifiedAt,source,window):source.kind==='opengov'?inspectOpenGov(fetched.data):source.kind === 'eip' ? parseEip(fetched.data, fetched.verifiedAt) : source.kind === 'stellar' ? parseStellar(fetched.data, fetched.verifiedAt) : inspectReleases(fetched.data);
      (source.reuse==='review-required'?reviewRequired:events).push(...parsed.events);
      monitoring.push(...(parsed.monitoring||[]).map(row=>({...row,verifiedAt:fetched.verifiedAt})));
      rejected.push(...parsed.rejected.map(row => ({ source: source.id, ...row })));
      receipts.push({ id: source.id, token: source.token, kind: source.kind, status: fetched.transport === 'cache-not-reverified' ? 'cached' : 'verified',
        verifiedAt: fetched.verifiedAt, transport: fetched.transport, ...fetched.receipt, inspected: parsed.inspected, parsedEvents: parsed.events.length,
        futureDated:parsed.futureDated??null, reuse:source.reuse||'licensed-source', reuseReason:source.reuseReason||null, terms:source.terms||null, attribution:source.attribution||null, minRefreshHours:source.minRefreshHours||6, license: source.license || null, licenseUrl: source.licenseUrl || null, note: parsed.note || null });
    } catch (error) {
      receipts.push({ id: source.id, token: source.token, status: 'unavailable', url: source.url, error: error.message, ...(error.receipt || {}) });
    }
  }
  const unique = deduplicate(events), selected = unique.filter(e => inWindow(e, window)), reviewSelected=deduplicate(reviewRequired).filter(e=>inWindow(e,window));
  rejected.push(...unique.filter(e => !inWindow(e, window)).map(e => ({ sourceUrl: e.sourceUrl, token: e.token, date: e.date, reason: 'outside-requested-window' })));
  const result = { schemaVersion: 1, mode: options.alternatives?'stage1-alternative-audit':'stage1-prototype', generatedAt: new Date().toISOString(), window, counts: Object.fromEntries(['ETH','DOT','XLM'].map(t => [t, selected.filter(e => e.token === t).length])),
    coverage: options.alternatives ? {ETH:'Licensed EIP schedules plus public organizer ICS; republication of ICS facts held for clarification',DOT:'Public Parity Dotlake referendum results and ongoing monitoring; no inferred UTC deadlines',XLM:'Licensed protocol schedules plus SDF ICS and Meridian side calendar; no main Meridian event found in either feed'} : { ETH: 'Glamsterdam EIP activation table only; ecosystem conferences excluded', DOT: 'Release monitoring only; no adapter for calendar-dated governance or ecosystem events', XLM: 'Explicit Mainnet/Testnet protocol headings only; conferences excluded' },
    complete: false, requests, reviewRequiredCounts: Object.fromEntries(['ETH','DOT','XLM'].map(t=>[t,reviewSelected.filter(e=>e.token===t).length])), reviewRequiredEvents: reviewSelected, monitoring, sources: receipts, disabledSources: DISABLED, events: selected, rejected };
  await atomicJson(options.output, result);
  return result;
}
function parseArgs(argv) {
  const options = {};
  for (let i=0; i<argv.length; i++) {
    const arg=argv[i];
    if (arg === '--alternatives') options.alternatives=true;
    else if (arg === '--offline') options.offline=true;
    else if (arg === '--force') options.force=true;
    else if (['--from','--output','--cache-dir'].includes(arg)) {
      const value=argv[++i]; if (!value || value.startsWith('--')) throw new Error('Missing value for ' + arg);
      options[arg === '--from' ? 'from' : arg === '--output' ? 'output' : 'cacheDir']=arg === '--from' ? value : path.resolve(value);
    } else throw new Error('Unknown argument: ' + arg);
  }
  // Never overwrite the live data, UI or workflow through CLI arguments.
  for (const p of [options.output, options.cacheDir].filter(Boolean)) {
    const relative=path.relative(BASE,p);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Output/cache must stay inside docs/crypto-calendar-stage1');
  }
  return options;
}
if (require.main === module) Promise.resolve().then(() => {
  const options = parseArgs(process.argv.slice(2));
  return run(options).then(result => ({ result, output: options.output || path.join(BASE, options.alternatives?'events.alternatives.json':'events.sample.json') }));
}).then(({ result, output }) => {
  console.log(JSON.stringify({ output, window: result.window, counts: result.counts, reviewRequiredCounts:result.reviewRequiredCounts, requests: result.requests,
    unavailable: result.sources.filter(s=>s.status==='unavailable').map(s=>s.id), complete: result.complete }, null, 2));
  if (result.sources.some(s=>s.status==='unavailable')) process.exitCode=2;
}).catch(error => { console.error(error.message); process.exitCode=1; });
module.exports = { SOURCES, ALTERNATIVE_SOURCES, parseIcs, inspectOpenGov, approvedEventUrl, getSource, validDay, addDays, dayInWarsaw, makeWindow, inWindow, parseEip, parseStellar, inspectReleases, deduplicate, parseArgs, run };
