import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import fs from 'node:fs';

test('brief v5 app passes Node ES-module syntax check before deployment', () => {
  const file=resolve(process.cwd(),'brief-v5/app.mjs');
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert.equal(
    result.status,
    0,
    ['node --check failed for brief-v5/app.mjs',result.stdout,result.stderr].filter(Boolean).join('\n')
  );
});


test('summary order keeps decision instruments ahead of booking/snapshot and call focus', () => {
  const file=resolve(process.cwd(),'brief-v5/app.mjs');
  const source=fs.readFileSync(file,'utf8');
  const renderStart=source.indexOf('function render(brief)');
  assert.ok(renderStart>=0,'render() missing');
  const render=source.slice(renderStart);
  const orientation=render.indexOf('orientationMarkup(brief,context,companySnapshot)');
  const score=render.indexOf('scoreMarkup(scorecard)');
  const pair=render.indexOf('bookingSnapshotMarkup(context.booking_text,snapshotMarkup)');
  const focus=render.indexOf('<article class="call-focus panel">');
  assert.ok(orientation>=0&&score>orientation&&pair>score&&focus>pair,'V5 summary hierarchy drifted');
});

test('orientation no longer embeds booking request', () => {
  const file=resolve(process.cwd(),'brief-v5/app.mjs');
  const source=fs.readFileSync(file,'utf8');
  const start=source.indexOf('function orientationMarkup');
  const end=source.indexOf('function bookingMarkup',start);
  assert.ok(start>=0&&end>start,'orientation/booking functions missing');
  assert.doesNotMatch(source.slice(start,end),/bookingMarkup\(/);
});


test('company snapshot omits vanity scale metrics from the V5 presentation', () => {
  const file=resolve(process.cwd(),'brief-v5/app.mjs');
  const source=fs.readFileSync(file,'utf8');
  const start=source.indexOf('function companySnapshotMarkup');
  const end=source.indexOf('function contextMarkup',start);
  assert.ok(start>=0&&end>start,'company snapshot renderer missing');
  const renderer=source.slice(start,end);
  assert.match(renderer,/\['founded_year','headquarters','employee_size','company_type'\]/);
  assert.doesNotMatch(renderer,/scale_metric/);
});

test('lead identity card has a dedicated dark-surface class', () => {
  const app=fs.readFileSync(resolve(process.cwd(),'brief-v5/app.mjs'),'utf8');
  const css=fs.readFileSync(resolve(process.cwd(),'brief-v5/styles.css'),'utf8');
  assert.match(app,/identity-card identity-card--dark panel/);
  assert.match(css,/identity-card\.identity-card--dark\.panel/);
});


test('V5 typography retains alternate numeral one and intentional character variants', () => {
  const css=fs.readFileSync(resolve(process.cwd(),'brief-v5/styles.css'),'utf8');
  const features=/font-feature-settings:\s*"liga"\s*1,\s*"calt"\s*1,\s*"ss07"\s*1,\s*"ss08"\s*1,\s*"cv10"\s*1,\s*"cv01"\s*1/g;
  assert.ok([...css.matchAll(features)].length>=2,'Inter alternate one must survive both typography declarations');
  assert.match(css,/InterVariable,Inter/,'variable Inter should remain preferred when available');
  assert.doesNotMatch(css,/font-feature-settings:[^;]*"zero"\s*1/,'keep normal zero glyph');
});
