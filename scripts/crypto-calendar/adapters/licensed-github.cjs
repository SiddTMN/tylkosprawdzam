'use strict';
const crypto=require('node:crypto');
const M=require('../../../js/crypto-calendar-model.js');
const {parseEip,parseStellar}=require('../../test-crypto-calendar.cjs');
const MONTHS=Object.fromEntries(['January','February','March','April','May','June','July','August','September','October','November','December'].map((s,i)=>[s,String(i+1).padStart(2,'0')]));
function section(body,heading){
  const parts=body.replace(/\r/g,'').split(/^### /m).filter(x=>x.startsWith(heading+'\n'));
  if(parts.length!==1)throw new Error('missing-or-duplicate-'+heading);
  return parts[0].slice(heading.length).trim();
}
function parsePm(data,verifiedAt){
  if(!Array.isArray(data)||data.length>100)throw new Error('Unexpected PM issues schema');
  const events=[],rejected=[];
  for(const issue of data){
    if(issue?.pull_request){rejected.push({id:issue.number,reason:'pull-request-not-agenda'});continue;}
    try{
      if(!issue||!Number.isInteger(issue.number)||issue.number<1||issue.state!=='open'||typeof issue.body!=='string'||typeof issue.title!=='string'||issue.html_url!=='https://github.com/ethereum/pm/issues/'+issue.number)throw new Error('invalid-issue-metadata');
      const title=issue.title.match(/^All Core Devs - (Execution|Consensus|Testing) \(ACD[ECT]\) #(\d+), (\w+) (\d{1,2}), (\d{4})$/);
      if(!title)throw new Error('unsupported-call-series-or-title');
      const slot=section(issue.body,'UTC Date & Time');
      const plain=slot.replace(/^\[([^\]]+)\]\(https:\/\/[^\s)]+\)$/,'$1');
      const date=plain.match(/^(\w+) (\d{1,2}), (\d{4}), (\d{2}):(\d{2}) UTC$/);
      if(!date||!MONTHS[date[1]])throw new Error('missing-or-ambiguous-UTC-date');
      const utc=date[3]+'-'+MONTHS[date[1]]+'-'+date[2].padStart(2,'0'),startsAt=utc+'T'+date[4]+':'+date[5]+':00Z';
      if(M.timestamp(startsAt)===null||title[3]!==date[1]||Number(title[4])!==Number(date[2])||title[5]!==date[3])throw new Error('title-agenda-date-disagreement');
      if(section(issue.body,'Call Series')!=='All Core Devs - '+title[1])throw new Error('call-series-disagreement');
      // An explicit cancellation/tentative notice anywhere in the agenda requires
      // human review. Do not copy titles, agenda prose, meeting links or comments.
      if(/cancel(?:led|ed|lation)|postpon(?:ed|ement)|tentative|reschedul(?:ed|ing)/i.test(issue.title+'\n'+issue.body))throw new Error('changed-or-unconfirmed-meeting-status');
      const layer={Execution:'warstwy wykonawczej',Consensus:'warstwy konsensusu',Testing:'testowania protokołu'}[title[1]];
      events.push({id:'eth-pm:'+issue.number,assets:['ETH'],title:'AllCoreDevs '+title[1]+' #'+title[2],
        description:'Spotkanie zespołów Ethereum dotyczące '+layer+'. Termin podano w agendzie; spotkanie nie oznacza wdrożenia zmian.',
        period:{precision:'day',date:M.day(Date.parse(startsAt))},startsAt,confidence:'confirmed',status:'planned',origin:'auto',
        sourceId:'eth-pm',sourceUrl:issue.html_url,verifiedAt,
        attribution:issue.user?.login?'ethereum/pm; autor agendy: '+issue.user.login:'ethereum/pm contributors'});
    }catch(error){rejected.push({id:issue?.number??null,reason:error.message});}
  }
  return {events,rejected,inspected:data.length};
}
function protocolEvents(parse,data,verifiedAt,sourceId){
  const parsed=parse(data,verifiedAt);
  return {...parsed,events:parsed.events.map(e=>({id:e.id,assets:[e.token],title:e.title,
    description:e.token==='ETH'?'Aktywacja aktualizacji Glamsterdam w sieci '+e.network+'. Termin pochodzi z tabeli meta-EIP.':'Termin protokołu Stellar '+e.network+' podany w dokumentacji sieci.',
    period:{precision:'day',date:e.startsAt?M.day(Date.parse(e.startsAt)):e.date},startsAt:e.startsAt,confidence:'confirmed',status:'planned',origin:'auto',
    sourceId,sourceUrl:e.sourceUrl,verifiedAt,sourceBlobSha:e.sourceBlobSha,attribution:e.token==='ETH'?'ethereum/EIPs contributors':'Stellar Development Foundation; Stellar Open Source Developers'}))};
}
function licenseBlob(data,expectedSha){
  if(!data||data.type!=='file'||data.encoding!=='base64'||typeof data.content!=='string')throw new Error('License contents unavailable');
  const body=Buffer.from(data.content,'base64');
  const sha=crypto.createHash('sha1').update(Buffer.from('blob '+body.length+'\0')).update(body).digest('hex');
  if(data.sha!==expectedSha||sha!==expectedSha)throw new Error('License changed; review required');
  return {sha,text:body.toString('utf8')};
}
module.exports={parsePm,licenseBlob,
 parseEip:(data,at)=>protocolEvents(parseEip,data,at,'eth-glamsterdam'),
 parseStellar:(data,at)=>protocolEvents(parseStellar,data,at,'xlm-protocols')};
