// Frontend wrapper around our /api/claude proxy.
//
// The proxy adds the server-side ANTHROPIC_API_KEY and forwards to Anthropic.
// All we do here is build the same message bodies the old code used to build,
// then POST them to the proxy with the user's Supabase access token.

import { CLAUDE_SYSTEM_PROMPT } from '../prompts/systemPrompt.js'
import { getAccessToken } from './supabase.js'

// claude-sonnet-4-20250514 was deprecated and returned 404 'not_found_error'
// on June 16, 2026. claude-sonnet-4-6 is the current Sonnet ID — same model
// family, gets the latest non-dated snapshot. Aliases like this don't go
// stale the same way dated snapshots do, so we should ride it.
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'

/**
 * Build a small bullet roster describing each image attached to the prompt,
 * in the same order Gemini receives them. Helps Claude write prompts that
 * call out each reference correctly.
 */
function buildImageRoster({ photoCount, hasTopoMap, sketchCount }) {
  const lines = ['Image roster (in this order):']
  let idx = 1
  lines.push(`- Image ${idx++}: ACTUAL SITE PHOTOGRAPH — the real property. Preserve house, terrain, sky, camera angle exactly. Only the landscape/hardscape gets redesigned.`)
  if (hasTopoMap) {
    lines.push(`- Image ${idx++}: TOPOGRAPHY MAP — use only as a reference for grade and layout. Do NOT render it into the final image.`)
  }
  for (let i = 0; i < sketchCount; i++) {
    lines.push(`- Image ${idx++}: REFERENCE SKETCH ${i + 1} — hand-drawn concept showing the desired layout/features. Use as DESIGN INSPIRATION only; the output must be photoreal, not stylized like the sketch.`)
  }
  return lines.join('\n')
}

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
  sketchCount = 0,  // hand-drawn concept references (treat as inspiration, NOT literal style)
  style,
  features,
  budget,
  materials,
  lighting,
  notes,
  designBrief,  // for multi-angle consistency
  angleIndex,   // which angle we're generating (0-based)
}) {
  // Build the image-roster description so the model knows what each attached
  // image represents. Order matches what we send to Gemini:
  //   Image 1 = the actual site photograph (preserve property exactly)
  //   Image 2..N = optional topo map and/or reference sketches.
  const imageRoster = buildImageRoster({ photoCount: 1, hasTopoMap, sketchCount })

  let userMessage = `The attached photo(s) show a REAL property in North Idaho. The AI model will receive these photos as reference. Your prompt MUST instruct the model to keep the exact same house, camera angle, and scene orientation — only redesigning the landscape/hardscape/outdoor living areas.

${imageRoster}

Project Details:
- Topography map included: ${hasTopoMap ? 'Yes' : 'No'}
- Reference sketches included: ${sketchCount > 0 ? `Yes (${sketchCount})` : 'No'}
- Design style: ${style}
- Features requested: ${features.join(', ')}
- Investment range: ${budget}
- Materials: ${materials.join(', ')}${(materials || []).some(m => m.toLowerCase().includes('paver')) ? ' (IMPORTANT: Cross Creek exclusively uses Belgard pavers — specify Belgard by name)' : ''}
- Time of day / lighting: ${lighting}
${notes ? `- Client notes: ${notes}` : ''}`

  if (sketchCount > 0) {
    userMessage += `

CRITICAL — Reference sketches:
The reference sketch(es) are HAND-DRAWN concept images showing what the designer envisions. Your prompt MUST instruct the model to:
- Use the sketches ONLY as design inspiration (layout, features, vibe, placement)
- NOT to mimic the cartoonish / hand-drawn quality of the sketches
- The OUTPUT must be photorealistic, matching the real property in Image 1
- Translate the sketch's design ideas into real materials, real plantings, and real outdoor structures appropriate for the property and the client's chosen style/materials`
  }

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
 * Ask Claude to write a revision prompt for Nano Banana Pro that interprets
 * Apple Pencil annotations drawn on an existing design.
 *
 * The flattened composite (original design + red/cream/black pencil strokes)
 * is the single image input to Gemini. The prompt must tell Gemini that the
 * strokes are NOT design elements — they're annotation marking up where
 * changes are wanted.
 */
export async function generatePencilRevisionPrompt(captionText) {
  const userMessage = `Write a Nano Banana Pro prompt for revising a landscape design image that has been MARKED UP with Apple Pencil annotations.

The annotations are colored pencil strokes (red, cream, or black). They are NOT part of the design — they are HUMAN ANNOTATIONS indicating where and how the design should change. The homeowner's designer drew them in to communicate revisions.

The designer's caption explaining the requested changes:
"${captionText}"

Write a prompt that instructs the model to:
- Use the image as the base design
- IGNORE the pencil annotations as visual elements — do NOT render any pencil strokes in the output
- INTERPRET the location and shape of the annotations as indicators of WHERE and WHAT changes are wanted
- Apply the requested changes per the caption above
- Preserve everything else exactly — same camera angle, same lighting, same style, same materials, same overall layout outside the annotated areas
- Output must be photorealistic, no people/vehicles/animals
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
 * Ask Claude to generate THREE prompt variations for the very first generation
 * on a project. All three hew to the same chosen STYLE, but explore different
 * interpretations within that style — e.g. one emphasizes layout / spatial
 * composition, one leans softscape (plant choices), one leans hardscape /
 * focal-point materials. Goal: three options that feel like real alternatives
 * the homeowner can pick from, not three random takes.
 *
 * Returns: { variations: [string, string, string], labels: [string, string, string] }
 */
export async function generateThreeDesignPromptVariations({
  photoCount,
  hasTopoMap,
  sketchCount = 0,
  style,
  features,
  budget,
  materials,
  lighting,
  notes,
}) {
  const userMessage = `You are writing THREE distinct Nano Banana Pro prompt variations for the same property's first design generation. The client has already chosen their style and features (below). Your job is to produce three different INTERPRETATIONS within that style — not three different styles.

Project Details:
- Number of site photos: ${photoCount}
- Topography map included: ${hasTopoMap ? 'Yes' : 'No'}
- Reference sketches: ${sketchCount > 0 ? `Yes (${sketchCount})` : 'No'}
- Design style: ${style}
- Features requested: ${features.join(', ')}
- Investment range: ${budget}
- Materials: ${materials.join(', ')}${(materials || []).some(m => m.toLowerCase().includes('paver')) ? ' (IMPORTANT: Cross Creek exclusively uses Belgard pavers — specify Belgard by name)' : ''}
- Time of day / lighting: ${lighting}
${notes ? `- Client notes: ${notes}` : ''}

Image roster (in this order):
- Image 1: ACTUAL SITE PHOTOGRAPH — the real property. Preserve house, terrain, sky, camera angle exactly. Only the landscape/hardscape gets redesigned.
${hasTopoMap ? '- Image 2: TOPOGRAPHY MAP — reference for grade and layout only; do NOT render it into the final image.\n' : ''}${sketchCount > 0 ? `- Image ${hasTopoMap ? 3 : 2}+: REFERENCE SKETCHES — hand-drawn concept(s). Use as DESIGN INSPIRATION only; output must be photoreal.\n` : ''}

Design the three variations to be MEANINGFULLY different:
- VARIATION A: Layout-forward. Optimize spatial composition, traffic flow, sight lines, zone definition. Furniture & feature placement is the hero.
- VARIATION B: Softscape-forward. Plant palette is the hero. Specific species, layering, color and texture variety. Hardscape is sympathetic but quieter.
- VARIATION C: Hardscape-forward. Materials and architectural features are the hero. Distinctive walls, paving patterns, water/fire features. Plantings frame the hardscape.

All three must respect the chosen style "${style}" — they're three valid takes on that style, not three styles.

Output FORMAT (strict — I will parse this):

<variation_a>
[Full Nano Banana Pro prompt for Variation A. Same constraints as a regular design prompt: photoreal, preserve the actual house/terrain, no people/vehicles/animals, ~1200-1500 chars.]
</variation_a>

<variation_b>
[Full prompt for Variation B.]
</variation_b>

<variation_c>
[Full prompt for Variation C.]
</variation_c>

Output ONLY the three tagged sections — no commentary, no preamble.`

  const text = await callClaude({
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    system: CLAUDE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  // Parse the three variations
  const variations = []
  const labels = ['Layout-forward', 'Softscape-forward', 'Hardscape-forward']
  for (const tag of ['variation_a', 'variation_b', 'variation_c']) {
    const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))
    if (!m) {
      throw new Error(`Claude didn't return a valid ${tag} block — try again`)
    }
    variations.push(m[1].trim())
  }

  return { variations, labels }
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
