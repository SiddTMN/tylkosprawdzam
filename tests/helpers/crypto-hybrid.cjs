'use strict';
const fs=require('node:fs'),path=require('node:path');
const M=require('../../js/crypto-calendar-model.js');
const registry=require('../../scripts/crypto-calendar/sources.cjs');
const now=Date.parse('2026-10-13T12:00:00Z'),verifiedAt=new Date(now).toISOString();
const source=registry[0];
function issue(patch={}){return {number:9001,title:'All Core Devs - Execution (ACDE) #999, October 15, 2026',state:'open',html_url:'https://github.com/ethereum/pm/issues/9001',user:{login:'fixture-only'},body:'### UTC Date & Time\n\nOctober 15, 2026, 14:00 UTC\n\n### Agenda\n\nFixture only agenda, never copied\n\n### Call Series\n\nAll Core Devs - Execution\n',...patch};}
function license(a=source){const file={ 'eth-pm':'eth-pm-license.txt','eth-glamsterdam':'eth-eips-license.txt','xlm-protocols':'xlm-docs-license.txt'}[a.id];return {type:'file',encoding:'base64',content:fs.readFileSync(path.join(__dirname,'../../data/crypto-licenses',file)).toString('base64'),sha:a.licenseBlobSha};}
function mockFetch({data=[issue()],fail=false,licenseData=license(),calls=[]}={}){return async(url,options)=>{
 calls.push({url,options});
 if(fail)throw new Error('fixture outage');
 return new Response(JSON.stringify(url===source.licenseApi?licenseData:data),{headers:{'content-type':'application/json'}});
};}
function event(patch={}){return {id:'eth-pm:9001',assets:['ETH'],title:'Fixture only',description:'Autorski opis fikcyjny do testu.',period:{precision:'day',date:'2026-10-15'},startsAt:null,confidence:'confirmed',status:'planned',origin:'auto',sourceId:source.id,sourceUrl:'https://github.com/ethereum/pm/issues/9001',verifiedAt,license:source.rights.license,licenseUrl:source.rights.licenseUrl,...patch};}
function auto(events=[]){return {schemaVersion:2,origin:'auto',generatedAt:verifiedAt,sources:{[source.id]:{name:source.name,url:source.url,checkedAt:verifiedAt,verifiedAt,status:'fresh',rights:source.rights}},events};}
function manual(events=[]){return {schemaVersion:2,origin:'manual',events};}
module.exports={M,registry,source,now,verifiedAt,issue,license,mockFetch,event,auto,manual};
