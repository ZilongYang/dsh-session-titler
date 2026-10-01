/**
 * Route-resolution tests of dsh-session-titler.
 *
 * They cover the defect that shipped in 0.1.1: the registered-adapter check
 * only guarded cold sessions, while a LIVE session handed its folded header to
 * the model call unvalidated — so a session recorded under a profile that had
 * `opencode-go-new` failed with `no adapter registered for provider` after the
 * app switched to a profile without it.
 *
 * @module dsh-session-titler/test/title
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { TitlerError, proposeTitle, resolveRoute } from '../title.js'

const DEFAULT_SELECTION = { provider: 'deepseek-official', model: 'deepseek-flash' }
const DEAD_ROUTE = { provider: 'opencode-go-new', model: 'deepseek-v4.1-flash' }

/** One `request/header` event in the shape the session log stores. */
function headerEvent(provider, model) {
  return { type: 'request/header', data: { header: { config: { provider, model } } } }
}

/** One user message event, so the framed transcript is never empty. */
function userEvent(text = 'summarize this session') {
  return { type: 'user/message', data: { content: [{ type: 'text', text }] } }
}

/** A model stream that answers one title and ignores its own options. */
async function* titleStream() {
  yield { type: 'text-delta', text: 'A generated title' }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

/** A model stream that records the route it was asked for, then answers. */
function recordingStream(calls) {
  return async function* stream(options) {
    calls.push({ provider: options.provider, model: options.model })
    yield { type: 'text-delta', text: 'A generated title' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/**
 * One host context double.
 *
 * @param {object} [options] - same-named service facts of the fake deployment.
 * @param {object} [options.live] - the live session object, when the id is live.
 * @param {Array} [options.events] - persisted events of `readSession`.
 * @param {Array} [options.surfaceEvents] - events of `readSurface`.
 * @param {string[]|null} [options.providers] - registered provider ids; `null`
 * makes the probe throw, which must degrade to "no filtering".
 * @param {object} [options.defaultSelection] - `agentDefaultModel` selection.
 * @param {Function} [options.stream] - `ctx.llm.stream` implementation.
 */
function context({
  live,
  events = [],
  surfaceEvents = [userEvent()],
  providers = ['deepseek-official'],
  defaultSelection = DEFAULT_SELECTION,
  stream = titleStream,
} = {}) {
  return {
    sessions: { get: () => live },
    sessionQuery: {
      readSurface: async () => ({ events: surfaceEvents }),
      readSession: async () => ({ events }),
    },
    llm: {
      listProviders:
        providers === null
          ? () => {
              throw new Error('llm registry unavailable')
            }
          : () => providers.map((id) => ({ id })),
      stream,
    },
    get: (key) => (key === 'agentDefaultModel' ? { currentSelection: () => defaultSelection } : undefined),
  }
}

test('a live session whose recorded route has no adapter falls back to the default model', async () => {
  const ctx = context({ live: { requestHeader: () => ({ config: { ...DEAD_ROUTE } }) } })
  assert.deepEqual(await resolveRoute(ctx, 'session-1'), DEFAULT_SELECTION)
})

test('a live session keeps its recorded route while that provider has an adapter', async () => {
  const ctx = context({
    live: { requestHeader: () => ({ config: { ...DEAD_ROUTE } }) },
    providers: ['opencode-go-new'],
  })
  assert.deepEqual(await resolveRoute(ctx, 'session-1'), DEAD_ROUTE)
})

test('a live session falls back through the log to an older registered route', async () => {
  const ctx = context({
    live: { requestHeader: () => ({ config: { ...DEAD_ROUTE } }) },
    events: [headerEvent('opencode-go', 'deepseek-flash'), headerEvent('opencode-go-new', 'deepseek-v4.1-flash')],
    providers: ['opencode-go'],
  })
  assert.deepEqual(await resolveRoute(ctx, 'session-1'), {
    provider: 'opencode-go',
    model: 'deepseek-flash',
  })
})

test('a cold log takes the newest header that still has an adapter', async () => {
  const ctx = context({
    events: [headerEvent('opencode-go-new', 'deepseek-flash'), headerEvent('opencode-go', 'deepseek-flash')],
    providers: ['opencode-go'],
  })
  assert.deepEqual(await resolveRoute(ctx, 'session-1'), {
    provider: 'opencode-go',
    model: 'deepseek-flash',
  })
})

test('an unavailable provider list leaves the recorded route untouched', async () => {
  const ctx = context({
    live: { requestHeader: () => ({ config: { ...DEAD_ROUTE } }) },
    providers: null,
  })
  assert.deepEqual(await resolveRoute(ctx, 'session-1'), DEAD_ROUTE)
})

test('no dispatchable candidate resolves to undefined', async () => {
  const ctx = context({
    live: { requestHeader: () => ({ config: { ...DEAD_ROUTE } }) },
    defaultSelection: { provider: 'also-gone', model: 'someone-elses-flash' },
  })
  assert.equal(await resolveRoute(ctx, 'session-1'), undefined)
})

test('proposeTitle answers with the fallback model and reports the fallback', async () => {
  const calls = []
  const ctx = context({
    live: { requestHeader: () => ({ config: { ...DEAD_ROUTE } }) },
    stream: recordingStream(calls),
  })
  const value = await proposeTitle(ctx, 'session-1')
  assert.equal(value.title, 'A generated title')
  assert.deepEqual(calls, [DEFAULT_SELECTION])
  assert.equal(value.fallback, true)
  assert.equal(value.provider, 'deepseek-official')
  assert.equal(value.model, 'deepseek-flash')
})

test('proposeTitle keeps the recorded route and does not mark a fallback', async () => {
  const calls = []
  const ctx = context({
    live: { requestHeader: () => ({ config: { ...DEAD_ROUTE } }) },
    providers: ['opencode-go-new'],
    stream: recordingStream(calls),
  })
  const value = await proposeTitle(ctx, 'session-1')
  assert.deepEqual(calls, [DEAD_ROUTE])
  assert.equal(value.fallback, false)
})

test('proposeTitle reports no-adapter with the offending route when nothing is dispatchable', async () => {
  const ctx = context({
    live: { requestHeader: () => ({ config: { ...DEAD_ROUTE } }) },
    defaultSelection: { provider: 'also-gone', model: 'someone-elses-flash' },
  })
  await assert.rejects(proposeTitle(ctx, 'session-1'), (error) => {
    assert.ok(error instanceof TitlerError)
    assert.equal(error.code, 'no-adapter')
    assert.equal(error.status, 502)
    assert.deepEqual(error.details, { route: 'opencode-go-new/deepseek-v4.1-flash' })
    return true
  })
})

test('proposeTitle maps a stream NO_ADAPTER finish to the actionable code', async () => {
  async function* stream() {
    yield {
      type: 'finish',
      reason: {
        kind: 'error',
        failure: { code: 'NO_ADAPTER', message: 'no adapter registered for provider "opencode-go-new"' },
      },
    }
  }
  const ctx = context({
    live: { requestHeader: () => ({ config: { ...DEAD_ROUTE } }) },
    providers: ['opencode-go-new'],
    stream,
  })
  await assert.rejects(proposeTitle(ctx, 'session-1'), (error) => {
    assert.equal(error.code, 'no-adapter')
    assert.deepEqual(error.details, { route: 'opencode-go-new/deepseek-v4.1-flash' })
    return true
  })
})

test('a session with nothing to summarize still reports no-content', async () => {
  const ctx = context({ surfaceEvents: [] })
  await assert.rejects(proposeTitle(ctx, 'session-1'), (error) => {
    assert.equal(error.code, 'no-content')
    assert.equal(error.status, 409)
    return true
  })
})
