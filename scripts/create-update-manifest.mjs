import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const { GITHUB_REPOSITORY: repository, VERSIONE: version, GITHUB_RUN_NUMBER: build,
  UPDATE_SIGNING_KEY: signingKey, UPDATE_PUBLIC_KEY: expectedPublicKey } = process.env
if (!repository || !/^\d+\.\d+\.\d+$/.test(version ?? '') || !signingKey || !expectedPublicKey) {
  throw new Error('Configure UPDATE_SIGNING_KEY and UPDATE_PUBLIC_KEY before publishing updates.')
}
const privateKey = createPrivateKey(signingKey)
const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('base64')
if (publicKey !== expectedPublicKey) throw new Error('Update signing key does not match the key embedded in the app.')
const policy = JSON.parse(readFileSync('mobile/update-policy.json', 'utf8'))
if (!Number.isSafeInteger(policy.min_apk_version_code) || policy.min_apk_version_code < 1 ||
    policy.min_apk_version_code > Number(build)) throw new Error('Invalid minimum APK version.')
const base = `https://github.com/${repository}/releases/download/v${version}`
const manifest = {
  versione: version,
  bundle_url: `${base}/web-bundle.zip`,
  bundle_sha256: createHash('sha256').update(readFileSync('web-bundle.zip')).digest('hex'),
  min_apk_version_code: policy.min_apk_version_code,
  apk_version_code: Number(build),
  apk_url: `${base}/app-release.apk`,
}
const payload = Buffer.from(JSON.stringify(manifest))
writeFileSync('manifest.json', JSON.stringify({ ...manifest,
  signed_payload: payload.toString('base64'),
  signature: sign('sha256', payload, privateKey).toString('base64'),
}, null, 2) + '\n')
