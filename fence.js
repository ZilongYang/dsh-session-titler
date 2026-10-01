/**
 * Browser-trust fence for the `/session-titler` route.
 *
 * Behaviorally identical to the `/api` gateway fence in
 * `@deepseek-ai/dsh-client-connection` (src/api-request-trust.ts +
 * src/loopback-hostname.ts), whose rules `dsh-better-sidebar` also copies for
 * its own plugin routes: a loopback or configured-trusted `Host` passes,
 * cross-site browser markers are refused. This is a DNS-rebinding / cross-site
 * defense, not authentication.
 *
 * @module dsh-session-titler/fence
 */

/** @param {Record<string, string | string[] | undefined>} headers */
function header(headers, name) {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

/** Normalized URL of a Host-header authority, or undefined when unparsable. */
function parseAuthority(authority) {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

/** Whether a normalized URL hostname names the local loopback authority. */
export function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return (
    parts.length === 4 &&
    parts[0] === '127' &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  )
}

/** Canonical authority form: hostname, or hostname:port when a port was written. */
function canonicalAuthority(entry, entryUrl) {
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}

/** Whether the request authority matches a trustedHosts entry (exact or port-less). */
function isTrustedAuthority(hostUrl, trustedHosts) {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}

/**
 * Decide whether one request may reach this plugin's routes.
 *
 * @param {{ headers: Record<string, string | string[] | undefined> }} request - node HTTP request facts.
 * @param {readonly string[]} trustedHosts - non-loopback authorities this deployment serves.
 * @returns {boolean} true when the Host is ours and the browser markers are same-origin.
 */
export function isTrustedApiRequest(request, trustedHosts) {
  const host = header(request.headers, 'host')
  if (host === undefined) return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false
  if (header(request.headers, 'sec-fetch-site') === 'cross-site') return false
  // Origin fence: a browser Origin must name the same hostname the Host fence
  // already bound (comparing hostname, not host, because some Chromium builds
  // serialize a non-default-port loopback Origin without its port). An absent
  // Origin is fine; the literal "null" is an opaque origin and is refused.
  const origin = header(request.headers, 'origin')
  if (origin === undefined) return true
  try {
    return new URL(origin).hostname === hostUrl.hostname
  } catch {
    return false
  }
}
