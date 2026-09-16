export interface UpdateManifest {
  versione: string
  bundle_url: string
  bundle_sha256: string
  min_apk_version_code: number
  apk_version_code: number
  apk_url: string
}

export function validRepository(value: string): boolean {
  return /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(value)
}

export function parseManifest(value: unknown, repository: string): UpdateManifest | null {
  if (!validRepository(repository) || !value || typeof value !== "object") return null
  const m = value as UpdateManifest
  if (typeof m.versione !== "string" || typeof m.bundle_sha256 !== "string") return null
  if (!/^\d+\.\d+\.\d+$/.test(m.versione) || !/^[a-f0-9]{64}$/.test(m.bundle_sha256)) return null
  if (!Number.isSafeInteger(m.min_apk_version_code) || m.min_apk_version_code < 1 ||
      !Number.isSafeInteger(m.apk_version_code) || m.apk_version_code < m.min_apk_version_code) return null
  const base = `https://github.com/${repository}/releases/download/v${m.versione}`
  if (m.bundle_url !== `${base}/web-bundle.zip` || m.apk_url !== `${base}/app-release.apk`) return null
  return m
}

export function newerVersion(candidate: string, current: string): boolean {
  if (!/^\d+\.\d+\.\d+$/.test(candidate) || !/^\d+\.\d+\.\d+$/.test(current)) return false
  const next = candidate.split(".").map(Number)
  const previous = current.split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    if (next[i] !== previous[i]) return next[i] > previous[i]
  }
  return false
}

export function canInstall(manifest: UpdateManifest, installedBuild: string, currentVersion: string): boolean {
  const installed = Number(installedBuild)
  return Number.isSafeInteger(installed) && installed >= manifest.min_apk_version_code &&
    newerVersion(manifest.versione, currentVersion)
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

// The signature covers the exact payload bytes; fields outside it are for
// compatibility with older clients and are never trusted by this client.
export async function verifyManifest(envelope: unknown, repository: string, publicKey: string): Promise<UpdateManifest | null> {
  try {
    if (!envelope || typeof envelope !== "object" || !publicKey) return null
    const signed = envelope as { signed_payload: string; signature: string }
    const payload = decodeBase64(signed.signed_payload)
    const key = await crypto.subtle.importKey("spki", decodeBase64(publicKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"])
    if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodeBase64(signed.signature), payload)) return null
    return parseManifest(JSON.parse(new TextDecoder().decode(payload)), repository)
  } catch {
    return null
  }
}
