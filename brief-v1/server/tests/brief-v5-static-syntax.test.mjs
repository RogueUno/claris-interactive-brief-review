import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('brief v5 app parses as JavaScript before deployment', async () => {
  const file=resolve(process.cwd(),'brief-v5/app.mjs');
  const source=await readFile(file,'utf8');
  assert.doesNotThrow(()=>new Function(source));
});
