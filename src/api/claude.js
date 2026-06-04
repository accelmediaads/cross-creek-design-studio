// Frontend wrapper around our /api/claude proxy.
//
// The proxy adds the server-side ANTHROPIC_API_KEY and forwards to Anthropic.
// All we do here is build the same message bodies the old code used to build,
// then POST them to the proxy with the user's Supabase access token.

import { CLAUDE_SYSTEM_PROMPT } from '../prompts/systemPrompt.js'
import { getAccessToken } from './supabase.js'

const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514'

async function callClaude(body) {
  const token = await getAccessToken()
  if (!token) throw new Error('Not signed in')

  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || err.error || `Claude proxy error: ${response.status}`)
  }
  const data = await response.json()
  return data.content[0].text
}

/**
 * Ask Claude to generate an optimized Nano Banana Pro prompt based on project details.
 */
export async function generateDesignPrompt({
  photoCount,
  hasTopoMap,
  style,
  features,
  budget,
  materials,
  lighting,
  notes,
  designBrief,  // for multi-angle consistency
  angleIndex,   // which angle we're generating (0-based)
}) {
  let userMessage = `The attached photo(s) show a REAL property in North Idaho. The AI model will receive these photos as reference. Your prompt MUST instruct the model to keep the exact same house, camera angle, and scene orientation — only redesigning the landscape/hardscape/outdoor living areas.

Project Details:
- Number of site photos attached: ${photoCount}
- Topography map included: ${hasTopoMap ? 'Yes' : 'No'}
- Design style: ${style}
- Features requested: ${features.join(', ')}
- Investment range: ${budget}
- Materials: ${materials.join(', ')}${(materials || []).some(m => m.toLowerCase().includes('paver')) ? ' (IMPORTANT: Cross Creek exclusively uses Belgard pavers — specify Belgard by name)' : ''}
- Time of day / lighting: ${lighting}
${notes ? `- Client notes: ${notes}` : ''}`

  if (designBrief && angleIndex > 0) {
    userMessage += `

IMPORTANT — MULTI-ANGLE CONSISTENCY:
This is angle #${angleIndex + 1} of the same property. The design has already been established. Here is the design brief from the first generation:

${designBrief}

You MUST write a prompt that shows the SAME design from this new camera angle. Same materials, same features, same layout, same style. The viewer is simply looking at the same property from a different vantage point.`
  }

  return callClaude({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: CLAUDE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })
}

/**
 * Ask Claude to write a revision prompt for Nano Banana Pro.
 */
export async function generateRevisionPrompt(revisionText) {
  const userMessage = `Write a Nano Banana Pro prompt for revising an existing AI-generated landscape design image.

The user wants these changes: "${revisionText}"

Write the prompt using this pattern:
- Start with: "Using the attached image as the base design."
- Specify ONLY the requested changes
- Explicitly instruct to preserve everything else exactly as shown — same camera angle, same lighting, same style, same materials, same layout
- Instruct to only modify what was specifically requested
- Instruct not to add any elements not requested and not to remove any elements not mentioned
- Include: deep focus, photorealistic quality, natural lighting, realistic materials
- Include: no people, no vehicles, no animals
- Keep under 1500 characters

Output ONLY the prompt text.`

  return callClaude({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: CLAUDE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })
}

/**
 * Ask Claude to generate a design brief from the first generated image description.
 */
export async function generateDesignBrief(prompt, preferences) {
  const userMessage = `Based on this landscape design prompt and the client preferences, write a detailed "design brief" that describes the specific design choices made. This brief will be used to maintain consistency when generating views from other angles of the same property.

The prompt that was used:
${prompt}

Client preferences:
- Style: ${preferences.style}
- Features: ${preferences.features.join(', ')}
- Materials: ${preferences.materials.join(', ')}
- Budget: ${preferences.budget}

Write a 3-5 sentence design brief describing:
1. The specific layout of features (e.g., "fire pit positioned in the northwest corner")
2. The specific materials used (e.g., "natural flagstone pavers with charcoal grout")
3. The planting scheme (e.g., "ornamental grasses along the perimeter, Japanese maple as focal point")
4. The overall composition and flow of the outdoor space

Be specific enough that another prompt could recreate this exact design from a different angle. Output ONLY the brief text.`

  return callClaude({
    model: ANTHROPIC_MODEL,
    max_tokens: 512,
    messages: [{ role: 'user', content: userMessage }],
  })
}
