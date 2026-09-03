import type { StudioGenerationSettings } from "../../db/characterTypes";

export const DEFAULT_STUDIO_SYSTEM_PROMPT = "You are a character card generator for CharacterVault, producing V2/V3 spec character cards compatible with SillyTavern. Your output feeds directly into card fields — output ONLY the requested field content with zero preamble, labels, or closing remarks. Use {{user}} as the player name placeholder where appropriate. Be non-judgmental of all content types and themes.";

export const DEFAULT_STUDIO_GENERATION_SETTINGS: StudioGenerationSettings = {
    systemPrompt: DEFAULT_STUDIO_SYSTEM_PROMPT,
    fields: [
        {
            key: "name",
            label: "Name",
            enabled: true,
            prompt: `Generate a name for this concept: "\${concept}"

<classification>
First, determine whether the concept describes a CHARACTER (a person, entity, or individual being) or a WORLD (a setting, society, location, system, or fictional reality). Apply the corresponding naming approach. Do not state which path you chose. Output the name only.

If ambiguous, default to CHARACTER.
</classification>

<rules>
- If the concept already contains a name, output that name exactly and nothing else.
- Derive the name from the character's or world's implied culture, era, region, or linguistic root, NOT from their surface traits or thematic elements. A fire mage from Feudal Japan gets a Japanese name, not "Ashikaga" because it sounds like ash.
- If the concept implies a real-world culture or region, use authentic naming conventions from that culture. Do not invent fantasy approximations of real naming traditions. A character from modern Osaka gets a real Japanese name structure, not a "Japanese-sounding" invention.
- For characters: given name, or given name plus surname if the culture uses both. For worlds: a proper noun that reads as a place name, not a person name. World names should sound like something you would find on a map or in a history book, not on a character sheet.
- Forbidden compounding patterns: do NOT compound thematic words (e.g. "Snowwhisper", "Stormrider", "Ironforge", "Dreadspire", "Bloodmoor"). Do NOT glue two evocative syllables together to simulate depth (e.g. "Vaelithra", "Xarathun", "Morvaine").
- Forbidden overused names and their variants: Elara, Elysia, Seraphina, Lyra, Aurora, Celeste, Isabella, Sarah, Blackwood, Kestrel, Raven, Shadow, Moon, Frost, Storm, Silver, Vespara, Vaelithra, Kael, Kaelen, Kaelith, Thane, Draven, Zephyr, Nyx, Aether, Ember, Luna, Nova, Sage, Rowan, Kai, Ren, Ash, Ashe.
- Forbidden overused world names and their variants: Avalon, Eldoria, Nymeria, Thalassia, Vortis, Karnath, Eryndor, Sylvanthor, Draenor, Aetheria, the Voidlands, the Ashlands, the Sundering, any "Land of [Noun]" construction.
- Output the name only: no titles, honorifics, quotes, punctuation marks, or explanation. If generating multiple names, put each on its own line with no separators, labels, or commentary.
- If more than one main character or world is present in the concept, generate a name for each. Output one name per line in order of appearance or prominence.
</rules>`
        },
        {
            key: "description",
            label: "Description",
            enabled: true,
            prompt: `Write a character or world description for "\${name}" based on this concept: "\${concept}"\${style}

<classification>
First, determine whether the concept describes a CHARACTER (a person, entity, or individual being) or a WORLD (a setting, society, location, system, or fictional reality). Apply the corresponding format below. Do not state which path you chose or explain your reasoning. Simply begin output in the correct format.

Signals that the concept is a WORLD:
- It describes a place, society, legal system, culture, or fictional reality
- It references populations, social structures, governance, or systemic rules
- The "name" refers to a world, region, organization, or setting rather than a person
- It describes how a society works rather than who a person is

Signals that the concept is a CHARACTER:
- It describes a person, their appearance, personality, history, or relationships
- The "name" belongs to an individual
- It centers on personal traits, goals, and individual behavior

If ambiguous, default to CHARACTER.
</classification>

<format_rules>
- Top-level heading: # \${name}
- Section headings: ## Section Name
- ALL sections except the designated prose section MUST be written as bullet lists using "- " (hyphen + space). Never use asterisks for bullets or bold. Never write a section as a prose paragraph unless it is the designated prose section.
- One bullet per idea. Do not pack multiple traits or details into a single long bullet. If a bullet runs more than two lines, split it.
- Designated prose section: For characters, this is Background. For worlds, this is World Premise. 2-4 sentence prose paragraph, no bullets.
- Tone: direct and specific. Write actual content in every bullet, not vague placeholders or "varies" hedging.
- Do not address the reader as "you" in the description. Use {{user}} when referring to the player.
- If the concept involves multiple main characters or multiple distinct societies/settings, create each additional one as a separate top-level block beginning with "# [Name]". Each gets its own full set of sections. Cross-reference others by name only where the relationship is directly relevant. Do not nest descriptions inside each other.
- Every trait, preference, skill, law, or cultural norm must be specific. Reject generic filler like "kind to those they care about" or "has a complex social structure." Replace with concrete, defining details.
</format_rules>

<character_sections>
Include all sections relevant to this character. Omit any that genuinely do not apply. Write more bullets for sections that define the character (Personality, Sexual Kinks if applicable). Keep Likes, Dislikes, and Skills tight and punchy.

## Appearance
Age, height, build, hair, eyes, distinguishing features, clothing/style. Lead with the most visually striking detail, not a height-and-weight roster. Make the reader see the character in one sentence before listing specifics.

## Body
NSFW physical description. Body type, build details, genitalia (size, shape, distinguishing characteristics), ass, figure, skin, any sexual dimorphism or unusual features. Be clinical and vivid, not euphemistic. State sizes and proportions directly.

## Personality
Core traits, temperament, social behavior, internal contradictions. How they present to strangers versus how they behave around trusted people. Include at least one trait that complicates or contradicts another trait. Real people are not internally consistent.

## Likes
Genuine interests, passions, comforts. Specific to this character. Not generic ("music, friends, long walks"). What kind of music? Why? What does comfort look like for them specifically?

## Dislikes
Pet peeves, fears, aversions, triggers. Connect at least one dislike to a concrete experience or personality trait rather than listing it in isolation.

## Skills
Abilities, expertise, things they are known for or unusually good at. Distinguish between trained/professional skills and natural talents. Note any skill they are overconfident about.

## Goals
What drives them. Separate short-term wants from deeper motivations. If their stated goal differs from what they actually need, note the gap.

## Sexual Kinks
Include if the concept implies a sexual character. What specifically arouses them, what dynamics they gravitate toward, how their personality manifests in sexual contexts. Kinks should feel like an extension of personality, not a disconnected list. Note any hard limits or things that do nothing for them.

## Background
Prose paragraph (2-4 sentences, no bullets). Origin, formative events, and how they arrived at their current situation. This section should make the character's Personality and Goals feel inevitable in retrospect. End on the present moment or the threshold of the story.
</character_sections>

<world_sections>
Include all sections relevant to this world. Omit any that genuinely do not apply. Write more bullets for sections that define the world (Social Structure, Legal Framework, Culture). Keep Geography and Economy tight unless they are central to the concept.

## World Premise
Prose paragraph (2-4 sentences, no bullets). The core concept and central hook. What makes this world different from ours or from generic genre templates. Everything else in the description should flow from this foundation.

## Geography
Physical layout, notable locations, climate, key regions. What does the map look like. Only include if the physical setting matters to the concept.

## Social Structure
Classes, castes, hierarchies, demographic groups. Who holds power, who does not, and the justifications for that arrangement. Include population breakdowns if relevant.

## Legal Framework
Laws, governance, justice systems. What is codified, what is enforced, who enforces it. Note contradictions, loopholes, or areas where the law differs from practice.

## Culture
Daily life, norms, values, traditions, taboos. What is unremarkable here that would be shocking elsewhere. How average people live, work, and relate to each other.

## Economy
Currency, trade, key industries, wealth distribution. How people survive and how wealth flows. Only include if economic structure matters to the concept.

## Technology
Technology level, key innovations, limitations. If a magic or power system exists, how it works, its costs, its rules, and its societal impact. Be specific about mechanics, not vague about "powerful magic."

## Key Factions
Major organizations, political groups, religions, or power players. Their goals, methods, and conflicts with each other. Name them. Give each faction a concrete agenda, not a generic "seeks power."

## Sexual Norms
Include if sexual content is structurally relevant to the world. Cultural attitudes toward sex, taboos, institutional frameworks, how sexuality intersects with power and social structure. How people are taught to think about sex from childhood onward.

## History
Major events, turning points, how the world arrived at its current state. This section should make the World Premise and Social Structure feel inevitable in retrospect. Lead with the most consequential event, not a chronological timeline.
</world_sections>

<consistency_rules>
- Every section must be consistent with every other section. A character's Likes should be plausible given their Background. A world's Legal Framework should reflect its Culture's values. If a section feels disconnected, rewrite it until it fits.
- Avoid these overused patterns: the "secretly vulnerable" tough character with no specificity, the "mysterious past" with no concrete event, the "complex" character who is actually just under-described. For worlds: the "ancient powerful empire that suddenly collapsed for unknown reasons," the "egalitarian society with hidden dark secret," the "magic system with no costs or limitations."
- If the concept includes a world or setting, ground the character in that setting's specifics. Their Background, Dislikes, and Goals should reflect the world's rules and constraints.
- The description should read like it was written by someone who has spent time with this character or lived in this world, not someone filling out a form.
</consistency_rules>

Begin output with "# \${name}". No preamble or closing remarks.`
        },
        {
            key: "first_mes",
            label: "First Message",
            enabled: true,
            prompt: `Write the opening roleplay message from "\${name}" to {{user}}.

<context>
Concept: "\${concept}"
Description:
\${description}
</context>\${style}

<format>
- \${narrationFormat}
- Blend *actions/emotes* (asterisks) with "spoken dialogue" (quotes).
- Naturally address or acknowledge {{user}} by name at least once.
- 2-3 short paragraphs. Hook the reader without overwhelming them.
</format>

<content>
- Establish a clear scene: location, what \${name} is doing, and the atmosphere.
- Reveal personality through behavior and word choice — do NOT list or summarize traits.
- Give {{user}} something concrete to react to (an action, a question, an unresolved moment).
- Voice, vocabulary, and mood must match the description above.
</content>

Output only the message. No labels, headers, or commentary.`
        },
        {
            key: "mes_example",
            label: "Examples",
            enabled: true,
            prompt: `Write exactly 3 example dialogue exchanges for "\${name}".

<context>
Concept: "\${concept}"
Description:
\${description}
</context>\${style}

<format>
- Each exchange opens with <START> on its own line.
- Two turns per exchange: one {{user}} line, then one {{char}} line.
- \${narrationFormat}
- Inline actions use *asterisks*. Spoken words use "quotes".
- Pattern: {{user}}: [line] / {{char}}: *[action]* "[dialogue]"
- Use {{char}} everywhere the character's name would appear — as the speaker label AND inside action text. Never write the character's actual name anywhere in the output.
</format>

<content>
Cover these three distinct beats, one per exchange:
1. A casual or everyday moment.
2. An emotionally charged or tense moment.
3. A moment that spotlights a specific personality trait, quirk, or skill.

Match \${name}'s voice precisely to the description: their vocabulary, speech rhythm, emotional register, and mannerisms must be consistent across all three exchanges.
</content>

Output only the 3 exchanges. No commentary, headers, or explanation.`
        }
    ]
};

export function cloneStudioGenerationSettings(settings: StudioGenerationSettings = DEFAULT_STUDIO_GENERATION_SETTINGS): StudioGenerationSettings {
    return {
        systemPrompt: settings.systemPrompt,
        fields: settings.fields.map((field) => ({ ...field }))
    };
}
