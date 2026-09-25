// One door to the language model: OpenAI or Claude, whichever key is
// configured (in the environment, or saved from the Settings page). Every
// feature asks for a structured answer (a zod schema), so the provider is
// interchangeable.
import { aiConfig } from './settings.js'

export const llmEnabled = () => Boolean(aiConfig())
export const llmProvider = () => aiConfig()?.provider ?? null

const DEFAULT_MODEL = { openai: 'gpt-5.5', anthropic: 'claude-opus-5' }

const clients = new Map() // provider+key → client

async function clientFor(config) {
  const id = `${config.provider}:${config.key.slice(-8)}`
  if (clients.has(id)) return clients.get(id)
  let client
  if (config.provider === 'openai') {
    const { default: OpenAI } = await import('openai')
    client = new OpenAI({ apiKey: config.key })
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
  const model = config.model || DEFAULT_MODEL[config.provider]
  const client = await clientFor(config)

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
