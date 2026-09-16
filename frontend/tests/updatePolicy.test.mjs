import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/updatePolicy.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { parseManifest, verifyManifest, newerVersion, validRepository, canInstall } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
const repository = 'example/workout'
const manifest = { versione: '1.0.25', bundle_sha256: 'a'.repeat(64), min_apk_version_code: 17, apk_version_code: 25,
  bundle_url: `https://github.com/${repository}/releases/download/v1.0.25/web-bundle.zip`,
  apk_url: `https://github.com/${repository}/releases/download/v1.0.25/app-release.apk` }

test('reject unknown repositories, foreign assets and invalid minimum versions', () => {
  assert.equal(validRepository(''), false)
  assert.equal(validRepository('example/repo/../../other'), false)
  assert.deepEqual(parseManifest(manifest, repository), manifest)
  assert.equal(parseManifest({ ...manifest, bundle_url: 'https://evil.example/code.zip' }, repository), null)
  assert.equal(parseManifest({ ...manifest, min_apk_version_code: 26 }, repository), null)
  assert.equal(parseManifest({ ...manifest, bundle_sha256: '' }, repository), null)
})

test('never install equal, older or unrecognised versions', () => {
  assert.equal(newerVersion('1.0.25', '1.0.24'), true)
  assert.equal(newerVersion('1.0.9', '1.0.25'), false)
  assert.equal(newerVersion('1.0.25', '1.0.25'), false)
  assert.equal(newerVersion('1.0.25', 'garbage'), false)
})

test('gate downloads on native compatibility before installing any bundle', () => {
  assert.equal(canInstall(manifest, '16', '1.0.16'), false)
  assert.equal(canInstall(manifest, '17', '1.0.17'), true)
  assert.equal(canInstall(manifest, 'unknown', '1.0.17'), false)
  assert.equal(canInstall(manifest, '25', '1.0.26'), false)
})

test('verify signature; reject altered data, missing signature and wrong key', async () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  const payload = Buffer.from(JSON.stringify(manifest))
  const envelope = { signed_payload: payload.toString('base64'), signature: sign('sha256', payload, pair.privateKey).toString('base64') }
  assert.deepEqual(await verifyManifest(envelope, repository, publicKey), manifest)
  assert.equal(await verifyManifest({ ...envelope, signed_payload: Buffer.from('{}').toString('base64') }, repository, publicKey), null)
  assert.equal(await verifyManifest(manifest, repository, publicKey), null)
  assert.equal(await verifyManifest(envelope, repository, ''), null)
  const wrong = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  assert.equal(await verifyManifest(envelope, repository, wrong), null)
})

test('the CI manifest generator produces a manifest the client can verify', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'workout-manifest-'))
  try {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const publicKey = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
    mkdirSync(join(folder, 'mobile'))
    writeFileSync(join(folder, 'mobile/update-policy.json'), JSON.stringify({ min_apk_version_code: 17 }))
    writeFileSync(join(folder, 'web-bundle.zip'), 'test bundle bytes')
    execFileSync(process.execPath, [fileURLToPath(new URL('../../scripts/create-update-manifest.mjs', import.meta.url))], {
      cwd: folder,
      env: { ...process.env, GITHUB_REPOSITORY: repository, VERSIONE: '1.0.25', GITHUB_RUN_NUMBER: '25',
        UPDATE_PUBLIC_KEY: publicKey,
        UPDATE_SIGNING_KEY: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) },
    })
    const envelope = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8'))
    const result = await verifyManifest(envelope, repository, publicKey)
    assert.equal(result.versione, '1.0.25')
    assert.equal(result.min_apk_version_code, 17)
    assert.equal(result.bundle_sha256.length, 64)
  } finally {
    assert.equal(dirname(resolve(folder)), resolve(tmpdir()))
    assert.ok(basename(folder).startsWith('workout-manifest-'))
    rmSync(folder, { recursive: true, force: true })
  }
})
