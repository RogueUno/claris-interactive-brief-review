import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCompanySnapshotV1, validateCompanySnapshotV1 } from '../company-snapshot-v1.mjs';

function bundle(overrides={}){
  return {
    fixture:{
      company:'Acme',
      domain_host:'acme.com',
      prospect_name:'Alice Smith',
      prospect_role:'VP Engineering',
      ...(overrides.fixture||{})
    },
    company_prospect_context:overrides.company_prospect_context||[]
  };
}

test('rich profile compiles supported facts, qualifiers, sources and valid LinkedIn',()=>{
  const out=compileCompanySnapshotV1({research_bundle:bundle({
    company_prospect_context:[
      {
        title:'About Acme',
        url:'https://acme.com/about',
        content:'Acme was founded in 2016. Acme is a developer infrastructure platform. Trusted by more than 20k organizations worldwide.',
        score:.98
      },
      {
        title:'Acme | LinkedIn',
        url:'https://www.linkedin.com/company/acme/',
        content:'Headquarters: San Francisco, CA. Company size: 201-500 employees.',
        score:.91
      },
      {
        title:'Alice Smith - VP Engineering at Acme | LinkedIn',
        url:'https://www.linkedin.com/in/alice-smith/?trk=public_profile',
        content:'Alice Smith · VP Engineering at Acme',
        score:.90
      }
    ]
  })});
  assert.equal(out.schema_version,'CLARIS_COMPANY_SNAPSHOT_V1');
  assert.equal(out.authority,'PRESENTATION_ONLY');
  assert.equal(out.founded_year.display,'2016');
  assert.equal(out.headquarters.display,'San Francisco, CA');
  assert.equal(out.employee_size.display,'201–500');
  assert.equal(out.employee_size.approximate,true);
  assert.equal(out.company_type.display,'developer infrastructure platform');
  assert.equal(out.scale_metric.display,'more than 20k organizations');
  assert.equal(out.scale_metric.qualifier,'more than');
  assert.equal(out.prospect_linkedin_url,'https://www.linkedin.com/in/alice-smith/');
  assert.equal(out.coverage.renderable,true);
  assert.equal(out.validation.ok,true);
  assert.equal(new Set(out.sources.map(source=>source.url)).size,out.sources.length);
});

test('sparse company renders only founded, headquarters and type',()=>{
  const out=compileCompanySnapshotV1({research_bundle:bundle({
    company_prospect_context:[
      {
        title:'About Acme',
        url:'https://acme.com/about',
        content:'Acme was founded in 2019. Acme is a security advisory firm.',
        score:.98
      },
      {
        title:'Acme | LinkedIn',
        url:'https://www.linkedin.com/company/acme/',
        content:'Headquarters: Paris, France.',
        score:.90
      }
    ]
  })});
  assert.equal(out.fields.founded_year.display,'2019');
  assert.equal(out.fields.headquarters.display,'Paris, France');
  assert.equal(out.fields.company_type.display,'security advisory firm');
  assert.equal(out.fields.employee_size,null);
  assert.equal(out.fields.scale_metric,null);
  assert.equal(out.coverage.populated_fields,3);
  assert.equal(out.coverage.core_fields_populated,2);
  assert.equal(out.coverage.renderable,true);
});

test('conflicting headquarters fail closed instead of choosing one silently',()=>{
  const out=compileCompanySnapshotV1({research_bundle:bundle({
    company_prospect_context:[
      {title:'About Acme',url:'https://acme.com/about',content:'Acme is headquartered in San Francisco, CA.',score:.98},
      {title:'Acme | LinkedIn',url:'https://www.linkedin.com/company/acme/',content:'Headquarters: New York, NY.',score:.90}
    ]
  })});
  assert.equal(out.fields.headquarters,null);
});

test('exact employee counts are converted to an approximate band',()=>{
  const out=compileCompanySnapshotV1({research_bundle:bundle({
    company_prospect_context:[
      {title:'Acme | LinkedIn',url:'https://www.linkedin.com/company/acme/',content:'Acme has 347 employees as of September 2026.',score:.90}
    ]
  })});
  assert.equal(out.fields.employee_size.display,'201–500');
  assert.equal(out.fields.employee_size.approximate,true);
  assert.equal(out.fields.employee_size.derived_from_exact_count,true);
  assert.doesNotMatch(out.fields.employee_size.display,/347/);
});

