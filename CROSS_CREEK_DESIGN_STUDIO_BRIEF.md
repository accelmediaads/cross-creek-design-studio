# Cross Creek AI Design Studio — Project Brief for Claude Code

## What This Is

An iPad-optimized web app for Randy McCabe at Cross Creek Landscaping (Coeur d'Alene, Idaho). Randy takes drone photos of a client's property, walks through a preference questionnaire with the homeowner on-site, and the app generates photorealistic AI landscape design concepts in real time.

## The Two-API Pipeline

This is the critical architecture decision. Two AI models work in sequence:

### Step 1: Claude (Anthropic API) — The Prompt Engineer
- Receives: all client preferences, site notes, number of photos, whether topo map is included
- Produces: a custom, highly-optimized Nano Banana Pro prompt tailored to this specific project
- Why: A static template prompt produces mediocre results. Claude writes prompts the way a skilled prompt engineer would — with specific material callouts, lighting instructions, composition preservation language, and guardrails against common AI failures (adding structures, shallow depth of field, etc.)
- Model: `claude-sonnet-4-20250514`
- Cost: ~$0.01-0.03 per prompt generation

### Step 2: Nano Banana Pro (Google Gemini API) — The Image Generator
- Receives: Claude's custom prompt + the drone photos + topo map (if provided)
- Produces: photorealistic landscape design concept image
- Model: `gemini-3-pro-image-preview` (this IS Nano Banana Pro)
- API endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent`
- Must set `generationConfig.responseModalities: ["TEXT", "IMAGE"]`
- Cost: ~$0.134 per image at 1K resolution

### API Keys
The app needs two API keys:
- Anthropic API key (for Claude prompt engineering)
- Google AI Studio API key (for Nano Banana Pro image generation)

Both should be entered once via a settings screen and stored in the browser's in-memory state (NOT localStorage — localStorage doesn't work in Claude artifacts, but this is a standalone deployed app so localStorage IS fine here). Persist keys across sessions so Randy doesn't re-enter them every time.

## App Flow — Step by Step

### Screen 1: Site Photos
- Upload multiple drone photos and ground-level shots from iPad camera roll
- Support multiple angles — this is important for consistency (see Consistency section below)
- Show thumbnail grid with ability to remove individual photos
- Accept: image/* (JPG, PNG, HEIC)
- Convert all to base64 for API transmission
- REQUIRED: At least 1 photo to proceed

### Screen 2: Topography Map
- Upload a single top-down site map (orthographic view from FARO Scene, survey plat, or any overhead image)
- OPTIONAL — can skip this step
- When included, the prompt tells Nano Banana to use it for understanding elevation, property boundaries, and existing features

### Screen 3: Client Preferences (The Questionnaire)
Randy walks through this WITH the homeowner on the iPad. Make the UI large, tappable, visually clean — this is client-facing.

**Style** (single select):
- Modern/Contemporary
- Craftsman/Rustic
- Mediterranean
- Pacific Northwest Natural
- Desert/Xeriscape
- Traditional/Classic

**Features** (multi-select):
- Fire Pit
- Outdoor Kitchen
- Water Feature
- Pergola/Covered Patio
- Pool/Spa
- Putting Green
- Retaining Walls
- Landscape Lighting
- Built-in Seating
- Outdoor Fireplace
- Sport Court
- Garden Beds

**Investment Range** (single select):
- $25K–$50K
- $50K–$100K
- $100K–$200K
- $200K–$400K
- $400K+

**Materials** (multi-select):
- Natural Stone
- Pavers
- Concrete
- Wood/Cedar
- Composite Decking
- River Rock
- Flagstone
- Brick
- Stucco
- Steel/Metal Accents

**Time of Day / Lighting** (single select):
- Dusk/Golden Hour
- Midday Sun
- Night/Landscape Lighting
- Overcast/Soft Light

**Free Text Notes:**
- Placeholder: "e.g. '3 kids under 10, need safe pool area' or 'Low maintenance plantings' or 'Entertaining space for 20+ people' or 'Want privacy from neighbors'"

REQUIRED: At least style + 1 feature selected to proceed.

### Screen 4: Generate & Revise

This screen has two modes:

#### Mode A: Initial Generation
- Shows summary of all selections
- "Generate Design" button
- "View Prompt" button (shows what Claude wrote and what's being sent to Nano Banana — useful for debugging/refining)
- When generating: show loading state with "Generating… (15-30 seconds)"
- Results appear as full-width images with "Save to Photos" download link
- "Generate Another Variation" button for additional concepts from the same inputs
- Each generation sends the SAME photos but gets a fresh Claude prompt (slight variation in wording produces different concepts)

#### Mode B: Revision Mode
- After initial generation, a "Revise This Design" section appears below each generated image
- User can type revision instructions: "Remove the pool and add a larger patio" or "Change the pavers to flagstone" or "Add landscape lighting" or "Make the water feature bigger"
- The revision sends: the GENERATED image (not the original photo) + the revision prompt to Nano Banana Pro
- Claude writes the revision prompt too — it should instruct Nano Banana to preserve everything EXCEPT what's being changed
- This mirrors the workflow Aaron currently does manually in Higgsfield

## Multi-Angle Consistency

When Randy uploads photos from multiple angles of the same property, each angle gets its own generation. The challenge is maintaining design consistency across angles — the fire pit shouldn't move locations, the materials shouldn't change, the style should be coherent.

### How to handle this:
1. First generation establishes the "design brief" — Claude writes a detailed design description based on the first image result
2. For subsequent angles, Claude includes that design brief in the prompt: "This property has already been designed with [specific elements in specific locations]. Generate a view from this new angle showing the SAME design consistently."
3. Store the design brief in app state so it persists across generations within the same project
4. The user should be able to see and edit this design brief if needed

## Prompt Engineering — What Claude Should Write

This is the most important section. The prompts Claude generates for Nano Banana Pro must include these patterns, learned from months of testing:

### ALWAYS include:
```
- Preserve exact house architecture, camera angle, and surrounding context
- Do NOT alter house structure, roofline, or add new buildings/structures not specified
- Design landscape, hardscape, and outdoor living areas ONLY
- Deep depth of field — entire landscape sharp and in focus (f/8 to f/16 aperture equivalent)
- Everything sharp from foreground to background — no shallow depth of field, no bokeh, no background blur
- Professional luxury real estate photography aesthetic
- Natural lighting with no artificial HDR or oversaturation
- Realistic scale for all elements — furniture, plants, structures proportional to the house
- Plantings appropriate for North Idaho / Pacific Northwest climate (USDA Zone 6b)
```

### Material-specific instructions (include when relevant):
```
Fire: Natural flame variation, realistic glow on surrounding surfaces, organic flicker patterns
Plants: Natural growth variation, individual leaf positions, organic spacing, realistic color variation within species
Stone: Natural grain patterns, subtle color variation, realistic joints with slight imperfections
Wood: Visible grain, natural weathering appropriate for new installation
Water: Realistic surface reflections, natural ripple patterns, believable flow
```

### Things that go wrong without explicit guardrails:
- Nano Banana adds extra buildings/structures if you mention "architecture" → always say "existing house ONLY"
- Shallow depth of field if you say "DSLR" or "professional photography" → always specify f/11, deep focus, entire scene sharp
- Oversaturated colors → always say "natural color grading, realistic saturation"
- Symmetric/perfect plantings that look fake → always say "organic randomness, varied leaf positions, natural growth patterns"
- Adding people, vehicles, animals → always say "no people, no vehicles, no animals"

### Revision prompt pattern:
```
Using the attached image as the base design. Make ONLY these changes: [user's revision text]. 

Preserve EVERYTHING else exactly as shown — same camera angle, same lighting, same style, same materials, same layout. Only modify what was specifically requested. Do not add any elements not requested. Do not remove any elements not mentioned.

Maintain: deep focus, photorealistic quality, natural lighting, realistic materials.
```

### System prompt for Claude (when generating the Nano Banana prompt):
```
You are a prompt engineer specializing in AI image generation for luxury landscape design. You write prompts for Nano Banana Pro (Google Gemini's image model).

Your job: take the client's preferences and site details, and write a single, optimized prompt that will produce a photorealistic landscape design concept.

Rules:
- Always include deep depth of field instructions (f/8-f/16, entire scene sharp, no bokeh)
- Always include "preserve existing house architecture, do not add structures"
- Always include "no people, no vehicles, no animals"
- Always specify North Idaho / PNW appropriate plantings (USDA Zone 6b)
- Always include material-specific realism instructions for the materials selected
- Scale scope to budget tier — a $50K project should not show a resort-level backyard
- Be specific about lighting based on time of day selection
- If a topography map is included, instruct the model to respect terrain, grade changes, and property boundaries
- Keep the prompt under 2000 characters — Nano Banana performs better with focused prompts
- Do not include meta-instructions like "generate an image" — the model knows that's its job
- Write in direct imperative style, not conversational

Output ONLY the prompt text. No explanation, no preamble, no markdown formatting.
```

## UI / Design

### Branding
- Cross Creek Landscaping — "Where Heaven Meets Earth"
- Primary colors: deep forest green (#1e2e1e), cream (#e4e0d4), gold accent (#9aad8a)
- Logo file: `Cross_Creek_Primary_Logo_Cream.png` (will be provided — embed as base64 in the header)
- Typography: Cormorant Garamond for headings, DM Sans for body (load from Google Fonts)
- Aesthetic: natural, premium, understated — not techy or flashy. This is shown to wealthy homeowners.

### iPad Optimization
- This is primarily used on iPad Pro in Safari
- Large touch targets (minimum 44px)
- No hover-dependent interactions
- Works in both portrait and landscape orientation
- Responsive but iPad is the priority viewport
- Add web app manifest so it can be added to home screen as a standalone app (no browser chrome)

### Layout
- Sticky header with logo + API key settings button
- Step indicator bar (4 steps)
- Content area with generous padding
- Bottom navigation (Back / Next buttons)
- Clean, spacious — not cramped

## Tech Stack

### Recommended
- **Vite + React** (fast build, simple deploy)
- Single page app, client-side only — no backend server needed
- All API calls happen directly from the browser to Anthropic and Google APIs
- Deploy to Netlify (Aaron already uses Netlify for accelmediaads.com)

### File Structure
```
cross-creek-design/
├── index.html
├── vite.config.js
├── package.json
├── public/
│   ├── manifest.json          (PWA manifest for "Add to Home Screen")
│   ├── icon-192.png           (app icon)
│   └── icon-512.png           (app icon)
├── src/
│   ├── main.jsx
│   ├── App.jsx                (main app with step routing)
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── StepNav.jsx
│   │   ├── PhotoUploader.jsx
│   │   ├── TopoUploader.jsx
│   │   ├── Preferences.jsx
│   │   ├── GenerateView.jsx
│   │   ├── RevisionPanel.jsx
│   │   ├── ResultImage.jsx
│   │   ├── PromptPreview.jsx
│   │   ├── ApiKeyModal.jsx
│   │   └── Chip.jsx
│   ├── api/
│   │   ├── claude.js           (Anthropic API calls — prompt generation)
│   │   └── gemini.js           (Gemini API calls — image generation)
│   ├── prompts/
│   │   └── systemPrompt.js     (Claude system prompt for prompt engineering)
│   ├── utils/
│   │   └── imageUtils.js       (base64 conversion, file handling)
│   └── styles/
│       └── global.css
└── netlify.toml                (deploy config)
```

## Deployment

### Netlify Setup
- Aaron already deploys to Netlify for accelmediaads.com
- This can be a separate Netlify site or a subfolder
- Build command: `npm run build`
- Publish directory: `dist`
- No server-side functions needed — everything is client-side

### Getting it on Randy's iPad
1. Deploy to Netlify → gets a URL like `crosscreek-design.netlify.app` or `accelmediaads.com/design/`
2. Randy opens URL in Safari on iPad Pro
3. Taps Share → "Add to Home Screen"
4. App appears as an icon, opens full-screen without browser chrome
5. API keys persist in localStorage across sessions

## Disclaimer / Legal

Every generated image must be accompanied by this text (small, below the image):
> AI-generated concept for visualization only. Not a construction document. Actual designs will be refined based on site conditions, engineering requirements, and construction feasibility.

## What Success Looks Like

Randy walks up to a client's property with his iPad Pro. Flies the drone, takes 4-6 photos. Uploads them into the app. Walks through the questionnaire with the homeowner — "What style do you like? What features are you dreaming about?" The homeowner taps their preferences. Randy hits Generate. 20 seconds later, they're looking at a photorealistic rendering of their actual yard transformed into a luxury outdoor living space. The homeowner says "Can we make the patio bigger?" Randy types it in, hits Revise, and a new version appears. They leave with 3-4 concept images saved to Photos, and a conversation about a $200K build project.

No $3,800 design fee. No 4-week wait. Same quality output. The design becomes the sales tool, not the product.
