import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCompanySnapshotV1, validateCompanySnapshotV1 } from '../company-snapshot-v1.mjs';

const research={
  fixture:{
    company:'Planoly',
    domain_host:'planoly.com',
    prospect_name:'Jane Doe',
    prospect_role:'VP Engineering'
  },
  company_prospect_context:[
    {
      title:'About Planoly',
      url:'https://www.planoly.com/about-us',
      content:'Planoly launched in 2016 as a visual social media planner. Trusted by 8 million creators worldwide.',
      score:.96
    },
    {
      title:'Planoly | LinkedIn',
      url:'https://www.linkedin.com/company/planoly/',
      content:'Headquarters: Austin, Texas. Company size: 51-200 employees. Industry: Software.',
      score:.91
    },
    {
      title:'Jane Doe - VP Engineering at Planoly | LinkedIn',
      url:'https://www.linkedin.com/in/jane-doe/',
      content:'Jane Doe · VP Engineering at Planoly',
      score:.88
    }
  ]
};

test('compiles bounded company snapshot fields and prospect LinkedIn from one context result set',()=>{
  const out=compileCompanySnapshotV1({research_bundle:research});
  assert.equal(out.schema_version,'CLARIS_COMPANY_SNAPSHOT_V1');
  assert.equal(out.fields.origin_year.display,'2016');
  assert.equal(out.fields.origin_year.label,'Launched');
  assert.equal(out.fields.headquarters.display,'Austin, Texas');
  assert.equal(out.fields.employee_size.display,'51–200');
  assert.equal(out.fields.scale_metric.display,'8 million creators');
  assert.equal(out.prospect.linkedin_url.value,'https://www.linkedin.com/in/jane-doe/');
  assert.equal(out.coverage.core_fields_populated,3);
  assert.equal(out.validation.ok,true);
});

test('does not relabel launch year as founded year',()=>{
  const out=compileCompanySnapshotV1({research_bundle:research});
  assert.equal(out.fields.origin_year.label,'Launched');
});

test('fails closed for wrong-person LinkedIn result and absent unsupported metrics',()=>{
  const out=compileCompanySnapshotV1({
    research_bundle:{
      fixture:{company:'Acme',domain_host:'acme.com',prospect_name:'Alice Smith',prospect_role:'CISO'},
      company_prospect_context:[
        {title:'About Acme',url:'https://acme.com/about',content:'Acme builds infrastructure software.',score:.9},
        {title:'Bob Jones - CISO at Acme | LinkedIn',url:'https://www.linkedin.com/in/bob-jones/',content:'Bob Jones · CISO at Acme',score:.8}
      ]
    }
  });
  assert.equal(out.fields.origin_year,null);
  assert.equal(out.fields.headquarters,null);
  assert.equal(out.fields.employee_size,null);
  assert.equal(out.fields.scale_metric,null);
  assert.equal(out.prospect.linkedin_url,null);
  assert.equal(out.validation.ok,true);
});

test('validator rejects falsely labeled first-party and LinkedIn sources',()=>{
  const bad={
    schema_version:'CLARIS_COMPANY_SNAPSHOT_V1',
    company:'Acme',
    domain_host:'acme.com',
    fields:{
      origin_year:{
        value:2020,display:'2020',label:'Founded',
        source_url:'https://example.com/acme',
        source_type:'FIRST_PARTY',
        evidence_quote:'Acme was founded in 2020.'
      }
    },
    prospect:{
      name:'Alice Smith',
      linkedin_url:{
        value:'https://example.com/alice',
        source_url:'https://example.com/alice',
        source_type:'LINKEDIN_PERSON_PUBLIC',
        evidence_quote:'Alice Smith at Acme'
      }
    }
  };
  const checked=validateCompanySnapshotV1(bad,{domain_host:'acme.com',prospect_name:'Alice Smith',company:'Acme'});
  assert.equal(checked.ok,false);
  assert.ok(checked.errors.includes('origin_year:FIRST_PARTY_HOST_MISMATCH'));
  assert.ok(checked.errors.includes('prospect.linkedin_url:URL_INVALID'));
});
