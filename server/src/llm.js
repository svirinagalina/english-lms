// One door to the language model: OpenAI, Grok (xAI), DeepSeek or Claude, whichever key is
// configured (in the environment, or saved from the Settings page). Every
// feature asks for a structured answer (a zod schema), so the provider is
// interchangeable.
import { aiConfig } from './settings.js'

export const llmEnabled = () => Boolean(aiConfig())
export const llmProvider = () => aiConfig()?.provider ?? null

const DEFAULT_MODEL = { openai: 'gpt-5.5', anthropic: 'claude-opus-5', deepseek: 'deepseek-chat' }
const BASE_URL = { xai: 'https://api.x.ai/v1', deepseek: 'https://api.deepseek.com' }

const clients = new Map() // provider+key → client

// Grok model names change often; without one set in Settings, the newest
// general Grok text model the key can use is picked (once per process).
let xaiModelPromise = null
function xaiModel(client) {
  xaiModelPromise ??= client.models.list().then((page) => {
    const ids = (page.data ?? []).map((m) => m.id).filter((id) => /^grok-\d/.test(id) && !/image|vision|imagine|video|code|mini/.test(id))
    const version = (id) => id.match(/^grok-(\d+(?:\.\d+)?)/)?.[1] ?? '0'
    ids.sort((a, b) => Number(version(b)) - Number(version(a)) || a.length - b.length)
    return ids[0] ?? 'grok-4'
  }).catch((err) => { xaiModelPromise = null; throw err })
  return xaiModelPromise
}

async function clientFor(config) {
  const id = `${config.provider}:${config.key.slice(-8)}`
  if (clients.has(id)) return clients.get(id)
  let client
  if (config.provider === 'openai') {
    const { default: OpenAI } = await import('openai')
    client = new OpenAI({ apiKey: config.key })
  } else if (BASE_URL[config.provider]) {
    // xAI and DeepSeek speak the OpenAI protocol at their own address.
    const { default: OpenAI } = await import('openai')
    client = new OpenAI({ apiKey: config.key, baseURL: BASE_URL[config.provider] })
  } else {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    client = new Anthropic({ apiKey: config.key })
  }
  clients.set(id, client)
  return client
}

// Returns the parsed object matching `schema`, or null.
// `effort` ('low' | 'medium' | 'high') asks an OpenAI reasoning model to
// think less for quick yes/no checks; the token cap has to leave room for
// that thinking too, or the answer comes back empty.
export async function structured({ system, user, schema, name = 'result', maxTokens = 3000, effort }) {
  const config = aiConfig()
  if (!config) throw new Error('No AI key is configured')
  const client = await clientFor(config)
  const model = config.model || (config.provider === 'xai' ? await xaiModel(client) : DEFAULT_MODEL[config.provider])

  if (config.provider === 'deepseek') {
    // DeepSeek has JSON mode but no schema enforcement: the schema goes into
    // the instructions and the reply is checked with zod.
    const { zodResponseFormat } = await import('openai/helpers/zod')
    const jsonSchema = zodResponseFormat(schema, name).json_schema.schema
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: `${system}\n\nReply with one JSON object only, matching this JSON schema:\n${JSON.stringify(jsonSchema)}` },
        { role: 'user', content: user }
      ],
      max_tokens: Math.min(maxTokens, 8000),
      response_format: { type: 'json_object' }
    })
    try {
      const result = schema.safeParse(JSON.parse(completion.choices[0]?.message?.content ?? ''))
      return result.success ? result.data : null
    } catch { return null }
  }

  if (config.provider === 'xai') {
    const { zodResponseFormat } = await import('openai/helpers/zod')
    const completion = await client.chat.completions.parse({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: maxTokens,
      response_format: zodResponseFormat(schema, name)
    })
    return completion.choices[0]?.message?.parsed ?? null
  }

  if (config.provider === 'openai') {
    const { zodTextFormat } = await import('openai/helpers/zod')
    const response = await client.responses.parse({
      model,
      instructions: system,
      input: user,
      max_output_tokens: maxTokens,
      ...(effort ? { reasoning: { effort } } : {}),
      text: { format: zodTextFormat(schema, name) }
    })
    return response.output_parsed ?? null
  }

  const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod')
  const response = await client.messages.parse({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { format: zodOutputFormat(schema) }
  })
  return response.parsed_output ?? null
}

// A tiny round trip to prove a key works; returns the model's one-word answer.
export async function testConnection() {
  const { z } = await import('zod')
  const out = await structured({
    name: 'ping',
    schema: z.object({ answer: z.string() }),
    maxTokens: 1000,
    effort: 'low',
    system: 'Reply with the single word "ready".',
    user: 'ping'
  })
  return out?.answer ?? ''
}

// Which service a pasted key belongs to: the prefix says it for Claude and
// Grok; a plain "sk-" key can be OpenAI or DeepSeek, so each is asked.
export async function detectProvider(key) {
  if (key.startsWith('sk-ant-')) return 'anthropic'
  if (key.startsWith('xai-')) return 'xai'
  if (!key.startsWith('sk-')) return null
  const { default: OpenAI } = await import('openai')
  for (const provider of ['openai', 'deepseek']) {
    try {
      await new OpenAI({ apiKey: key, baseURL: BASE_URL[provider], timeout: 15000, maxRetries: 0 }).models.list()
      return provider
    } catch (err) {
      if (err?.status && err.status !== 401 && err.status !== 403) return provider // the key is known there, just limited
    }
  }
  return null
}
