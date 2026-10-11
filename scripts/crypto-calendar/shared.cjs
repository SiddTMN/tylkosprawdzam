'use strict';
// Shared audited ICS, date and HTTP/cache helpers. Kept compatible with stage 1.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const BASE=path.resolve(__dirname,'../../docs/crypto-calendar-stage1');
const TZ='Europe/Warsaw';
const TTL_MS=6*60*60*1000;
function validDay(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === s;
}
function addDays(s, count) {
  if (!validDay(s)) throw new Error('Invalid calendar date: ' + s);
  return new Date(Date.parse(s + 'T00:00:00Z') + count * 86400000).toISOString().slice(0, 10);
}
function dayInWarsaw(ms) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ms).map(p => [p.type, p.value]));
  return parts.year + '-' + parts.month + '-' + parts.day;
}
function makeWindow(now, from) {
  const first = from || dayInWarsaw(now);
  if (!validDay(first)) throw new Error('--from must be a real YYYY-MM-DD date');
  return { from: first, toExclusive: addDays(first, 30), timezone: TZ, timedAfter: from ? null : new Date(now).toISOString() };
}
function inWindow(event, range) {
  const day = event.startsAt ? dayInWarsaw(Date.parse(event.startsAt)) : event.date;
  return validDay(day) && day >= range.from && day < range.toExclusive &&
    (!event.startsAt || !range.timedAfter || Date.parse(event.startsAt) >= Date.parse(range.timedAfter));
}

function approvedEventUrl(value) {
  try { const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password &&
    (u.hostname==='github.com' || (u.hostname==='luma.com' && /^\/[a-zA-Z0-9._-]+\/?$/.test(u.pathname) && !u.search) ||
     (u.hostname==='calendar.google.com' && u.pathname==='/calendar/embed' && u.search==='?src=c_upaofong8mgrmrkegn7ic7hk5s%40group.calendar.google.com')); }
  catch { return false; }
}

