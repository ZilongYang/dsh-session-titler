/**
 * Mount-idempotency tests of the Host half.
 *
 * They cover the defect that failed the entry on DSH 0.2.1-alpha.2..alpha.4: a
 * deployment can mount this package from two loader sources at once (a market
 * hot mount beside the profile's bundle row, or an HMR profile-patch reload
 * re-applying the same row), and the webserver refuses a duplicate
 * `(kind, path)` registration. `apply()` must therefore take the route over
 * instead of colliding, and an older fiber's disposer must never delete the
 * successor's route.
 *
 * @module dsh-session-titler/test/host
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { apply } from '../index.js'

const ROUTE_PATH = '/session-titler/propose'
const ROUTE_HANDLE = Symbol.for('dsh-session-titler/propose-route')
const DUPLICATE_WARNED = Symbol.for('dsh-session-titler/duplicate-mount-warned')

/** Forget process-wide mount state so one case cannot leak into the next. */
function resetMountState() {
  delete globalThis[ROUTE_HANDLE]
  delete globalThis[DUPLICATE_WARNED]
}

/** One webserver double with the shipped register/dispose semantics. */
function webServerDouble() {
  const routes = new Map()
  const registrations = []
  return {
    routes,
    registrations,
    register(route) {
      if (routes.has(route.path)) {
        throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`)
      }
      routes.set(route.path, route)
      registrations.push(route)
      return () => {
        routes.delete(route.path)
      }
    },
  }
}

/** One host context double that records the disposers of its effects. */
function hostContext({ webServer, warnings = [], services = {} } = {}) {
  const disposers = []
  return {
    disposers,
    logger: { warn: (message) => warnings.push(message) },
    webServer,
    ...services,
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') disposers.push(dispose)
      return () => {}
    },
    get: (key) => (key === 'agentDefaultModel' ? { currentSelection: () => ({ provider: 'p', model: 'm' }) } : undefined),
  }
}

/** A model stream answering one title. */
async function* titleStream() {
  yield { type: 'text-delta', text: 'A mounted title' }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

/** The services `proposeTitle` reads, so the mounted route can serve. */
function titlingServices() {
  return {
    sessions: { get: () => undefined },
    sessionQuery: {
      readSurface: async () => ({
        events: [{ type: 'user/message', data: { content: [{ type: 'text', text: 'summarize me' }] } }],
      }),
      readSession: async () => ({ events: [] }),
    },
    llm: {
      listProviders: () => [{ id: 'p' }],
      stream: titleStream,
    },
  }
}

/** One node request double carrying a JSON body. */
function request(body) {
  return {
    method: 'POST',
    headers: { host: '127.0.0.1:4321', 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body), 'utf8')
    },
    on() {},
  }
}

/** One node response double capturing the written body. */
function response() {
  const chunks = []
  return {
    status: 0,
    writableEnded: false,
    writeHead(status) {
      this.status = status
    },
    end(payload) {
      this.writableEnded = true
      if (payload !== undefined) chunks.push(Buffer.from(payload))
    },
    on() {},
    text() {
      return Buffer.concat(chunks).toString('utf8')
    },
  }
}

test('a second mount takes the route over instead of failing the entry', () => {
  resetMountState()
  const webServer = webServerDouble()
  const warnings = []
  apply(hostContext({ webServer, warnings }))
  apply(hostContext({ webServer, warnings }))

  assert.equal(webServer.registrations.length, 2)
  assert.equal(webServer.routes.size, 1)
  assert.equal(webServer.routes.get(ROUTE_PATH), webServer.registrations[1])
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /more than one loader source/u)
})

test('an older fiber never deletes the successor route', () => {
  resetMountState()
  const webServer = webServerDouble()
  const first = hostContext({ webServer })
  const second = hostContext({ webServer })
  apply(first)
  apply(second)

  first.disposers[0]()
  assert.equal(webServer.routes.size, 1)
  assert.equal(webServer.routes.get(ROUTE_PATH), webServer.registrations[1])

  second.disposers[0]()
  assert.equal(webServer.routes.size, 0)
})

test('a single mount removes its own route on unload', () => {
  resetMountState()
  const webServer = webServerDouble()
  const ctx = hostContext({ webServer })
  apply(ctx)
  assert.equal(webServer.routes.size, 1)
  ctx.disposers[0]()
  assert.equal(webServer.routes.size, 0)
})

test('every unrelated registration failure still reaches the entry', () => {
  resetMountState()
  const webServer = {
    register() {
      throw new Error('webserver: fallback already registered')
    },
  }
  assert.throws(() => apply(hostContext({ webServer })), /fallback already registered/u)
})

test('a foreign registration on the same path is left alone, not stolen', () => {
  resetMountState()
  const webServer = webServerDouble()
  const foreign = () => {}
  webServer.register({ kind: 'exact', path: ROUTE_PATH, handler: foreign })
  const warnings = []
  apply(hostContext({ webServer, warnings }))

  assert.equal(webServer.routes.size, 1)
  assert.equal(webServer.routes.get(ROUTE_PATH).handler, foreign)
  assert.equal(warnings.length, 1)
})

test('the surviving route still answers a proposal after a duplicate mount', async () => {
  resetMountState()
  const webServer = webServerDouble()
  apply(hostContext({ webServer, services: titlingServices() }))
  apply(hostContext({ webServer, services: titlingServices() }))

  const res = response()
  await webServer.routes.get(ROUTE_PATH).handler(request({ sessionId: 'session-1' }), res)

  assert.equal(res.status, 200)
  const body = JSON.parse(res.text())
  assert.equal(body.ok, true)
  assert.equal(body.value.title, 'A mounted title')
})
