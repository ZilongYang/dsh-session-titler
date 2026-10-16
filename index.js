/**
 * Host half of dsh-session-titler.
 *
 * Registers one fenced, read-only HTTP route that proposes a whole-session
 * title. The Client half shows the proposal, the user confirms it, and the
 * shipped rename path writes the durable `session/title` event. This plugin
 * never appends session events itself, so the session log stays the single
 * source of truth and nothing is written before the user agrees.
 *
 * One route can be owned by only one `apply` at a time, and a deployment may
 * mount this package more than once (a market hot mount beside the profile's
 * bundle row, or an HMR profile-patch reload re-applying the same row). The
 * webserver refuses a duplicate `(kind, path)` outright, and that refusal
 * fails the entry, so registration here is idempotent: the newest mount takes
 * the route over from the previous one instead of colliding with it.
 *
 * @module dsh-session-titler
 */

import { isTrustedApiRequest } from './fence.js'
import { POLICY, TitlerError, messageOf, proposeTitle } from './title.js'

export const name = 'session-titler'

/** Host services this plugin needs; a profile without them leaves it unmounted. */
export const inject = ['webServer', 'sessions', 'sessionQuery', 'llm']

/** Exact path of the proposal route. */
const ROUTE_PATH = '/session-titler/propose'

/**
 * Process-wide handle of the live proposal route.
 *
 * It is keyed on `globalThis` rather than a module binding because two mounts
 * of this package are two module instances whenever their URLs differ (a
 * market copy under `.dsh-market/` beside the profile's own copy), and a
 * module-scoped variable would then be blind to the other instance's route.
 */
const ROUTE_HANDLE = Symbol.for('dsh-session-titler/propose-route')

/** Process-wide marker so a duplicate mount is reported once, not per reload. */
const DUPLICATE_WARNED = Symbol.for('dsh-session-titler/duplicate-mount-warned')

/**
 * Whether one thrown registration error is this route's own duplicate-path
 * refusal. Only that refusal may be tolerated; every other failure must reach
 * the entry so a real misconfiguration is not hidden.
 */
function isOwnDuplicateRoute(error) {
  return (
    error instanceof Error &&
    /^webserver: duplicate (?:exact|prefix) route /u.test(error.message) &&
    error.message.includes(`"${ROUTE_PATH}"`)
  )
}

/** Best-effort warning; a logging failure must never fail a mount. */
function warnDuplicateMount(ctx) {
  if (globalThis[DUPLICATE_WARNED] === true) return
  globalThis[DUPLICATE_WARNED] = true
  try {
    ctx.logger?.warn?.(
      'session-titler: this plugin is mounted from more than one loader source; keeping one propose route. Remove one of the two installs (the market copy or the profile bundle row).',
    )
  } catch {
    // A missing or throwing logger changes nothing about the route.
  }
}

/**
 * Mount the one proposal route, tolerating a second mount of this same plugin.
 *
 * The newest mount owns the path: the previous mount's registration is
 * released first, so its later disposer cannot delete the successor's route.
 * The webserver disposer removes routes by path rather than by identity, which
 * is exactly why that ownership check has to live in the returned disposer.
 *
 * @param {object} ctx - host context providing `webServer`.
 * @param {Function} handler - the route handler of this mount.
 * @returns {() => void} effect disposer for the calling fiber.
 */
function mountRoute(ctx, handler) {
  const prior = globalThis[ROUTE_HANDLE]
  if (typeof prior === 'function') {
    globalThis[ROUTE_HANDLE] = undefined
    try {
      prior()
    } catch {
      // The previous registration was already released.
    }
    warnDuplicateMount(ctx)
  }

  let dispose
  try {
    dispose = ctx.webServer.register({ kind: 'exact', path: ROUTE_PATH, handler })
  } catch (error) {
    if (!isOwnDuplicateRoute(error)) throw error
    // A route this plugin never recorded already serves the path; leave it
    // alone rather than failing the entry that is being mounted now.
    warnDuplicateMount(ctx)
    return () => {}
  }

  globalThis[ROUTE_HANDLE] = dispose
  return () => {
    // Ownership moved to a newer mount: deleting by path now would take the
    // successor's route down with it.
    if (globalThis[ROUTE_HANDLE] !== dispose) return
    globalThis[ROUTE_HANDLE] = undefined
    dispose()
  }
}

/** Write one JSON response. */
function writeJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload, 'utf8'),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/** Write the success envelope. */
function writeOk(res, value) {
  writeJson(res, 200, { ok: true, value })
}

/** Write the failure envelope, with any machine-readable details of the error. */
function writeError(res, status, code, message, details) {
  writeJson(res, status, { ok: false, error: { code, message, ...(details ?? {}) } })
}

/**
 * Read and parse the bounded JSON request body.
 *
 * @throws {TitlerError} `too-large` past the ceiling, `bad-request` when malformed.
 */
async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    total += buffer.length
    if (total > POLICY.maxBodyBytes) {
      throw new TitlerError('too-large', 413, 'request body too large')
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new TitlerError('bad-request', 400, 'request body is not valid JSON')
  }
}

/**
 * Host plugin body: register the one fenced proposal route.
 *
 * @param {object} ctx - host context providing `webServer` and the titling services.
 */
export function apply(ctx) {
  // `webRuntime` owns the deployment's non-loopback trusted authorities. It is
  // absent in some compositions, where the fence then accepts loopback only.
  // Resolved per request and never allowed to throw: a fence that fails must
  // fall back to loopback-only, not take the whole handler down.
  const trustedHosts = () => {
    try {
      const hosts = ctx.get('webRuntime')?.trustedHosts
      return Array.isArray(hosts) ? hosts : []
    } catch {
      return []
    }
  }

  const handler = async (req, res) => {
    if (!isTrustedApiRequest(req, trustedHosts())) {
      writeError(res, 403, 'forbidden', 'this route serves loopback or trusted hosts only')
      return
    }
    if (req.method !== 'POST') {
      writeError(res, 405, 'method-error', 'POST only')
      return
    }

    let payload
    try {
      payload = await readJsonBody(req)
    } catch (error) {
      if (error instanceof TitlerError) writeError(res, error.status, error.code, error.message)
      else writeError(res, 400, 'bad-request', messageOf(error))
      return
    }

    const sessionId = payload?.sessionId
    if (typeof sessionId !== 'string' || sessionId.trim() === '') {
      writeError(res, 400, 'bad-request', 'sessionId must be a non-empty string')
      return
    }

    // A closed connection cancels the model call instead of leaving it running.
    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })

    try {
      const value = await proposeTitle(ctx, sessionId.trim(), controller.signal)
      if (res.writableEnded) return
      writeOk(res, value)
    } catch (error) {
      if (res.writableEnded || controller.signal.aborted) return
      if (error instanceof TitlerError) writeError(res, error.status, error.code, error.message, error.details)
      else writeError(res, 500, 'internal', messageOf(error))
    }
  }

  ctx.effect(
    () => mountRoute(ctx, handler),
    'session-titler: propose route',
  )
}
