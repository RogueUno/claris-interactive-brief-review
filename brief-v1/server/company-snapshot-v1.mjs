const arr=value=>Array.isArray(value)?value:[];
const text=value=>typeof value==='string'?value.trim():'';

function parseMaybeJson(value){
  if(value&&typeof value==='object')return value;
  if(typeof value!=='string'||!value.trim())return {};
  try{return JSON.parse(value);}catch{return {};}
}
function normalizeHost(value){
  const raw=text(value).toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
  return raw.replace(/:\d+$/,'');
}
function sourceHost(url){
  try{return new URL(url).hostname.toLowerCase().replace(/^www\./,'');}catch{return'';}
}
function isFirstParty(url,domainHost){
  const host=sourceHost(url),domain=normalizeHost(domainHost);
  return Boolean(host&&domain&&(host===domain||host.endsWith('.'+domain)));
}
function isLinkedIn(url,kind){
  const host=sourceHost(url);
  if(host!=='linkedin.com'&&!host.endsWith('.linkedin.com'))return false;
  const path=(()=>{try{return new URL(url).pathname.toLowerCase();}catch{return'';}})();
  return kind==='person'?path.startsWith('/in/'):kind==='company'?path.startsWith('/company/'):true;
}
function compactSpaces(value){return text(value).replace(/\s+/g,' ').trim();}
function normalized(value){return compactSpaces(value).toLowerCase().replace(/[^a-z0-9]+/g,' ');}
function firstSentence(value,max=190){
  const raw=compactSpaces(value);
  if(!raw)return'';
  const cut=raw.match(/^(.{20,}?)(?:[.!?](?:\s|$)|$)/)?.[1]||raw;
  return cut.length<=max?cut:cut.slice(0,max).replace(/\s+\S*$/,'').trim()+'…';
}
function normalizeResults(value){
  const parsed=parseMaybeJson(value);
  const list=Array.isArray(parsed)?parsed:arr(parsed?.results);
  return list.map(item=>({
    title:compactSpaces(item?.title),
    url:text(item?.url),
    content:compactSpaces(item?.content),
    score:Number.isFinite(Number(item?.score))?Number(item.score):null
  })).filter(item=>item.url&&(item.title||item.content));
}
function evidence(result){return compactSpaces([result.title,result.content].filter(Boolean).join(' — '));}
function candidate({value,display,label,result,sourceType,confidence='MEDIUM'}){
  if(value==null||!result?.url)return null;
  return {
    value,
    display:display??String(value),
    label,
    source_url:result.url,
    source_label:sourceHost(result.url)||'Source',
    source_type:sourceType,
    confidence,
    evidence_quote:evidence(result)
  };
}
function companySources(results,domainHost){
  return results.filter(r=>isFirstParty(r.url,domainHost)||isLinkedIn(r.url,'company'));
}
function firstPartySources(results,domainHost){
  return results.filter(r=>isFirstParty(r.url,domainHost));
}
function sourceType(result,domainHost){
  if(isFirstParty(result.url,domainHost))return'FIRST_PARTY';
  if(isLinkedIn(result.url,'company'))return'LINKEDIN_COMPANY_PUBLIC';
  if(isLinkedIn(result.url,'person'))return'LINKEDIN_PERSON_PUBLIC';
  return'OTHER_PUBLIC';
}
function findOriginYear(results,domainHost){
  const currentYear=new Date().getUTCFullYear()+1;
  for(const result of companySources(results,domainHost)){
    const hay=evidence(result);
    const patterns=[
      {label:'Founded',re:/\bfounded\s*(?:in|:|-)?\s*((?:18|19|20)\d{2})\b/i},
      {label:'Founded',re:/\bestablished\s*(?:in|:|-)?\s*((?:18|19|20)\d{2})\b/i},
      {label:'Launched',re:/\blaunched\s*(?:in|:|-)?\s*((?:18|19|20)\d{2})\b/i}
    ];
    for(const {label,re} of patterns){
      const match=hay.match(re);if(!match)continue;
      const year=Number(match[1]);if(year<1800||year>currentYear)continue;
      return candidate({value:year,display:String(year),label,result,sourceType:sourceType(result,domainHost),confidence:isFirstParty(result.url,domainHost)?'HIGH':'MEDIUM'});
    }
  }
  return null;
}
function cleanLocation(value){
  return compactSpaces(value)
    .replace(/\s+(?:company size|industry|founded|specialties)\b.*$/i,'')
    .replace(/,\s*(?:serving|with)\b.*$/i,'')
    .replace(/[,:;\-\s]+$/,'')
    .trim();
}
function findHeadquarters(results,domainHost){
  for(const result of companySources(results,domainHost)){
    const hay=evidence(result);
    const patterns=[
      /\bheadquarters?\s*[:\-]\s*([^|.;\n]{2,90})/i,
      /\bheadquartered\s+in\s+([^|.;\n]{2,90})/i,
      /\bbased\s+in\s+([^|.;\n]{2,90})/i
    ];
    for(const re of patterns){
      const match=hay.match(re);if(!match)continue;
      const location=cleanLocation(match[1]);
      if(location.length<2||location.length>80)continue;
      return candidate({value:location,display:location,label:'Headquarters',result,sourceType:sourceType(result,domainHost),confidence:isFirstParty(result.url,domainHost)?'HIGH':'MEDIUM'});
    }
  }
  return null;
}
function findEmployeeSize(results,domainHost){
  for(const result of companySources(results,domainHost)){
    const hay=evidence(result);
    const range=hay.match(/(?:company\s+size\s*[:\-]?\s*)?([0-9][0-9,]*\s*[-–—]\s*[0-9][0-9,]*)\s+employees\b/i);
    if(range){
      const display=compactSpaces(range[1]).replace(/\s*[-–—]\s*/,'–');
      return candidate({value:display,display,label:'Approx. employees',result,sourceType:sourceType(result,domainHost),confidence:'MEDIUM'});
    }
    const exact=hay.match(/\b([0-9][0-9,]*\+?)\s+employees\b/i);
    if(exact){
      return candidate({value:exact[1],display:exact[1],label:'Approx. employees',result,sourceType:sourceType(result,domainHost),confidence:'MEDIUM'});
    }
  }
  return null;
}
function titleCase(value){return text(value).replace(/\b\w/g,char=>char.toUpperCase());}
function findScaleMetric(results,domainHost){
  const units='customers|users|creators|developers|organizations|companies|teams|businesses|locations|merchants|stores';
  const patterns=[
    new RegExp('\\b(?:trusted by|serves?|used by|supports?|powers?)\\s+(?:more than\\s+|over\\s+)?([0-9][0-9,.]*\\s*(?:k|m|b|million|billion)?\\+?)\\s+('+units+')\\b','i'),
    new RegExp('\\b([0-9][0-9,.]*\\s*(?:k|m|b|million|billion)?\\+?)\\s+('+units+')\\b','i')
  ];
  for(const result of firstPartySources(results,domainHost)){
    const hay=evidence(result);
    for(const re of patterns){
      const match=hay.match(re);if(!match)continue;
      const display=compactSpaces(match[1]+' '+match[2]);
      return candidate({value:display,display,label:titleCase(match[2]),result,sourceType:'FIRST_PARTY',confidence:'HIGH'});
    }
  }
  return null;
}
function findDescription(results,domainHost){
  const candidates=firstPartySources(results,domainHost)
    .slice()
    .sort((a,b)=>{
      const aAbout=/about|company|home/i.test(a.title+' '+a.url)?1:0;
      const bAbout=/about|company|home/i.test(b.title+' '+b.url)?1:0;
      return bAbout-aAbout+(Number(b.score||0)-Number(a.score||0));
    });
  for(const result of candidates){
    const sentence=firstSentence(result.content);
    if(sentence.length<24)continue;
    return candidate({value:sentence,display:sentence,label:'Company',result,sourceType:'FIRST_PARTY',confidence:'MEDIUM'});
  }
  return null;
}
function personNameMatches(result,prospectName,company){
  const tokens=normalized(prospectName).split(' ').filter(token=>token.length>1);
  if(tokens.length<2)return false;
  const hay=normalized([result.title,result.content,result.url].join(' '));
  const nameMatches=tokens.filter(token=>hay.includes(token)).length;
  if(nameMatches<Math.min(2,tokens.length))return false;
  const companyTokens=normalized(company).split(' ').filter(token=>token.length>2);
  return !companyTokens.length||companyTokens.some(token=>hay.includes(token));
}
function findLinkedIn(results,prospectName,company,prospectRole){
  if(!text(prospectName))return null;
  for(const result of results){
    if(!isLinkedIn(result.url,'person'))continue;
    if(!personNameMatches(result,prospectName,company))continue;
    const hay=normalized(result.title+' '+result.content);
    const roleTokens=normalized(prospectRole).split(' ').filter(token=>token.length>3);
    const roleMatch=!roleTokens.length||roleTokens.some(token=>hay.includes(token));
    return candidate({
      value:result.url,
      display:'LinkedIn',
      label:'Prospect LinkedIn',
      result,
      sourceType:'LINKEDIN_PERSON_PUBLIC',
      confidence:roleMatch?'HIGH':'MEDIUM'
    });
  }
  return null;
}

