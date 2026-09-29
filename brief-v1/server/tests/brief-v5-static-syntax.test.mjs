import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

test('brief v5 app passes Node ES-module syntax check before deployment', () => {
  const file=resolve(process.cwd(),'brief-v5/app.mjs');
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert.equal(
    result.status,
    0,
    ['node --check failed for brief-v5/app.mjs',result.stdout,result.stderr].filter(Boolean).join('\n')
  );
});
