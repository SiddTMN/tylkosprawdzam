'use strict';
// Public path: ONLY the GitHub channels confirmed in the 2026-10-13 audit.
// Repository licensing does not authorize external ICS/HTML/API endpoints.
const P=require('./adapters/licensed-github.cjs');
const rights=(license,licenseUrl)=>({automatedAccess:true,publicReuse:true,license,licenseUrl,reviewedAt:'2026-10-13',
 evidence:'docs/research-source-audit-2026-10-13/AUDYT.md',accessTerms:'https://docs.github.com/en/site-policy/github-terms/github-terms-of-service'});
module.exports=[
 {id:'eth-pm',name:'Ethereum AllCoreDevs — agendy GitHub',assets:['ETH'],kind:'github',
  url:'https://api.github.com/repos/ethereum/pm/issues?state=open&per_page=100&sort=created&direction=desc&page=1',parse:P.parsePm,
  licenseApi:'https://api.github.com/repos/ethereum/pm/contents/LICENSE',licenseBlobSha:'604209a804632b6e5274005a22293976d07c3099',
  rights:rights('CC-BY-SA-3.0','https://github.com/ethereum/pm/blob/master/LICENSE'),coverage:'Open AllCoreDevs Execution/Consensus/Testing agendas, first 100 issues only; no recurrence inference.'},
 {id:'eth-glamsterdam',name:'Ethereum EIP-7773 — aktywacje',assets:['ETH'],kind:'github',
  url:'https://api.github.com/repos/ethereum/EIPs/contents/EIPS/eip-7773.md',parse:P.parseEip,
  licenseApi:'https://api.github.com/repos/ethereum/EIPs/contents/LICENSE.md',licenseBlobSha:'0e259d42c996742e9e3cba14c677129b2c1b6311',
  rights:rights('CC0-1.0','https://github.com/ethereum/EIPs/blob/master/LICENSE.md'),coverage:'Explicit Glamsterdam activation table only; blank/TBD dates rejected.'},
 {id:'xlm-protocols',name:'Stellar Docs — datowane protokoły',assets:['XLM'],kind:'github',
  url:'https://api.github.com/repos/stellar/stellar-docs/contents/docs/networks/software-versions.mdx',parse:P.parseStellar,
  licenseApi:'https://api.github.com/repos/stellar/stellar-docs/contents/LICENSE',licenseBlobSha:'2bf97548c26eb21e21d7c5c8f7a9bc021a549c83',
  rights:rights('Apache-2.0','https://github.com/stellar/stellar-docs/blob/main/LICENSE'),coverage:'Explicit Mainnet/Testnet protocol headings only, not a complete forward roadmap.'}
];
