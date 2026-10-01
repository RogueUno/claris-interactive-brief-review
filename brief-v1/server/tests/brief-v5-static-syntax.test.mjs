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
