#!/usr/bin/env node
const assert = require('assert');
const { resolveApiBase } = require('./prepare');

function run() {
  console.log('Validating prepare.js API base handling...');

  const missing = resolveApiBase({});
  assert(missing.error, 'a missing NEXT_PUBLIC_APIDOT_API_BASE must be rejected');
  assert(
    missing.error.includes('NEXT_PUBLIC_APIDOT_API_BASE'),
    'the error must name the variable so the build log explains the fix'
  );

  assert(resolveApiBase({ NEXT_PUBLIC_APIDOT_API_BASE: '   ' }).error, 'a blank value must be rejected');
  assert(
    resolveApiBase({ NEXT_PUBLIC_APIDOT_API_BASE: 'apidot.example.com' }).error,
    'a relative value must be rejected'
  );
  assert(
    resolveApiBase({ NEXT_PUBLIC_APIDOT_API_BASE: 'ftp://apidot.example.com' }).error,
    'a non-http(s) value must be rejected'
  );
  assert(
    resolveApiBase({ NEXT_PUBLIC_APIDOT_API_BASE: 'not a url' }).error,
    'a malformed value must be rejected'
  );

  assert.deepStrictEqual(resolveApiBase({ NEXT_PUBLIC_APIDOT_API_BASE: 'https://apidot.example.com/' }), {
    base: 'https://apidot.example.com',
  });
  assert.deepStrictEqual(resolveApiBase({ NEXT_PUBLIC_APIDOT_API_BASE: 'http://127.0.0.1:5181' }), {
    base: 'http://127.0.0.1:5181',
  });

  console.log('✓ prepare.js API base validation OK');
}

run();
