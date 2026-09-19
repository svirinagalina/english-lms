// One door to the language model: OpenAI when OPENAI_API_KEY is set,
// otherwise Claude when ANTHROPIC_API_KEY is set. Every feature asks for a
// structured answer (a zod schema), so switching providers changes nothing else.

export const llmEnabled = () => Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY)
export const llmProvider = () => (process.env.OPENAI_API_KEY ? 'openai' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : null)

const OPENAI_MODEL = () => process.env.OPENAI_MODEL || 'gpt-5.5'
const ANTHROPIC_MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-opus-5'

let openai = null
let anthropic = null

// Returns the parsed object matching `schema`, or null.
export async function structured({ system, user, schema, name = 'result', maxTokens = 3000 }) {
  const provider = llmProvider()
  if (!provider) throw new Error('No AI key is configured')

  if (provider === 'openai') {
    const { default: OpenAI } = await import('openai')
    const { zodTextFormat } = await import('openai/helpers/zod')
    openai ??= new OpenAI()
    const response = await openai.responses.parse({
      model: OPENAI_MODEL(),
      instructions: system,
      input: user,
      max_output_tokens: maxTokens,
      text: { format: zodTextFormat(schema, name) }
    })
    return response.output_parsed ?? null
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod')
  anthropic ??= new Anthropic()
  const response = await anthropic.messages.parse({
    model: ANTHROPIC_MODEL(),
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { format: zodOutputFormat(schema) }
  })
  return response.parsed_output ?? null
}
