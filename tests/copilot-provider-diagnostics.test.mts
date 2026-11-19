import assert from 'node:assert/strict'
import test from 'node:test'
import { askOpenAIOnce } from '../src/lib/copilot-openai.ts'

async function isolated(run: (logs: string[]) => Promise<void>) {
  const key = process.env.COPILOT_OPENAI_API_KEY
  const fetch = globalThis.fetch, warn = console.warn
  const logs: string[] = []
  process.env.COPILOT_OPENAI_API_KEY = 'synthetic-secret-never-log'
  console.warn = (...args) => { logs.push(args.map(String).join(' ')) }
  try { await run(logs) } finally {
    globalThis.fetch = fetch; console.warn = warn
    if (key === undefined) delete process.env.COPILOT_OPENAI_API_KEY
    else process.env.COPILOT_OPENAI_API_KEY = key
  }
}

test('provider failures log safe classifications without response messages, prompts or credentials', () => isolated(async logs => {
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    return Response.json({ error: { code: 'insufficient_quota', message: 'private-account-and-prompt' } }, { status: 429 })
  }
  await assert.rejects(() => askOpenAIOnce('private-user-prompt'), (e: Error) => e.message === 'provider_failed')
  assert.equal(calls, 1)
  assert.deepEqual(JSON.parse(logs[0]), { event: 'copilot_provider_failure', provider: 'openai',
    kind: 'provider_failed', reason: 'http_error', http_status: 429, provider_code: 'insufficient_quota' })
  assert.doesNotMatch(logs.join(' '), /private|synthetic-secret/)
}))

test('unknown provider codes and non-JSON failure bodies never enter logs or cause a second request', () => isolated(async logs => {
  let calls = 0
  for (const response of [Response.json({ error: { code: 'private-customer-reference', message: 'private-message' } }, { status: 400 }),
    new Response('private-proxy-response', { status: 502 })]) {
    globalThis.fetch = async () => { calls++; return response }
    await assert.rejects(() => askOpenAIOnce('private-prompt'))
  }
  assert.equal(calls, 2)
  assert.equal(logs.length, 2)
  assert.ok(logs.every(x => JSON.parse(x).provider_code === 'other'))
  assert.doesNotMatch(logs.join(' '), /private|synthetic-secret/)
}))

test('output budget exhaustion is distinguishable from transport uncertainty without accepting partial output', () => isolated(async logs => {
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    return Response.json({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'private-partial-output' }] }] })
  }
  await assert.rejects(() => askOpenAIOnce('private-prompt', true), (e: Error) => e.message === 'provider_failed')
  assert.equal(JSON.parse(logs[0]).reason, 'output_limit')
  globalThis.fetch = async () => { calls++; throw new Error('private-transport-context') }
  await assert.rejects(() => askOpenAIOnce('private-prompt'), (e: Error) => e.message === 'uncertain')
  assert.deepEqual(JSON.parse(logs[1]), { event: 'copilot_provider_failure', provider: 'openai', kind: 'uncertain', reason: 'transport' })
  assert.equal(calls, 2)
  assert.doesNotMatch(logs.join(' '), /private|synthetic-secret/)
}))
