'use strict';
const {parseIcs,getSource,makeWindow,dayInWarsaw}=require('../shared.cjs');
const SOURCE={id:'eth-protocol-calls',token:'ETH',kind:'ics',name:'Ethereum Protocol Calls',
 url:'https://calendar.google.com/calendar/ical/c_upaofong8mgrmrkegn7ic7hk5s%40group.calendar.google.com/public/basic.ics',
 pageUrl:'https://github.com/ethereum/pm',calendarUrl:'https://calendar.google.com/calendar/embed?src=c_upaofong8mgrmrkegn7ic7hk5s%40group.calendar.google.com',
 reuse:'review-required',reuseReason:'Local prototype only; systematic collection and public reuse remain unresolved.'};
function normalizeTitle(title){return title.replace(/All\s*Core\s*Devs/i,'AllCoreDevs').replace(/[—–-]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();}
function parse(text,verifiedAt,now){
 const result=parseIcs(text,verifiedAt,SOURCE,makeWindow(now));
 return result.events.filter(e=>['allcoredevs execution','allcoredevs consensus'].includes(normalizeTitle(e.title))&&!/^TENTATIVE$/i.test(e.publisherStatus||'')).map(e=>{
   const execution=normalizeTitle(e.title)==='allcoredevs execution';
   return {id:e.id,token:'ETH',date:e.startsAt?dayInWarsaw(Date.parse(e.startsAt)):e.date,startsAt:e.startsAt,
     title:execution?'AllCoreDevs Execution':'AllCoreDevs Consensus',category:'protocol-meeting',priority:'medium',
     description:execution?'Spotkanie deweloperów warstwy wykonawczej Ethereum.':'Spotkanie deweloperów warstwy konsensusu Ethereum.',
     sourceId:SOURCE.id,sourceUrl:SOURCE.calendarUrl,verifiedAt:e.verifiedAt};
 });
}
module.exports={id:SOURCE.id,name:SOURCE.name,url:SOURCE.url,token:SOURCE.token,parse,
 async load(options){const fetched=await getSource({...SOURCE,validateData:(body,at)=>parse(body,at,options.now)},options);return {events:parse(fetched.data,fetched.verifiedAt,options.now),verifiedAt:fetched.verifiedAt,transport:fetched.transport};}};
