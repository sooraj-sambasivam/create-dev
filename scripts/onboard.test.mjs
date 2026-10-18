import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVersion, versionAtLeast, parseEnvNames, parseBehindCount, isExpectedRemote, summarizeTests, parseWebPort,
} from './onboard.mjs';

test('versionAtLeast compares semver', () => {
  assert.equal(versionAtLeast('v22.0.0', '22.0.0'), true);
  assert.equal(versionAtLeast('26.11.1', '22'), true);
  assert.equal(versionAtLeast('21.9.9', '22.0.0'), false);
  assert.equal(versionAtLeast('9.15.9\n', '9'), true);
  assert.equal(versionAtLeast('8.15.0', '9'), false);
  assert.equal(versionAtLeast('garbage', '9'), false);
  assert.deepEqual(parseVersion('v22.1'), [22, 1, 0]);
});

test('parseEnvNames returns only names, never values', () => {
  const text = [
    '# comment',
    'ANTHROPIC_API_KEY=sk-secret-123',
    'ELEVENLABS_API_KEY=',
    'TYPESAFE_API_KEY="  "',
    'export PERCEPTRON_API_KEY=abc # note',
    "MONGODB_URI='mongodb://u:p@h'",
    'YOUTUBE_API_KEY=',
    'MOCK_AI=1',
  ].join('\n');
  const r = parseEnvNames(text);
  assert.deepEqual(r.names, ['ANTHROPIC_API_KEY', 'PERCEPTRON_API_KEY', 'MONGODB_URI']);
  assert.equal(r.mockAi, true);
  const dump = JSON.stringify(r);
  for (const v of ['sk-secret-123', 'abc', 'mongodb://u:p@h']) assert.ok(!dump.includes(v));
});

test('parseEnvNames handles MOCK_AI off and unset', () => {
  assert.equal(parseEnvNames('MOCK_AI=0').mockAi, false);
  assert.equal(parseEnvNames('MOCK_AI=').mockAi, false);
  assert.equal(parseEnvNames('MOCK_AI=true').mockAi, false);
  assert.equal(parseEnvNames('').mockAi, null);
  assert.deepEqual(parseEnvNames(undefined).names, []);
});

test('parseBehindCount', () => {
  assert.equal(parseBehindCount('3\n'), 3);
  assert.equal(parseBehindCount('0'), 0);
  assert.equal(parseBehindCount(''), null);
  assert.equal(parseBehindCount('fatal: bad revision'), null);
});

test('isExpectedRemote', () => {
  assert.ok(isExpectedRemote('https://github.com/sooraj-sambasivam/create-dev.git'));
  assert.ok(isExpectedRemote('git@github.com:sooraj-sambasivam/create-dev'));
  assert.ok(!isExpectedRemote('https://github.com/other/create-dev.git'));
});

test('summarizeTests', () => {
  assert.match(summarizeTests('Tests  12 passed (12)\nTests  5 passed (5)'), /17 tests passed across 2/);
  assert.equal(summarizeTests('nothing'), null);
});

test('parseWebPort reads the vite server port', () => {
  assert.equal(parseWebPort('export default defineConfig({\n  server: {\n    port: 5175,\n    proxy: {}\n  },\n})'), 5175);
  assert.equal(parseWebPort('export default defineConfig({ plugins: [] })'), null);
  assert.equal(parseWebPort(undefined), null);
});
