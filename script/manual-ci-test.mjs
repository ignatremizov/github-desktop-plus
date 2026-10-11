import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const helper = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'run-manual-ci.sh'
)
const sha = 'a'.repeat(40)

function runHelper(t, args = [], scenario = '', mode = 'build') {
  const root = mkdtempSync(join(tmpdir(), 'manual-ci-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const bin = join(root, 'bin')
  mkdirSync(bin)
  const mock = `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const command = path.basename(process.argv[1])
const args = process.argv.slice(2)
const root = process.env.FAKE_ROOT
const scenario = process.env.FAKE_SCENARIO
const mode = process.env.FAKE_MODE
const sha = '${sha}'
fs.appendFileSync(path.join(root, 'calls'), JSON.stringify([command, ...args]) + '\\n')
const emit = value => console.log(typeof value === 'string' ? value : JSON.stringify(value))
if (command === 'git') {
  const key = args.join(' ')
  if (key === 'rev-parse --show-toplevel') emit(root)
  else if (key === 'remote get-url origin') emit('git@github.com:example/project.git')
  else if (key === 'branch --show-current') emit('fork')
  else if (key === 'rev-parse HEAD') emit(scenario === 'unpublished' ? 'b'.repeat(40) : sha)
  else if (key === 'status --porcelain') emit(scenario === 'dirty' ? ' M example.txt' : '')
  else throw new Error('Unexpected git command: ' + key)
} else if (args[0] === 'workflow' && args[1] === 'run') {
  fs.writeFileSync(path.join(root, 'request'), args.find(x => x.startsWith('request_id=')).slice(11))
} else if (args[0] === 'run' && args[1] === 'list') {
  const request = fs.readFileSync(path.join(root, 'request'), 'utf8')
  emit([
    { databaseId: 999, headSha: sha, displayTitle: 'macOS build x64 [unrelated]' },
    { databaseId: 123, headSha: sha, displayTitle: 'macOS ' + mode + ' x64 [' + request + ']' },
  ])
} else if (args[0] === 'run' && args[1] === 'watch') {
  process.exit(scenario === 'failure' ? 1 : 0)
} else if (args[0] === 'run' && args[1] === 'view') {
  emit('Failed verification log')
} else if (args[0] === 'api') {
  const endpoint = args[1]
  if (endpoint.includes('/commits/')) emit(sha)
  else if (endpoint.endsWith('/artifacts')) emit(scenario === 'missing-artifact' ? '' : '456')
  else if (endpoint.includes('/actions/runs/')) {
    const requestFile = path.join(root, 'request')
    const request = fs.existsSync(requestFile) ? fs.readFileSync(requestFile, 'utf8') : 'resume'
    emit({
      head_sha: scenario === 'wrong-source' ? 'b'.repeat(40) : sha,
      head_repository: { full_name: 'example/project' },
      head_branch: 'fork',
      event: scenario === 'wrong-event' ? 'push' : 'workflow_dispatch',
      path: '.github/workflows/ci.yml',
      display_title: 'macOS ' + mode + ' x64 [' + request + ']',
    })
  } else throw new Error('Unexpected endpoint: ' + endpoint)
} else throw new Error('Unexpected gh command: ' + args.join(' '))
`
  for (const name of ['git', 'gh']) {
    writeFileSync(join(bin, name), mock, { mode: 0o755 })
  }
  const result = spawnSync('bash', [helper, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_ROOT: root,
      FAKE_SCENARIO: scenario,
      FAKE_MODE: mode,
      MANUAL_CI_POLL_SECONDS: '60',
    },
  })
  const calls = readFileSync(join(root, 'calls'), 'utf8')
    .trim()
    .split('\n')
    .map(x => JSON.parse(x))
  return { ...result, calls }
}

test('build dispatch selects its exact request and returns the artifact', t => {
  const result = runHelper(t)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /actions\/runs\/123\/artifacts\/456/)
  assert.match(result.stdout, new RegExp(`Source: ${sha}`))
  assert.ok(result.calls.some(x => x[2] === 'watch' && x[3] === '123'))
})

test('verify dispatch does not request an installable artifact', t => {
  const result = runHelper(t, ['--mode', 'verify'], '', 'verify')
  assert.equal(result.status, 0, result.stderr)
  assert.ok(result.calls.some(x => x.includes('mode=verify')))
  assert.ok(!result.calls.some(x => x.some(arg => arg.endsWith('/artifacts'))))
})

for (const scenario of ['dirty', 'unpublished']) {
  test(`rejects ${scenario} current-branch work before dispatch`, t => {
    const result = runHelper(t, [], scenario)
    assert.equal(result.status, 2)
    assert.match(result.stderr, /push first/)
    assert.ok(!result.calls.some(x => x[1] === 'workflow'))
  })
}

test('resume validates the source and watches without dispatching', t => {
  const result = runHelper(t, ['--run', '123'])
  assert.equal(result.status, 0, result.stderr)
  assert.ok(result.calls.some(x => x[2] === 'watch'))
  assert.ok(!result.calls.some(x => x[1] === 'workflow'))
})

for (const scenario of ['wrong-source', 'wrong-event']) {
  test(`refuses to watch a ${scenario} run`, t => {
    const result = runHelper(t, ['--run', '123'], scenario)
    assert.equal(result.status, 2)
    assert.match(result.stderr, /not the requested manual/)
    assert.ok(!result.calls.some(x => x[2] === 'watch'))
  })
}

test('failed verification returns failure with diagnostics, without redispatch', t => {
  const result = runHelper(t, ['--run', '123'], 'failure')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Failed verification log/)
  assert.ok(!result.calls.some(x => x[1] === 'workflow'))
})

test('successful build without its expected artifact still fails', t => {
  const result = runHelper(t, ['--run', '123'], 'missing-artifact')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /expected artifact is missing/)
})

test('argument validation rejects missing or unsupported values', () => {
  for (const args of [
    ['--mode'],
    ['--mode', 'release'],
    ['--arch', 'universal'],
    ['--run', 'no'],
  ]) {
    const result = spawnSync('bash', [helper, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 2)
    assert.match(result.stderr, /Missing value|Invalid/)
  }
})
