#!/usr/bin/env node
// Developer onboarding: fresh clone to running. Plain Node ESM, no deps.
// Usage: pnpm onboard [--quick] [--doctor] [--branch <name>]
import { spawnSync } from 'node:child_process';
import { existsSync, copyFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

export const SECRET_KEYS = [
  'ANTHROPIC_API_KEY',
  'ELEVENLABS_API_KEY',
  'TYPESAFE_API_KEY',
  'PERCEPTRON_API_KEY',
  'MONGODB_URI',
  'YOUTUBE_API_KEY',
];

export const KEY_FALLBACKS = {
  ANTHROPIC_API_KEY: 'real page generation, sketch and intent AI; without it the server uses canned mock screens and keyword intent routing',
  ELEVENLABS_API_KEY: 'voice transcription and realtime mic; without it voice falls back to browser speech (typing still works)',
  TYPESAFE_API_KEY: 'TypeSafe/Jev judgments; without it those calls are skipped and the app still runs',
  PERCEPTRON_API_KEY: 'sketch reading by Perceptron; without it sketches are read by the other path or mocks',
  MONGODB_URI: 'share links in Atlas; without it share links use a local file store',
  YOUTUBE_API_KEY: 'live YouTube data; without it that live data is unavailable',
};

/** Parse "v22.1.0" / "9.12.0" into [major, minor, patch]; null if unparsable. */
export function parseVersion(s) {
  const m = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(String(s ?? ''));
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}

/** True when version `have` is >= `need` (both dotted strings). */
export function versionAtLeast(have, need) {
  const a = parseVersion(have);
  const b = parseVersion(need);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

/**
 * Parse .env text into { names: string[] with non-empty values, mockAi: boolean|null }.
 * Never returns values (except the derived MOCK_AI on/off boolean).
 */
export function parseEnvNames(text) {
  const set = new Set();
  let mockRaw = null;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1).trim();
    else v = v.replace(/\s+#.*$/, '').trim();
    if (m[1] === 'MOCK_AI') mockRaw = v;
    if (v !== '') set.add(m[1]);
  }
  return {
    names: SECRET_KEYS.filter((k) => set.has(k)),
    mockAi: mockRaw === null ? null : mockRaw === '1',
  };
}

/** Parse the output of `git rev-list --count HEAD..origin/integrate`. */
export function parseBehindCount(out) {
  const n = Number.parseInt(String(out ?? '').trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** True when a git remote URL points at sooraj-sambasivam/create-dev. */
export function isExpectedRemote(url) {
  return /sooraj-sambasivam\/create-dev(\.git)?\/?$/i.test(String(url ?? '').trim());
}

/** Summarize test runner output into a short pass-count string. */
export function summarizeTests(out) {
  const text = String(out ?? '');
  const passes = [...text.matchAll(/Tests\s+(\d+)\s+passed/gi)].map((m) => Number(m[1]));
  const node = [...text.matchAll(/^\s*[ℹ#]\s*pass\s+(\d+)/gim)].map((m) => Number(m[1]));
  const all = passes.length ? passes : node;
  if (!all.length) return null;
  return `${all.reduce((a, b) => a + b, 0)} tests passed across ${all.length} package(s)`;
}

// ---------- runtime ----------

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return { ok: r.status === 0, out: (r.stdout ?? '') + (r.stderr ?? ''), stdout: r.stdout ?? '', status: r.status };
}

let failures = 0;
const ok = (m) => console.log(`✓ ${m}`);
const warn = (m, fix) => console.log(`! ${m}${fix ? `\n    fix: ${fix}` : ''}`);
const bad = (m, fix) => {
  failures++;
  console.log(`✗ ${m}${fix ? `\n    fix: ${fix}` : ''}`);
};
const head = (m) => console.log(`\n${m}`);

function checkTools() {
  head('Tooling');
  const nodeV = process.versions.node;
  if (versionAtLeast(nodeV, '22.0.0')) ok(`Node ${nodeV}`);
  else bad(`Node ${nodeV} is too old (need >= 22)`, 'install Node 22+ (nvm install 22)');
  const p = sh('pnpm', ['-v']);
  if (!p.ok) bad('pnpm not found', 'corepack enable && corepack prepare pnpm@9.12.0 --activate');
  else if (versionAtLeast(p.stdout, '9.0.0')) ok(`pnpm ${p.stdout.trim()}`);
  else bad(`pnpm ${p.stdout.trim()} is too old (need >= 9)`, 'corepack prepare pnpm@9.12.0 --activate');
  return p.ok;
}

function checkGit(root, branch) {
  head('Git');
  if (!sh('git', ['rev-parse', '--git-dir'], { cwd: root }).ok) {
    bad('not a git repository', 'clone the repo: git clone https://github.com/sooraj-sambasivam/create-dev.git');
    return;
  }
  const remote = sh('git', ['remote', 'get-url', 'origin'], { cwd: root }).stdout.trim();
  if (isExpectedRemote(remote)) ok('origin is sooraj-sambasivam/create-dev');
  else bad(`origin is "${remote || 'missing'}"`, 'git remote set-url origin https://github.com/sooraj-sambasivam/create-dev.git');
  const f = sh('git', ['fetch', 'origin'], { cwd: root });
  if (f.ok) ok('git fetch origin');
  else warn('git fetch failed (offline or no access?)', 'check network and GitHub access, then re-run');

  const cur = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root }).stdout.trim();
  if (branch) {
    const exists = sh('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: root }).ok;
    if (exists) ok(`branch ${branch} already exists`);
    else {
      const c = sh('git', ['checkout', '-b', branch, 'origin/integrate'], { cwd: root });
      if (c.ok) ok(`created ${branch} from origin/integrate`);
      else bad(`could not create ${branch}`, 'commit or stash local changes, then: git checkout -b ' + branch + ' origin/integrate');
    }
  }
  const now = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root }).stdout.trim() || cur;
  if (now === 'main') warn('on main', 'main is owner-only: work on a branch off integrate (pnpm onboard --branch <you>/<lane>)');
  else ok(`on branch ${now}`);
  const behind = parseBehindCount(sh('git', ['rev-list', '--count', 'HEAD..origin/integrate'], { cwd: root }).stdout);
  if (behind === null) warn('could not compare with origin/integrate', 'git fetch origin');
  else if (behind === 0) ok('up to date with origin/integrate');
  else warn(`${behind} commit(s) behind origin/integrate`, 'git pull --rebase origin integrate');
}

function installDeps(root) {
  head('Dependencies');
  const r = sh('pnpm', ['install'], { cwd: root });
  if (r.ok) ok('pnpm install');
  else bad('pnpm install failed', 'run pnpm install and read the error');
}

function checkEnv(root) {
  head('Environment (apps/server/.env)');
  const envPath = join(root, 'apps/server/.env');
  const example = join(root, 'apps/server/.env.example');
  if (!existsSync(envPath)) {
    if (existsSync(example)) {
      copyFileSync(example, envPath);
      warn('created apps/server/.env from .env.example', 'ask Sooraj for the shared team keys and paste them into that file');
    } else bad('apps/server/.env.example is missing', 'git pull --rebase origin integrate');
  } else ok('apps/server/.env exists (not overwritten)');
  if (existsSync(envPath)) {
    const { names, mockAi } = parseEnvNames(readFileSync(envPath, 'utf8'));
    for (const k of SECRET_KEYS) {
      if (names.includes(k)) ok(`${k} is set`);
      else warn(`${k} is empty`, `without it: ${KEY_FALLBACKS[k]}`);
    }
    if (mockAi === null) warn('MOCK_AI is not set (off)', 'set MOCK_AI=1 (exactly 1) to develop without an Anthropic key');
    else ok(`MOCK_AI is ${mockAi ? 'on' : 'off'}`);
  }
  const ig = sh('git', ['check-ignore', '-q', 'apps/server/.env'], { cwd: root });
  if (ig.ok) ok('.env is gitignored');
  else bad('.env is NOT gitignored', 'add ".env" to .gitignore; never commit keys (the repo goes public)');
}

function portOwner(port) {
  const r = sh('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fc']);
  const m = /^c(.+)$/m.exec(r.stdout);
  return m ? m[1] : null;
}

/** Dev web port from vite.config.ts text; null when not set (Vite then defaults to 5173). */
export function parseWebPort(text) {
  const m = /server\s*:\s*\{[^}]*?\bport\s*:\s*(\d+)/s.exec(String(text ?? ''));
  return m ? Number(m[1]) : null;
}

function webPort(root) {
  try {
    return parseWebPort(readFileSync(join(root, 'apps/web/vite.config.ts'), 'utf8'));
  } catch {
    return null;
  }
}

function portFree(port) {
  return new Promise((res) => {
    const s = net.createServer();
    s.once('error', () => res(false));
    s.once('listening', () => s.close(() => res(true)));
    s.listen(port);
  });
}

async function checkPorts(root) {
  head('Ports');
  for (const [port, label] of [[3001, 'API'], [webPort(root) ?? 5173, 'web']]) {
    if (await portFree(port)) ok(`port ${port} (${label}) is free`);
    else {
      const who = portOwner(port);
      warn(`port ${port} (${label}) is busy${who ? ` (process: ${who})` : ''}`, `stop that process (lsof -iTCP:${port} -sTCP:LISTEN) or it may be your own pnpm dev`);
    }
  }
}

function runChecks(root) {
  head('Checks');
  const t = sh('pnpm', ['typecheck'], { cwd: root });
  if (t.ok) ok('pnpm typecheck');
  else bad('pnpm typecheck failed', 'run pnpm typecheck; if it fails on a fresh integrate checkout, tell Sooraj');
  const r = sh('pnpm', ['test'], { cwd: root });
  const summary = summarizeTests(r.out);
  if (r.ok) ok(`pnpm test${summary ? ` (${summary})` : ''}`);
  else bad('pnpm test failed', 'run pnpm test and read the first failure');
}

function nextSteps(root) {
  head('Next steps');
  const wp = webPort(root);
  const web = wp ? `http://localhost:${wp}` : 'http://localhost:5173 (default; Vite uses the next free port if busy)';
  console.log(`  pnpm dev
    web  ${web}
    API  http://localhost:3001/api/health
  Backend view: menu (☰) -> Backend
  PR flow: branch off integrate -> PR into integrate -> Sooraj merges. Never main.
  Team board: https://claude.ai/artifact/74KUCraV2sJAmMFMGxbJuP
  Docs: docs/ONBOARDING.md`);
}

export async function main(argv) {
  const quick = argv.includes('--quick');
  const doctor = argv.includes('--doctor');
  const bi = argv.indexOf('--branch');
  const branch = bi >= 0 ? argv[bi + 1] : null;
  if (bi >= 0 && (!branch || branch.startsWith('--'))) {
    console.log('✗ --branch needs a name, e.g. --branch you/lane');
    return 1;
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  console.log(`Create onboarding${doctor ? ' (doctor: checks only)' : ''}`);
  const hasPnpm = checkTools();
  checkGit(root, doctor ? null : branch);
  if (!doctor && hasPnpm) installDeps(root);
  checkEnv(root);
  await checkPorts(root);
  if (!doctor && !quick && hasPnpm) runChecks(root);
  else console.log('\n- typecheck/tests skipped (--quick or --doctor)');
  nextSteps(root);
  console.log(failures ? `\n${failures} problem(s) need fixing.` : '\nAll set.');
  return failures ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => process.exit(c));
}
