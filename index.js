/**
 * Host half of dsh-session-titler.
 *
 * Registers one fenced, read-only HTTP route that proposes a whole-session
 * title. The Client half shows the proposal, the user confirms it, and the
 * shipped rename path writes the durable `session/title` event. This plugin
 * never appends session events itself, so the session log stays the single
 * source of truth and nothing is written before the user agrees.
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
    () => ctx.webServer.register({ kind: 'exact', path: ROUTE_PATH, handler }),
    'session-titler: propose route',
  )
}