export function validateCompanySnapshotV1(snapshot={},context={}){
  const errors=[];
  if(snapshot?.schema_version!=='CLARIS_COMPANY_SNAPSHOT_V1')errors.push('SCHEMA_VERSION');
  const domainHost=normalizeHost(context.domain_host||snapshot?.domain_host);
  const fields=snapshot?.fields||{};
  for(const [key,item] of Object.entries(fields)){
    if(item==null)continue;
    if(!text(item.source_url)||!text(item.evidence_quote))errors.push(`${key}:SOURCE_REQUIRED`);
    if(item.source_type==='FIRST_PARTY'&&!isFirstParty(item.source_url,domainHost))errors.push(`${key}:FIRST_PARTY_HOST_MISMATCH`);
    if(item.source_type==='LINKEDIN_COMPANY_PUBLIC'&&!isLinkedIn(item.source_url,'company'))errors.push(`${key}:LINKEDIN_COMPANY_URL_INVALID`);
  }
  const linkedin=snapshot?.prospect?.linkedin_url;
  if(linkedin){
    if(!isLinkedIn(linkedin.value,'person'))errors.push('prospect.linkedin_url:URL_INVALID');
    if(!personNameMatches({title:'',content:linkedin.evidence_quote,url:linkedin.value},context.prospect_name||snapshot?.prospect?.name,context.company||snapshot?.company)){
      errors.push('prospect.linkedin_url:IDENTITY_MISMATCH');
    }
  }
  return{ok:errors.length===0,errors};
}

