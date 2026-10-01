const arr=value=>Array.isArray(value)?value:[];
const text=value=>typeof value==='string'?value.trim():'';
const COMPANY_FACT_KEYS=['founded_year','headquarters','employee_size','company_type','scale_metric'];

function parseMaybeJson(value){
  if(value&&typeof value==='object')return value;
  if(typeof value!=='string'||!value.trim())return {};
  try{return JSON.parse(value);}catch{return {};}
}
function normalizeHost(value){
  const raw=text(value).toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
  return raw.replace(/:\d+$/,'');
}
function parseHttpsUrl(value){
  try{
    const url=new URL(value);
    return url.protocol==='https:'?url:null;
  }catch{return null;}
}
function sourceHost(url){
  const parsed=parseHttpsUrl(url);
  return parsed?parsed.hostname.toLowerCase().replace(/^www\./,''):'';
}
function isFirstParty(url,domainHost){
  const host=sourceHost(url),domain=normalizeHost(domainHost);
  return Boolean(host&&domain&&(host===domain||host.endsWith('.'+domain)));
}
function linkedinKind(url){
  const parsed=parseHttpsUrl(url);
  if(!parsed)return'';
  const host=parsed.hostname.toLowerCase().replace(/^www\./,'');
  if(host!=='linkedin.com'&&!host.endsWith('.linkedin.com'))return'';
  const parts=parsed.pathname.split('/').filter(Boolean);
  if(parts[0]==='in'&&parts.length===2&&parts[1])return'person';
  if(parts[0]==='company'&&parts.length>=2&&parts[1])return'company';
  return'';
}
function canonicalLinkedInProfileUrl(value){
  const parsed=parseHttpsUrl(value);
  if(!parsed||linkedinKind(parsed.href)!=='person')return'';
  const slug=parsed.pathname.split('/').filter(Boolean)[1];
  return 'https://www.linkedin.com/in/'+slug+'/';
}
function compactSpaces(value){return text(value).replace(/\s+/g,' ').trim();}
function normalized(value){
  return compactSpaces(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu,'')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu,' ')
    .trim();
}
function firstSentence(value,max=150){
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
  })).filter(item=>parseHttpsUrl(item.url)&&(item.title||item.content));
}
function canonicalTruth(input){
  const direct=parseMaybeJson(input?.canonical_truth_json);
  if(arr(direct?.canonical_evidence_registry).length)return direct;
  const stage=parseMaybeJson(input?.stage_output_json);
  const nested=parseMaybeJson(stage?.canonical_truth_json);
  return arr(nested?.canonical_evidence_registry).length?nested:{};
}
function normalizeCanonicalResults(input,domainHost){
  const truth=canonicalTruth(input);
  return arr(truth?.canonical_evidence_registry)
    .filter(item=>item?.admission_status==='ADMITTED'&&item?.channel==='IDENTITY_PRODUCT')
    .map(item=>{
      const url=text(item?.source_url);
      const first=isFirstParty(url,domainHost);
      const linked=linkedinKind(url);
      return {
        title:compactSpaces(item?.source_title),
        url,
        content:compactSpaces(item?.source_excerpt),
        score:null,
        source_type:first?'FIRST_PARTY':linked?'PUBLIC_INDEX':'ADMITTED_PUBLIC',
        evidence_strength:text(item?.strength)||'MEDIUM',
        evidence_id:text(item?.evidence_id)||null
      };
    })
    .filter(item=>parseHttpsUrl(item.url)&&(item.title||item.content));
}
function evidence(result){return compactSpaces([result.title,result.content].filter(Boolean).join(' — '));}
function candidate({value,display,label,result,sourceType,confidence='MEDIUM',extra={}}){
  if(value==null||!parseHttpsUrl(result?.url))return null;
  return {
    value,
    display:display??String(value),
    label,
    source_url:result.url,
    source_label:sourceHost(result.url)||'Source',
    source_type:sourceType,
    supported:true,
    confidence,
    evidence_quote:evidence(result),
    ...extra
  };
}
function companySources(results,domainHost){
  return results.filter(result=>
    isFirstParty(result.url,domainHost)
    || linkedinKind(result.url)==='company'
    || result?.source_type==='ADMITTED_PUBLIC'
  );
}
function firstPartySources(results,domainHost){
  return results.filter(result=>isFirstParty(result.url,domainHost));
}
function sourceType(result,domainHost){
  if(isFirstParty(result.url,domainHost))return'FIRST_PARTY';
  if(linkedinKind(result.url))return'PUBLIC_INDEX';
  if(result?.source_type==='ADMITTED_PUBLIC')return'ADMITTED_PUBLIC';
  return null;
}
function consistentCandidate(candidates,keyFn=item=>normalized(item?.display)){
  const usable=candidates.filter(Boolean);
  if(!usable.length)return null;
  const keys=new Set(usable.map(keyFn).filter(Boolean));
  if(keys.size!==1)return null;
  return usable.find(item=>item.source_type==='FIRST_PARTY')||usable[0];
}
function extractAsOf(value){
  const match=compactSpaces(value).match(/\bas of\s+([^.;|]{4,40})/i);
  return match?compactSpaces(match[1]):null;
}
function findFoundedYear(results,domainHost){
  const currentYear=new Date().getUTCFullYear()+1;
  const candidates=[];
  for(const result of companySources(results,domainHost)){
    const hay=evidence(result);
    for(const {label,re} of [
      {label:'Founded',re:/\bfounded\s*(?:in|:|-)?\s*((?:18|19|20)\d{2})\b/i},
      {label:'Established',re:/\bestablished\s*(?:in|:|-)?\s*((?:18|19|20)\d{2})\b/i}
    ]){
      const match=hay.match(re);if(!match)continue;
      const year=Number(match[1]);if(year<1800||year>currentYear)continue;
      candidates.push(candidate({
        value:year,
        display:String(year),
        label,
        result,
        sourceType:sourceType(result,domainHost),
        confidence:isFirstParty(result.url,domainHost)?'HIGH':'MEDIUM'
      }));
    }
  }
  return consistentCandidate(candidates,item=>String(item.value));
}
function cleanLocation(value){
  return compactSpaces(value)
    .replace(/\s+(?:company size|industry|founded|specialties)\b.*$/i,'')
    .replace(/,\s*(?:serving|with)\b.*$/i,'')
    .replace(/[,:;\-\s]+$/,'')
    .trim();
}
function findHeadquarters(results,domainHost){
  const candidates=[];
  for(const result of companySources(results,domainHost)){
    const hay=evidence(result);
    for(const {label,re} of [
      {label:'Headquarters',re:/\bheadquarters?\s*[:\-]\s*([^|.;\n]{2,90})/i},
      {label:'Headquarters',re:/\bheadquartered\s+in\s+([^|.;\n]{2,90})/i},
      {label:'Main location',re:/\bbased\s+in\s+([^|.;\n]{2,90})/i}
    ]){
      const match=hay.match(re);if(!match)continue;
      const location=cleanLocation(match[1]);
      if(location.length<2||location.length>80)continue;
      candidates.push(candidate({
        value:location,
        display:location,
        label,
        result,
        sourceType:sourceType(result,domainHost),
        confidence:isFirstParty(result.url,domainHost)?'HIGH':'MEDIUM'
      }));
    }
  }
  return consistentCandidate(candidates,item=>normalized(item.value));
}
function employeeBand(count){
  const n=Number(String(count).replace(/,/g,''));
  if(!Number.isFinite(n)||n<1)return'';
  if(n<=10)return'1–10';
  if(n<=50)return'11–50';
  if(n<=200)return'51–200';
  if(n<=500)return'201–500';
  if(n<=1000)return'501–1,000';
  if(n<=5000)return'1,001–5,000';
  if(n<=10000)return'5,001–10,000';
  return'10,001+';
}
function findEmployeeSize(results,domainHost){
  const candidates=[];
  for(const result of companySources(results,domainHost)){
    const hay=evidence(result);
    const asOf=extractAsOf(hay);
    const range=hay.match(/(?:company\s+size\s*[:\-]?\s*)?([0-9][0-9,]*\s*[-–—]\s*[0-9][0-9,]*)\s+employees\b/i);
    if(range){
      const display=compactSpaces(range[1]).replace(/\s*[-–—]\s*/,'–');
      candidates.push(candidate({
        value:display,
        display,
        label:'Approx. employees',
        result,
        sourceType:sourceType(result,domainHost),
        confidence:'MEDIUM',
        extra:{approximate:true,as_of:asOf}
      }));
      continue;
    }
    const exact=hay.match(/\b(?:approximately|approx\.?|about|around)?\s*([0-9][0-9,]*)\s+employees\b/i);
    if(exact){
      const display=employeeBand(exact[1]);if(!display)continue;
      candidates.push(candidate({
        value:display,
        display,
        label:'Approx. employees',
        result,
        sourceType:sourceType(result,domainHost),
        confidence:'MEDIUM',
        extra:{approximate:true,as_of:asOf,derived_from_exact_count:true}
      }));
    }
  }
  return consistentCandidate(candidates,item=>item.display);
}
function findCompanyType(results,domainHost,company){
  const companyTokens=normalized(company).split(' ').filter(Boolean);
  const candidates=firstPartySources(results,domainHost).slice().sort((a,b)=>{
    const aAbout=/about|company|home/i.test(a.title+' '+a.url)?1:0;
    const bAbout=/about|company|home/i.test(b.title+' '+b.url)?1:0;
    return bAbout-aAbout+(Number(b.score||0)-Number(a.score||0));
  });
  for(const result of candidates){
    const raw=compactSpaces(result.content);if(!raw)continue;
    const sentences=raw.split(/(?<=[.!?])\s+/);
    for(const sentence of sentences){
      const norm=normalized(sentence);
      if(companyTokens.length&&!companyTokens.every(token=>norm.includes(token)))continue;
      const match=sentence.match(/\b(?:is|are)\s+(?:an?\s+)?([^.!?]{4,120})/i);
      if(!match)continue;
      const display=compactSpaces(match[1]).replace(/\s+(?:that|which)\s+.*$/i,'').trim();
      if(display.length<3||display.length>120)continue;
      return candidate({value:display,display,label:'Company type',result,sourceType:'FIRST_PARTY',confidence:'MEDIUM'});
    }
    const industry=raw.match(/\bindustry\s*[:\-]\s*([^|.;]{3,80})/i);
    if(industry){
      const display=compactSpaces(industry[1]);
      return candidate({value:display,display,label:'Company type',result,sourceType:'FIRST_PARTY',confidence:'MEDIUM'});
    }
  }
  return null;
}
function titleCase(value){return text(value).replace(/\b\w/g,char=>char.toUpperCase());}
function findScaleMetric(results,domainHost){
  const units='customers|users|creators|developers|organizations|companies|teams|businesses|locations|merchants|stores';
  const patterns=[
    new RegExp('\\b(?:trusted by|serves?|used by|supports?|powers?)\\s+(?:(more than|over|approximately|approx\\.?|about|around|nearly)\\s+)?([0-9][0-9,.]*\\s*(?:k|m|b|million|billion)?\\+?)\\s+('+units+')\\b','i'),
    new RegExp('\\b(?:(more than|over|approximately|approx\\.?|about|around|nearly)\\s+)?([0-9][0-9,.]*\\s*(?:k|m|b|million|billion)?\\+?)\\s+('+units+')\\b','i')
  ];
  const ranked=companySources(results,domainHost).slice().sort((a,b)=>{
    const aFirst=isFirstParty(a.url,domainHost)?1:0,bFirst=isFirstParty(b.url,domainHost)?1:0;
    return bFirst-aFirst+(Number(b.score||0)-Number(a.score||0));
  });
  for(const result of ranked){
    const hay=evidence(result);
    for(const re of patterns){
      const match=hay.match(re);if(!match)continue;
      const qualifier=compactSpaces(match[1])||null;
      const value=compactSpaces(match[2]);
      const unit=compactSpaces(match[3]);
      const display=compactSpaces([qualifier,value,unit].filter(Boolean).join(' '));
      return candidate({
        value,
        display,
        label:titleCase(unit),
        result,
        sourceType:sourceType(result,domainHost),
        confidence:isFirstParty(result.url,domainHost)?'HIGH':'MEDIUM',
        extra:{qualifier,as_of:extractAsOf(hay)}
      });
    }
  }
  return null;
}
function findDescription(results,domainHost){
  const candidates=firstPartySources(results,domainHost).slice().sort((a,b)=>{
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
const COMPANY_STOP=new Set(['inc','ltd','llc','corp','corporation','company','co','group','gmbh','sas','sa']);
function personIdentityMatches(result,prospectName,company){
  const nameTokens=normalized(prospectName).split(' ').filter(token=>token.length>1);
  if(nameTokens.length<2)return false;
  const hay=normalized([result.title,result.content].join(' '));
  const nameMatches=nameTokens.filter(token=>hay.includes(token)).length;
  if(nameMatches<Math.min(2,nameTokens.length))return false;
  const companyTokens=normalized(company).split(' ').filter(token=>token.length>1&&!COMPANY_STOP.has(token));
  return Boolean(companyTokens.length&&companyTokens.some(token=>hay.includes(token)));
}
function findLinkedIn(results,prospectName,company,prospectRole){
  if(!text(prospectName)||!text(company))return null;
  for(const result of results){
    const profileUrl=canonicalLinkedInProfileUrl(result.url);if(!profileUrl)continue;
    if(!personIdentityMatches(result,prospectName,company))continue;
    const hay=normalized(result.title+' '+result.content);
    const roleTokens=normalized(prospectRole).split(' ').filter(token=>token.length>3);
    const roleMatch=Boolean(roleTokens.length&&roleTokens.some(token=>hay.includes(token)));
    return candidate({
      value:profileUrl,
      display:'LinkedIn',
      label:'Prospect LinkedIn',
      result:{...result,url:profileUrl},
      sourceType:'PUBLIC_INDEX',
      confidence:roleMatch?'HIGH':'MEDIUM',
      extra:{identity_match:{name:true,company:true,role:roleMatch}}
    });
  }
  return null;
}
function uniqueSources(items){
  const map=new Map();
  for(const item of items.filter(Boolean)){
    const url=text(item.source_url);if(!url||map.has(url))continue;
    map.set(url,{url,source_type:item.source_type,source_label:item.source_label});
  }
  return [...map.values()];
}
function isEmployeeBand(value){
  return /^(?:\d[\d,]*–\d[\d,]*|\d[\d,]*\+)$/.test(text(value));
}

export function validateCompanySnapshotV1(snapshot={},context={}){
  const errors=[];
  if(snapshot?.schema_version!=='CLARIS_COMPANY_SNAPSHOT_V1')errors.push('SCHEMA_VERSION');
  if(snapshot?.authority!=='PRESENTATION_ONLY')errors.push('AUTHORITY');
  const domainHost=normalizeHost(context.domain_host||snapshot?.domain_host);
  const fields=snapshot?.fields||{};
  const factEntries=[['intro',snapshot?.intro],...COMPANY_FACT_KEYS.map(key=>[key,fields[key]])];
  for(const [key,item] of factEntries){
    if(item==null)continue;
    if(item.supported!==true)errors.push(key+':SUPPORTED_REQUIRED');
    if(!text(item.source_url)||!text(item.evidence_quote)||!parseHttpsUrl(item.source_url))errors.push(key+':SOURCE_REQUIRED');
    if(item.source_type==='FIRST_PARTY'&&!isFirstParty(item.source_url,domainHost))errors.push(key+':FIRST_PARTY_HOST_MISMATCH');
    if(item.source_type==='PUBLIC_INDEX'&&key!=='intro'&&linkedinKind(item.source_url)!=='company')errors.push(key+':PUBLIC_INDEX_URL_INVALID');
    if(!['FIRST_PARTY','PUBLIC_INDEX','ADMITTED_PUBLIC'].includes(item.source_type))errors.push(key+':SOURCE_TYPE');
  }
  if(fields.employee_size){
    if(fields.employee_size.approximate!==true)errors.push('employee_size:APPROXIMATE_REQUIRED');
    if(!isEmployeeBand(fields.employee_size.display))errors.push('employee_size:BAND_REQUIRED');
  }
  const linkedin=snapshot?.prospect?.linkedin_url;
  if(linkedin){
    const canonical=canonicalLinkedInProfileUrl(linkedin.value);
    if(!canonical||canonical!==linkedin.value)errors.push('prospect.linkedin_url:URL_INVALID');
    if(linkedin.source_type!=='PUBLIC_INDEX')errors.push('prospect.linkedin_url:SOURCE_TYPE');
    if(!personIdentityMatches(
      {title:'',content:linkedin.evidence_quote},
      context.prospect_name||snapshot?.prospect?.name,
      context.company||snapshot?.company_name||snapshot?.company
    )){
      errors.push('prospect.linkedin_url:IDENTITY_MISMATCH');
    }
  }
  const sources=arr(snapshot?.sources);
  const seen=new Set();
  for(const source of sources){
    const url=text(source?.url);
    if(!url||seen.has(url))errors.push('sources:DUPLICATE_OR_EMPTY');
    seen.add(url);
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
  const results=[
    ...normalizeResults(bundle?.company_prospect_context),
    ...normalizeCanonicalResults(input,domainHost)
  ];
  const fields={
    founded_year:findFoundedYear(results,domainHost),
    headquarters:findHeadquarters(results,domainHost),
    employee_size:findEmployeeSize(results,domainHost),
    company_type:findCompanyType(results,domainHost,company),
    scale_metric:findScaleMetric(results,domainHost)
  };
  const intro=findDescription(results,domainHost);
  const linkedin=findLinkedIn(results,prospectName,company,prospectRole);
  const snapshot={
    schema_version:'CLARIS_COMPANY_SNAPSHOT_V1',
    authority:'PRESENTATION_ONLY',
    company_name:company,
    company,
    domain_host:domainHost,
    intro,
    fields,
    founded_year:fields.founded_year,
    headquarters:fields.headquarters,
    employee_size:fields.employee_size,
    company_type:fields.company_type,
    scale_metric:fields.scale_metric,
    prospect_linkedin_url:linkedin?.value||null,
    prospect:{
      name:prospectName||null,
      role:prospectRole||null,
      linkedin_url:linkedin
    },
    sources:uniqueSources([intro,...Object.values(fields),linkedin])
  };
  const populatedFields=Object.values(fields).filter(Boolean).length;
  const coreFields=['founded_year','headquarters','employee_size'].filter(key=>fields[key]).length;
  snapshot.coverage={
    populated_fields:populatedFields,
    core_fields_populated:coreFields,
    renderable:populatedFields>=3&&coreFields>=2,
    has_linkedin:Boolean(linkedin)
  };
  const validation=validateCompanySnapshotV1(snapshot,{
    domain_host:domainHost,
    prospect_name:prospectName,
    company
  });
  return{...snapshot,validation};
}