function icsTime(t) {
  if (!t || !validDay(t.toString().slice(0,10))) throw new Error('Missing/invalid DTSTART or DTEND');
  if (t.isDate) return {date:t.toString(),startsAt:null,time:null,timezone:null};
  if (!t.zone || t.zone.tzid==='floating') throw new Error('Unresolved or floating event timezone');
  const iso=t.toJSDate().toISOString();
  return {date:iso.slice(0,10),startsAt:iso,time:iso.slice(11,19),timezone:'UTC'};
}
function parseIcs(text, verifiedAt, source, window) {
  const imported=require(path.join(BASE,'node_modules/ical.js'));
  const ICAL=imported.default || imported;
  if (typeof text!=='string' || !/^BEGIN:VCALENDAR\r?\n/.test(text) || !/END:VCALENDAR\s*$/.test(text)) throw new Error('Invalid calendar envelope');
  // ICAL normalizes invalid dates: validate original date fields before handing them to it.
  const unfolded=text.replace(/\r?\n[ \t]/g,'');
  for (const line of unfolded.split(/\r?\n/)) {
    if (/^(DTSTART|DTEND|RECURRENCE-ID|RDATE|EXDATE)(;|:)/.test(line)) {
      for (const v of line.slice(line.indexOf(':')+1).split(',')) {
        const m=v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
        if (!m || !validDay(m[1]+'-'+m[2]+'-'+m[3]) || (m[4] && (+m[4]>23 || +m[5]>59 || +m[6]>59))) throw new Error('Invalid ICS date field');
      }
    }
  }
  const cal=new ICAL.Component(ICAL.parse(text));
  const rows=cal.getAllSubcomponents('vevent');
  if (rows.length>5000) throw new Error('Too many calendar components');
  const groups=new Map(), rejected=[], events=[]; const datedFacts=new Set(); let operations=0;
  for (const c of rows) {
    const uid=c.getFirstPropertyValue('uid'); if (!uid) throw new Error('Missing ICS UID');
    const rid=c.getFirstPropertyValue('recurrence-id')?.toString() || '';
    const k=uid+'|'+rid, prior=groups.get(k), sequence=c.getFirstPropertyValue('sequence') || 0;
    if (prior && sequence===prior.sequence && c.toString()!==prior.c.toString()) throw new Error('Conflicting ICS revision: '+uid);
    if (!prior || sequence>prior.sequence) groups.set(k,{c,sequence,uid,rid});
  }
  const masters=[...groups.values()].filter(x=>!x.rid);
  const exceptions=[...groups.values()].filter(x=>x.rid);
  const emit=(item,start,end,recurrenceId,recurring)=>{
    if (/^CANCELLED$/i.test(item.component.getFirstPropertyValue('status')||'')) {rejected.push({token:source.token,uid:item.uid,reason:'publisher-cancelled'});return;}
    const timing=icsTime(start), summary=item.summary?.trim();
    if (!summary) throw new Error('Missing ICS summary');
    const finish=icsTime(end); if ((finish.startsAt||finish.date)<(timing.startsAt||timing.date)) throw new Error('ICS end before start');
    const e={id:source.token+':ics:'+item.uid+':'+recurrenceId, token:source.token,...timing,title:summary,type:source.token==='ETH'?'protocol-meeting':'ecosystem-event',priority:/All Core Devs/.test(summary)?'medium':'low',sourceUrl:source.calendarUrl||source.pageUrl,verifiedAt,sourceId:source.id,publisherStatus:item.component.getFirstPropertyValue('status')||null,recurring,recurrenceId,reuse:source.reuse,reviewReasons:[source.reuseReason,...(/^TENTATIVE$/i.test(item.component.getFirstPropertyValue('status')||'')?['publisher-status-tentative']:[])].filter(Boolean),endsAt:finish.startsAt,endDateExclusive:finish.startsAt?null:finish.date};
    if (!inWindow(e,window)) return;
    const detailUrl=item.component.getFirstPropertyValue('url') || item.description?.match(/https:\/\/luma\.com\/[a-zA-Z0-9._-]+/)?.[0];
    if (detailUrl && approvedEventUrl(detailUrl)) e.sourceUrl=detailUrl;
    if (/^CANCELLED$/i.test(e.publisherStatus||'')) {rejected.push({token:e.token,title:summary,date:e.date,sourceUrl:e.sourceUrl,reason:'publisher-cancelled'});return;}
    datedFacts.add([e.token,e.title,e.startsAt||e.date,e.endsAt||e.endDateExclusive].join('|'));
    if (source.id==='xlm-meridian-side-calendar') {rejected.push({token:e.token,title:summary,date:e.date,startsAt:e.startsAt,sourceUrl:e.sourceUrl,reason:'community-social-side-event-not-major-ecosystem-event'});return;}
    if (/Office Hour/i.test(summary)) {rejected.push({token:e.token,title:summary,date:e.date,sourceUrl:e.sourceUrl,reason:'routine-office-hours'});return;}
    events.push(e);
  };
  for (const {c,uid} of masters) {
    if (/^CANCELLED$/i.test(c.getFirstPropertyValue('status')||'')) {rejected.push({token:source.token,uid,reason:'publisher-cancelled-series'});continue;}
    const related=exceptions.filter(x=>x.uid===uid).map(x=>new ICAL.Event(x.c));
    const event=new ICAL.Event(c,{exceptions:related,strictExceptions:true});
    if (event.isRecurring()) {
      const rules=c.getAllProperties('rrule');
      if (rules.some(p=>!['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(p.getFirstValue().freq))) throw new Error('Unsupported high-frequency recurrence');
      const iterator=event.iterator(); let occurrence, iterations=0;
      while ((occurrence=iterator.next())) {
        if (++iterations>10000 || ++operations>200000) throw new Error('Recurrence expansion limit exceeded');
        if (occurrence.toString().slice(0,10)>addDays(window.toExclusive,2)) break;
        const override=related.find(e=>e.recurrenceId.compare(occurrence)===0)||event.findRangeException(occurrence);
        if (override && /^CANCELLED$/i.test(override.component.getFirstPropertyValue('status')||'')) {rejected.push({token:source.token,uid,reason:'publisher-cancelled',recurrenceId:occurrence.toString()});continue;}
        const details=event.getOccurrenceDetails(occurrence);
        emit(details.item,details.startDate,details.endDate,occurrence.toString(),true);
      }
    } else emit(event,event.startDate,event.endDate,event.startDate.toString(),false);
  }
  // Detached overrides may move an occurrence into the window from outside the series bound.
  for (const {c,uid} of exceptions) {
    const parent=masters.find(x=>x.uid===uid)?.c;
    if (parent && /^CANCELLED$/i.test(parent.getFirstPropertyValue('status')||'')) continue;
    if (/^CANCELLED$/i.test(c.getFirstPropertyValue('status')||'')) continue;
    const e=new ICAL.Event(c);
    if (parent && parent.getAllProperties('exdate').some(p=>p.getValues().some(t=>t.compare(e.recurrenceId)===0))) continue;
    emit(e,e.startDate,e.endDate,e.recurrenceId.toString(),true);
  }
  const unique=deduplicate(events,{tokens:[source.token],approveUrl:source.approveUrl || approvedEventUrl});
  // Different UIDs can represent the same editorially duplicated appointment in Google Calendar.
  const facts=new Map();for (const e of unique) {const k=[e.token,e.title,e.startsAt||e.date,e.endsAt||e.endDateExclusive].join('|');const p=facts.get(k);if(p)p.alsoSeenUids=[...(p.alsoSeenUids||[]),e.id];else facts.set(k,e);}
  return {events:[...facts.values()],rejected,inspected:rows.length,futureDated:datedFacts.size, note:'Only explicit DTSTART and organizer RRULE; respects exceptions, exclusions, cancellations and timezones. No article/release dates. Only minimal facts retained.'};
}

function deduplicate(events, {tokens=['ETH','DOT','XLM'],approveUrl=approvedEventUrl}={}) {
  const groups = new Map();
  for (const e of events) {
    if (!validDay(e.date) || !tokens.includes(e.token) || !e.id || !approveUrl(e.sourceUrl) || !Number.isFinite(Date.parse(e.verifiedAt))) throw new Error('Invalid normalized event');
    const prior = groups.get(e.id);
    if (prior && (prior.date !== e.date || prior.startsAt !== e.startsAt || prior.type !== e.type)) throw new Error('Conflicting dates for event ' + e.id);
    if (!prior || e.verifiedAt > prior.verifiedAt) groups.set(e.id, e);
  }
  return [...groups.values()].sort((a,b) => (a.startsAt || a.date).localeCompare(b.startsAt || b.date) || a.id.localeCompare(b.id));
}
async function readCache(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
async function atomicJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + process.pid + '.tmp';
  try { await fs.writeFile(temp, JSON.stringify(data, null, 2) + '\n'); await fs.rename(temp, file); }
  finally { await fs.unlink(temp).catch(() => {}); }
}
async function getSource(source, options) {
  const file = path.join(options.cacheDir, source.id + '.json');
  const cache = await readCache(file);
  if (cache && cache.url !== source.url) throw new Error('Cache source mismatch');
  const current = options.now ?? Date.now();
  const age = cache ? current - Date.parse(cache.verifiedAt) : Infinity;
  if (options.offline || (!options.force && age >= 0 && age < Math.max(TTL_MS,(source.minRefreshHours || 0)*3600000))) {
    if (!cache) throw new Error('Offline cache unavailable');
    return { ...cache, transport: 'cache-not-reverified', requests: 0 };
  }
  const headers = { 'User-Agent': 'tylkosprawdzam-crypto-calendar-prototype/0.2', Accept: source.kind==='ics'?'text/calendar':source.kind==='opengov'?'application/json':'application/vnd.github+json' };
  if (source.url.startsWith('https://api.github.com/')) headers['X-GitHub-Api-Version']='2022-11-28';
  if (cache?.etag) headers['If-None-Match'] = cache.etag;
  // No retries, no auth fallback, no alternate endpoints after 403/429.
  options.onRequest?.();
  const response = await (options.fetchImpl || fetch)(source.url, { headers, redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs ?? 15000) });
  const checkedAt = new Date(options.now ?? Date.now()).toISOString();
  const receipt = { url: source.url, httpStatus: response.status, checkedAt, rateRemaining: response.headers.get('x-ratelimit-remaining'),
    rateReset: response.headers.get('x-ratelimit-reset'), retryAfter: response.headers.get('retry-after') };
  if (response.status === 304 && cache) {
    source.validateData?.(cache.data, checkedAt);
    const updated = { ...cache, verifiedAt: checkedAt, receipt };
    await atomicJson(file, updated);
    return { ...updated, transport: 'http-304-revalidated', requests: 1 };
  }
  if (!response.ok) { const error = new Error('HTTP ' + response.status + '; source unavailable, no retry'); error.receipt = receipt; throw error; }
  if (!(source.kind==='ics'?/text\/calendar/i:/json/i).test(response.headers.get('content-type') || '')) throw new Error('Unexpected content type');
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) throw new Error('Response exceeds 2 MiB limit'); chunks.push(chunk); }
  const body = Buffer.concat(chunks).toString('utf8');
  const data = source.kind==='ics'?body:JSON.parse(body);
  source.validateData?.(data, checkedAt);
  const fetched = { url: source.url, data, verifiedAt: checkedAt, etag: response.headers.get('etag'),
    receipt: { ...receipt, bytes, sha256: crypto.createHash('sha256').update(body).digest('hex'), hasMorePages: Boolean(response.headers.get('link')?.includes('rel="next"')) } };
  await atomicJson(file, fetched);
  return { ...fetched, transport: 'http-200', requests: 1 };
}

module.exports={validDay,addDays,dayInWarsaw,makeWindow,inWindow,approvedEventUrl,icsTime,parseIcs,deduplicate,readCache,atomicJson,getSource};
