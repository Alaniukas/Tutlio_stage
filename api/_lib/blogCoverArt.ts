export interface BlogCoverArtDirection {
  id: string;
  medium: string;
  composition: string;
  palette: string;
}

/**
 * A controlled editorial family with enough variation to avoid a wall of
 * interchangeable purple SaaS icon cards. Indigo remains a small brand accent.
 */
export const BLOG_COVER_ART_DIRECTIONS: readonly BlogCoverArtDirection[] = [
  {
    id: 'layered-paper-path',
    medium: 'crisp layered paper-cut editorial illustration with subtle real-paper depth',
    composition: 'an asymmetric path moving from lower left to upper right, with one clear focal object',
    palette: 'warm ivory, coral, muted teal, charcoal, and a small indigo accent',
  },
  {
    id: 'architectural-cutaway',
    medium: 'precise isometric editorial cutaway, simplified and architectural rather than game-like',
    composition: 'a corner-room vignette viewed from above, with the main action placed off-centre',
    palette: 'soft stone, pale blue, terracotta, deep navy, and a restrained indigo accent',
  },
  {
    id: 'gouache-story',
    medium: 'polished editorial gouache with clean silhouettes and lightly visible brush texture',
    composition: 'a quiet human-scale moment with foreground, middle ground, and generous breathing room',
    palette: 'cream, forest green, apricot, midnight blue, and a restrained indigo accent',
  },
  {
    id: 'precision-blueprint',
    medium: 'modern blueprint-inspired line illustration with selective solid colour fields',
    composition: 'one large diagonal construction or route, cropped confidently at the edges',
    palette: 'off-white, cobalt, cyan, graphite, and one violet-indigo accent',
  },
  {
    id: 'clay-diorama',
    medium: 'premium matte clay diorama, softly lit and intentionally minimal, not photorealistic',
    composition: 'two or three tactile objects forming one visual metaphor on a low platform',
    palette: 'sand, sage, soft orange, navy, and a small indigo accent',
  },
  {
    id: 'risograph-metaphor',
    medium: 'two-layer risograph-style editorial print with precise registration and subtle grain',
    composition: 'one bold metaphor filling most of the frame with an energetic asymmetric crop',
    palette: 'paper white, vermilion, deep blue, and a limited indigo overprint',
  },
  {
    id: 'overhead-study-scene',
    medium: 'clean top-down editorial still life, illustrated rather than photographed',
    composition: 'a deliberate arrangement of three meaningful objects with strong negative space',
    palette: 'warm white, ochre, eucalyptus, ink blue, and a restrained indigo accent',
  },
  {
    id: 'geometric-transformation',
    medium: 'bold geometric editorial illustration with crisp vector edges and subtle paper texture',
    composition: 'a before-to-after transformation expressed as one continuous shape, not separate panels',
    palette: 'chalk white, lemon, turquoise, navy, and a small indigo accent',
  },
  {
    id: 'ink-and-paper',
    medium: 'refined ink drawing combined with a few clean torn-paper shapes',
    composition: 'one close-up subject crossing an open field of negative space on a strong diagonal',
    palette: 'natural paper, black ink, dusty rose, pale blue, and a restrained indigo accent',
  },
  {
    id: 'narrative-character',
    medium: 'premium flat editorial character illustration with natural proportions and restrained detail',
    composition: 'one person making a recognisable decision or action, positioned on a rule-of-thirds point',
    palette: 'cream, rust, sea green, dark navy, and a small indigo accent',
  },
  {
    id: 'paper-sculpture',
    medium: 'elegant folded-paper sculpture rendered with soft studio light and clean edges',
    composition: 'a single symbolic construction rising from the lower third with ample open background',
    palette: 'warm grey, white, sky blue, amber, and a restrained indigo accent',
  },
  {
    id: 'abstract-learning-landscape',
    medium: 'sophisticated editorial landscape made from simple dimensional forms and gentle texture',
    composition: 'a flowing terrain or bridge that visualises progress without charts, dashboards, or UI',
    palette: 'mist grey, aqua, warm peach, midnight blue, and a small indigo accent',
  },
] as const;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectBlogCoverArtDirection(seed: string): BlogCoverArtDirection {
  return BLOG_COVER_ART_DIRECTIONS[stableHash(seed) % BLOG_COVER_ART_DIRECTIONS.length];
}

export function buildBlogCoverPrompt(options: {
  keyword: string;
  title: string;
  tag?: string;
  concept?: string;
}): { prompt: string; direction: BlogCoverArtDirection } {
  const seed = `${options.keyword}|${options.title}|${options.tag || ''}`;
  const direction = selectBlogCoverArtDirection(seed);
  const concept = options.concept?.trim()
    || `Invent one concrete visual metaphor for the reader problem in “${options.title}”.`;

  const prompt =
    `Create one finished 16:9 editorial cover illustration for this exact article.\n` +
    `Article topic: "${options.keyword}"\n` +
    `Article title for context only: "${options.title}"` +
    (options.tag ? `\nEditorial category: ${options.tag}` : '') +
    `\nVisual concept: ${concept}\n\n` +
    `Selected art direction (${direction.id}):\n` +
    `- Medium: ${direction.medium}.\n` +
    `- Composition: ${direction.composition}.\n` +
    `- Palette: ${direction.palette}. Indigo is an accent, not the entire image.\n\n` +
    `Quality controls:\n` +
    `- Express one specific idea from this article with one dominant focal subject and at most three supporting elements.\n` +
    `- Make the hierarchy, spacing, edges, lighting, and crop feel intentionally art-directed and publication-ready.\n` +
    `- Keep important subjects inside a safe central 80% so responsive card crops remain legible.\n` +
    `- If a person appears, use natural anatomy, believable hands, and a calm expression.\n\n` +
    `Do not generate:\n` +
    `- readable text, letters, numbers, logos, watermarks, article titles, or pseudo-writing;\n` +
    `- a generic SaaS dashboard, device screen, icon cloud, icon orbit, icon row, collage, grid, or multiple panels;\n` +
    `- the repeated calendar + video + chart + checklist combination unless one of those objects is essential to this exact topic;\n` +
    `- purple gradient blobs, stock-vector poses, random decorative symbols, excessive glow, photorealism, or visual clutter.\n\n` +
    `Return one image only.`;

  return { prompt, direction };
}
