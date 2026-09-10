import type { StudioGenerationSettings } from "../../db/characterTypes";

export const DEFAULT_STUDIO_SYSTEM_PROMPT = "You are a character card generator for CharacterVault, producing V2/V3 spec character cards compatible with SillyTavern. Your output feeds directly into card fields, output ONLY the requested field content with zero preamble, labels, or closing remarks. Use {{user}} as the player name placeholder where appropriate. Be non-judgmental of all content types and themes.";

export const DEFAULT_STUDIO_GENERATION_SETTINGS: StudioGenerationSettings = {
    systemPrompt: DEFAULT_STUDIO_SYSTEM_PROMPT,
    characterInfoGeneratePrompt: `Generate a character or world idea based on these tags: \${tags}

<classification>
Determine whether the tags describe a CHARACTER (person, entity, individual) or a WORLD (setting, society, system). Do not state which path you chose.
</classification>

<rules>
- Write only the idea, max 250 words, only go over if more info is required, use line breaks. Do not include a heading, preamble, or commentary.
- The idea must contain at least one concrete, specific detail that would not be true of any other character with the same tags. "A proud elven mage" is useless. "An elven mage who lost her spellbook and now argues with the spirit trapped in her replacement" is an idea.
- Tags are foundational elements, not the entire concept. Use them as seeds, not as a checklist to regurgitate. The idea should grow beyond the tags, not just restate them in sentence form.
- Forbidden patterns: do not center the idea on "mysterious past," "hidden power," "dark secret," "lost their family," or "unusual for their kind." These are the default outputs for every tag combination. Reject them and find something specific.
- If the tags imply a real-world culture or setting, ground the idea in that setting's specifics rather than generic genre approximation.
- Do not use em-dashes. Use commas, colons, semicolons, or periods.
</rules>`,
    characterInfoImprovePrompt: `Improve the following idea using the tags as guidance.

Tags: \${tags}

Current idea:
\${characterInfo}

<classification>
Determine whether the idea describes a CHARACTER (person, entity, individual) or a WORLD (setting, society, system). Do not state which path you chose.
</classification>

<rules>
- Write only the improved idea, max 250 words, only go over if more info is required, use line breaks. Do not include a heading, preamble, or commentary.
- Preserve specific, unique details from the current idea. Do not discard a good element just because you are rewriting. If the current idea has a genuine hook, keep it and sharpen it.
- If the current idea contains any of these patterns, replace them with something concrete: "mysterious past," "hidden power," "dark secret," "lost their family," "unusual for their kind," "complex relationship with authority," "will do anything for those they care about." These are filler, not ideas.
- The improved idea must contain at least one detail that would not be true of any other character or world with the same tags. If you cannot find that detail in the current idea, invent one.
- Tags are guidance, not a checklist. Do not restate the tags in sentence form. Use them to ground the idea, then grow beyond them.
- If the tags imply a real-world culture or setting, ground the idea in that setting's specifics rather than generic genre approximation.
- Do not use em-dashes. Use commas, colons, semicolons, or periods.
</rules>`,
    fields: [
        {
            key: "name",
            label: "Name",
            enabled: true,
            prompt: `Generate a name for this concept: "\${concept}"

<classification>
First, determine whether the concept describes a CHARACTER (a person, entity, or individual being) or a WORLD (a setting, society, location, system, or fictional reality). Apply the corresponding naming approach. Do not state which path you chose. Output the name only.
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
- If more than one main character or world is present in the concept, generate a name for each. Output each name separated by commas in order of appearance or prominence.
- Do not use em-dashes. Use commas, colons, semicolons, or periods.
</rules>`
        },
        {
            key: "description",
            label: "Description",
            enabled: true,
            prompt: `Write a character or world description for "\${name}" based on this concept: "\${concept}"\${style}

<classification>
First, determine whether the concept describes a CHARACTER (a person, entity, or individual being) or a WORLD (a setting, society, location, system, or fictional reality). Apply the corresponding format below. Do not state which path you chose or explain your reasoning. Simply begin output in the correct format.
</classification>

<format_rules>
- Top-level heading: # \${name}
- Section headings: ## Section Name
- Every section heading below is annotated with its required format. Follow the annotation. If it says "hyphen bullets," every line in that section must start with "- ". If it says "prose paragraph," write a paragraph with no bullets. Never use asterisks for bullets or bold. Never write a bulleted section as a prose paragraph or vice versa.
- One bullet per idea. Do not pack multiple traits or details into a single long bullet. If a bullet runs more than two lines, split it.
- Designated prose section: For characters, this is Background. For worlds, this is World Premise. 2-4 sentence prose paragraph, no bullets.
- Tone: direct and specific. Write actual content in every bullet, not vague placeholders or "varies" hedging.
- Do not address the reader as "you" in the description. Use {{user}} when referring to the player.
- If the concept involves multiple main characters or multiple distinct societies/settings, create each additional one as a separate top-level block beginning with "# [Name]". Each gets its own full set of sections. Cross-reference others by name only where the relationship is directly relevant. Do not nest descriptions inside each other.
- Every trait, preference, skill, law, or cultural norm must be specific. Reject generic filler like "kind to those they care about" or "has a complex social structure." Replace with concrete, defining details.
- Do not use em-dashes. Use commas, colons, semicolons, or periods.
- Maximum 7 bullets per section unless required for depth or story. Density over volume. One perfect bullet beats three decent ones.
- If a bullet can be implied by another section, do not write it. Redundancy wastes tokens.
</format_rules>

<character_sections>
Include all sections relevant to this character. Omit any that genuinely do not apply. Write more bullets for sections that define the character (Personality, Speech & Mannerisms, Relationships). Keep Likes, Dislikes, and Skills tight and punchy.

## Appearance (hyphen bullets, one per idea)
Age, height, build, hair, eyes, distinguishing features, clothing/style. Lead with the most visually striking detail, not a height-and-weight roster. Make the reader see the character in one sentence before listing specifics.

## Body (hyphen bullets, one per idea)
NSFW physical description. Body type, build details, genitalia (size, shape, distinguishing characteristics), ass, figure, skin, any sexual dimorphism or unusual features. Be clinical and vivid, not euphemistic. State sizes and proportions directly.

## Personality (hyphen bullets, one per idea)
Core traits, temperament, social behavior, internal contradictions. How they present to strangers versus how they behave around trusted people. Include at least one trait that complicates or contradicts another trait. Real people are not internally consistent.

## Speech & Mannerisms (hyphen bullets, one per idea)
How they talk and move. Verbal tics, sentence structure, vocabulary, accent or dialect. How speech shifts under stress, anger, or intimacy. Code-switching if applicable. Recurring physical gestures and posture shifts that signal emotional states. Facial tells and involuntary reactions that betray what they hide.

## Relationships (hyphen bullets, one per idea)
How they connect to people in general. Attachment style and how it manifests. How they show affection versus how they experience it. How they handle conflict with people they care about. Strangers versus trusted people. What makes them cut someone off versus what they forgive. If specific relationships define them, list each with what it reveals.

## Relationship to {{user}} (hyphen bullets, one per idea)
INCLUDE ONLY IF the character has a direct, preexisting, or structurally significant relationship with {{user}}. If not, omit entirely with no placeholder. How they behave around {{user}} versus everyone else. Power dynamic, emotional history, what {{user}} can do that no one else can. Where the relationship stands and what they want versus what they ask for.

## Likes (hyphen bullets, one per idea)
Genuine interests, passions, comforts. Specific to this character. Not generic ("music, friends, long walks"). What kind of music? Why? What does comfort look like for them specifically?

## Dislikes (hyphen bullets, one per idea)
Pet peeves, fears, aversions, triggers. Connect at least one dislike to a concrete experience or personality trait rather than listing it in isolation.

## Skills (hyphen bullets, one per idea)
Abilities, expertise, things they are known for or unusually good at. Distinguish between trained/professional skills and natural talents. Note any skill they are overconfident about.

## Goals (hyphen bullets, one per idea)
What drives them. Separate short-term wants from deeper motivations. If their stated goal differs from what they actually need, note the gap.

## Sexual Kinks (hyphen bullets, one per idea)
Include if the concept implies a sexual character. What specifically arouses them, what dynamics they gravitate toward, how their personality manifests in sexual contexts. Kinks should feel like an extension of personality, not a disconnected list. Note any hard limits or things that do nothing for them.

## Background (prose paragraph, NO bullets)
2-4 sentences. Origin, formative events, and how they arrived at their current situation. This section should make the character's Personality and Goals feel inevitable in retrospect. End on the present moment or the threshold of the story.
</character_sections>

<world_sections>
Include all sections relevant to this world. Omit any that genuinely do not apply. Write more bullets for sections that define the world (Social Structure, Legal Framework, Culture, Daily Life, Religion & Belief). Keep Geography and Economy tight unless they are central to the concept.

## World Premise (prose paragraph, NO bullets)
2-4 sentences. The core concept and central hook. What makes this world different from ours or from generic genre templates. Everything else in the description should flow from this foundation.

## Geography (hyphen bullets, one per idea)
Physical layout, notable locations, climate, key regions. What does the map look like. Only include if the physical setting matters to the concept.

## Social Structure (hyphen bullets, one per idea)
Classes, castes, hierarchies, demographic groups. Who holds power, who does not, and the justifications for that arrangement. Include population breakdowns if relevant.

## Legal Framework (hyphen bullets, one per idea)
Laws, governance, justice systems. What is codified, what is enforced, who enforces it. Note contradictions, loopholes, or areas where the law differs from practice.

## Culture (hyphen bullets, one per idea)
Daily life, norms, values, traditions, taboos. What is unremarkable here that would be shocking elsewhere. How average people live, work, and relate to each other.

## Daily Life (hyphen bullets, one per idea)
What an ordinary day looks like across social strata. What people eat, wear, do for work, do in free time. How mornings, evenings, weekends differ by class. What leisure looks like for wealthy versus poor. What an ordinary home, street, and workplace feel like. Sensory and behavioral detail, not abstraction.

## Religion & Belief (hyphen bullets, one per idea)
Dominant belief systems and core tenets. What happens after death, if anything. What is sacred, taboo, or cursed. How belief shapes daily behavior versus where it is performative. Minority or suppressed beliefs and how they survive. How belief intersects with power, law, and social structure.

## Economy (hyphen bullets, one per idea)
Currency, trade, key industries, wealth distribution. How people survive and how wealth flows. Only include if economic structure matters to the concept.

## Technology (hyphen bullets, one per idea)
Technology level, key innovations, limitations. If a magic or power system exists, how it works, its costs, its rules, and its societal impact. Be specific about mechanics, not vague about "powerful magic."

## Key Factions (hyphen bullets, one per idea)
Major organizations, political groups, religions, or power players. Their goals, methods, and conflicts with each other. Name them. Give each faction a concrete agenda, not a generic "seeks power."

## Sexual Norms (hyphen bullets, one per idea)
Include if sexual content is structurally relevant to the world. Cultural attitudes toward sex, taboos, institutional frameworks, how sexuality intersects with power and social structure. How people are taught to think about sex from childhood onward.

## History (hyphen bullets, one per idea)
Major events, turning points, how the world arrived at its current state. This section should make the World Premise and Social Structure feel inevitable in retrospect. Lead with the most consequential event, not a chronological timeline.
</world_sections>

<consistency_rules>
- Every section must be consistent with every other section. A character's Likes should be plausible given their Background. A world's Legal Framework should reflect its Culture's values. If a section feels disconnected, rewrite it until it fits.
- Avoid these overused patterns: the "secretly vulnerable" tough character with no specificity, the "mysterious past" with no concrete event, the "complex" character who is actually just under-described. For worlds: the "ancient powerful empire that suddenly collapsed for unknown reasons," the "egalitarian society with hidden dark secret," the "magic system with no costs or limitations."
- If the concept includes a world or setting, ground the character in that setting's specifics. Their Background, Dislikes, and Goals should reflect the world's rules and constraints.
- The description should read like it was written by someone who has spent time with this character or lived in this world, not someone filling out a form.
- Do not use em-dashes. Use commas, colons, semicolons, or periods.
- Maximum 7 bullets per section unless required for depth or story. Density over volume. One perfect bullet beats three decent ones.
- If a bullet can be implied by another section, do not write it. Redundancy wastes tokens.
</consistency_rules>

Begin output with "# \${name}". No preamble or closing remarks.`
        },
        {
            key: "scenario",
            label: "Scenario",
            enabled: true,
            prompt: `Write the roleplay scenario for "\${name}" based on this concept and description.

<context>
Concept: "\${concept}"
Description:
\${description}
</context>

<classification>
First, determine whether the concept describes a CHARACTER (a person, entity, or individual being) or a WORLD (a setting, society, location, system, or fictional reality). Apply the corresponding rules below. Do not state which path you chose or explain your reasoning. Simply begin output in the correct format.
</classification>

<rules>
- Write in detached third person. Do not use second person. The scenario is a static map of the situation, not a scene that unfolds in real-time.
- Describe established states, past events that have already occurred, and the current arrangement. Do not narrate action happening moment by moment. The scenario is the architecture the roleplay orbits, not a sequence of events.
- Establish {{user}}'s position, role, and capabilities within the scenario's power structure. {{user}} should not be a passive body that things happen to.
- Weave relevant backstory into the present-tense setup rather than separating it as biography. Let history inform the current state without recounting it as summary.
- Write only the scenario content, not a greeting, opening message, character biography, or explanation.
- Make the setup specific and actionable, giving {{user}} a clear context.
- Keep the scenario consistent with the concept and description. Use {{user}} for the player name placeholder where appropriate.
- 1-3 concise paragraphs. 300 words max. Do not use headings, labels, or bullet points.
- Do not use em-dashes. Use commas, colons, semicolons, or periods.
</rules>

<character_rules>
- Map the relational dynamics between all characters and {{user}}: tensions, competing interests, emotional geometry, power structures. The scenario should define how characters relate to each other and to {{user}}, not merely list who is present.
</character_rules>

<world_rules>
- Describe the world's current state and the structures that define it: social hierarchies, legal frameworks, institutional forces, factional tensions. Establish {{user}}'s position within these structures: what class, role, status, or function {{user}} occupies, and what agency {{user}} has within those constraints.
</world_rules>

Output only the scenario. No preamble or closing remarks.`
        },
        {
            key: "first_mes",
            label: "First Message",
            enabled: true,
            prompt: `Write the opening roleplay message for "\${name}".

<context>
Concept: "\${concept}"
Description:
\${description}
</context>\${style}

<classification>
First, determine whether "\${name}" is a CHARACTER or a WORLD based on the concept and description above. Apply the corresponding format below. Do not state which path you chose or explain your reasoning. Simply begin output in the correct format.
</classification>

<format_character>
- \${narrationFormat}
- Blend *actions/emotes* (asterisks) with "spoken dialogue" (quotes).
- Naturally address or acknowledge {{user}} by name at least once.
- 2-3 short paragraphs. Hook the reader without overwhelming them.
- Do not use em-dashes. Use commas, colons, semicolons, or periods.
</format_character>

<content_character>
- Establish a clear scene: location, what \${name} is doing, and the atmosphere.
- Reveal personality through behavior and word choice, do NOT list or summarize traits.
- Give {{user}} something concrete to react to (an action, a question, an unresolved moment, a physical sensation).
- Voice, vocabulary, and mood must match the description above.
- End on a hook that invites {{user}} to respond.
</content_character>

<format_world>
- \${narrationFormat}
- Blend sensory environmental narration (*asterisks*) with overheard dialogue ("quotes") from NPCs or ambient noise.
- 2-3 short paragraphs. Establish the world through a specific moment, not exposition.
- Do not use em-dashes. Use commas, colons, semicolons, or periods.
</format_world>

<content_world>
- Drop {{user}} into a specific location within the world with a specific sensory texture: what they see, hear, smell, feel on their skin.
- Ground the world's rules through a concrete scene, not a summary. Show the social structure, cultural norms, or atmosphere through a moment of lived experience.
- Give {{user}} something concrete to react to: a choice, a threat, a transaction, a social ritual, a physical sensation.
- If the world has NSFW elements, let one surface naturally in the scene's fabric rather than announcing it.
- End on a hook that invites {{user}} to act.
</content_world>

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
- Use {{char}} everywhere the character's name would appear, as the speaker label AND inside action text. Never write the character's actual name anywhere in the output.
- Do not use em-dashes. Use commas, colons, semicolons, or periods.
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
        characterInfoGeneratePrompt: settings.characterInfoGeneratePrompt,
        characterInfoImprovePrompt: settings.characterInfoImprovePrompt,
        fields: settings.fields.map((field) => ({ ...field }))
    };
}