export function compileCompanySnapshotV1(input={}){
  const bundle=parseMaybeJson(input.research_bundle);
  const fixture=bundle?.fixture||{};
  const company=text(input.company||fixture.company);
  const domainHost=normalizeHost(input.domain_host||fixture.domain_host);
  const prospectName=text(input.prospect_name||fixture.prospect_name);
  const prospectRole=text(input.prospect_role||fixture.prospect_role);
  const results=normalizeResults(bundle?.company_prospect_context);
  const snapshot={
    schema_version:'CLARIS_COMPANY_SNAPSHOT_V1',
    company,
    domain_host:domainHost,
    intro:findDescription(results,domainHost),
    fields:{
      origin_year:findOriginYear(results,domainHost),
      headquarters:findHeadquarters(results,domainHost),
      employee_size:findEmployeeSize(results,domainHost),
      scale_metric:findScaleMetric(results,domainHost)
    },
    prospect:{
      name:prospectName||null,
      role:prospectRole||null,
      linkedin_url:findLinkedIn(results,prospectName,company,prospectRole)
    }
  };
  snapshot.coverage={
    populated_fields:Object.values(snapshot.fields).filter(Boolean).length,
    core_fields_populated:['origin_year','headquarters','employee_size'].filter(key=>snapshot.fields[key]).length,
    has_linkedin:Boolean(snapshot.prospect.linkedin_url)
  };
  const validation=validateCompanySnapshotV1(snapshot,{domain_host:domainHost,prospect_name:prospectName,company});
  return{...snapshot,validation};
}