test('unsupported external scale metric is omitted',()=>{
  const out=compileCompanySnapshotV1({research_bundle:bundle({
    company_prospect_context:[
      {title:'Acme review',url:'https://example.com/acme',content:'Acme serves 5 million users.',score:.99}
    ]
  })});
  assert.equal(out.fields.scale_metric,null);
});

test('wrong-person LinkedIn is omitted',()=>{
  const out=compileCompanySnapshotV1({research_bundle:bundle({
    company_prospect_context:[
      {title:'Bob Jones - VP Engineering at Acme | LinkedIn',url:'https://www.linkedin.com/in/bob-jones/',content:'Bob Jones · VP Engineering at Acme',score:.90}
    ]
  })});
  assert.equal(out.prospect.linkedin_url,null);
  assert.equal(out.prospect_linkedin_url,null);
});

test('valid LinkedIn requires name and company support and canonicalizes the URL',()=>{
  const out=compileCompanySnapshotV1({research_bundle:bundle({
    company_prospect_context:[
      {title:'Alice Smith - VP Engineering at Acme | LinkedIn',url:'https://linkedin.com/in/alice-smith?trk=people',content:'Alice Smith · VP Engineering · Acme',score:.90}
    ]
  })});
  assert.equal(out.prospect.linkedin_url.value,'https://www.linkedin.com/in/alice-smith/');
  assert.equal(out.prospect.linkedin_url.identity_match.name,true);
  assert.equal(out.prospect.linkedin_url.identity_match.company,true);
});

test('malicious or irrelevant LinkedIn URLs are ignored',()=>{
  const out=compileCompanySnapshotV1({research_bundle:bundle({
    company_prospect_context:[
      {title:'Alice Smith at Acme',url:'javascript:alert(1)',content:'Alice Smith at Acme',score:.99},
      {title:'Alice Smith post',url:'https://www.linkedin.com/posts/alice-smith_update-123',content:'Alice Smith at Acme',score:.95}
    ]
  })});
  assert.equal(out.prospect.linkedin_url,null);
});

test('duplicate source URLs are deduplicated in the source index',()=>{
  const out=compileCompanySnapshotV1({research_bundle:bundle({
    company_prospect_context:[
      {
        title:'About Acme',
        url:'https://acme.com/about',
        content:'Acme was founded in 2018. Acme is a developer platform. Trusted by 20k organizations.',
        score:.99
      }
    ]
  })});
  assert.equal(out.sources.length,1);
  assert.equal(out.sources[0].url,'https://acme.com/about');
});

test('launched year is not silently relabeled as founded year',()=>{
  const out=compileCompanySnapshotV1({research_bundle:bundle({
    fixture:{company:'Planoly',domain_host:'planoly.com',prospect_name:'Jane Doe',prospect_role:'VP Engineering'},
    company_prospect_context:[
      {title:'About Planoly',url:'https://planoly.com/about',content:'Planoly launched in 2016 as a visual social media planner.',score:.99}
    ]
  })});
  assert.equal(out.fields.founded_year,null);
});

test('validator rejects presentation authority, source and employee precision violations',()=>{
  const bad={
    schema_version:'CLARIS_COMPANY_SNAPSHOT_V1',
    authority:'DECISION_INPUT',
    company_name:'Acme',
    domain_host:'acme.com',
    fields:{
      founded_year:{
        value:2020,
        display:'2020',
        label:'Founded',
        source_url:'https://example.com/acme',
        source_type:'FIRST_PARTY',
        supported:true,
        evidence_quote:'Acme was founded in 2020.'
      },
      headquarters:null,
      employee_size:{
        value:'347',
        display:'347',
        label:'Approx. employees',
        source_url:'https://www.linkedin.com/company/acme/',
        source_type:'PUBLIC_INDEX',
        supported:true,
        approximate:false,
        evidence_quote:'347 employees.'
      },
      company_type:null,
      scale_metric:null
    },
    prospect:{name:'Alice Smith',linkedin_url:null},
    sources:[]
  };
  const checked=validateCompanySnapshotV1(bad,{domain_host:'acme.com',prospect_name:'Alice Smith',company:'Acme'});
  assert.equal(checked.ok,false);
  assert.ok(checked.errors.includes('AUTHORITY'));
  assert.ok(checked.errors.includes('founded_year:FIRST_PARTY_HOST_MISMATCH'));
  assert.ok(checked.errors.includes('employee_size:APPROXIMATE_REQUIRED'));
  assert.ok(checked.errors.includes('employee_size:BAND_REQUIRED'));
});
