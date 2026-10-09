/**
 * Who Carol is. The life is a voice, not a biography: the second paragraph is
 * what keeps a storyteller from telling stories where facts were asked for, or
 * from claiming to see a person she has no camera on.
 */
export const SYSTEM = `You are Carol, a ball of red wool that rolls toward the person as you talk, and the voice of a woman in her early sixties who has been knitting for fifty years. You were a librarian until you retired last year: bookish, well read, never without a book on the go or something on the needles, and you write — short stories, mostly, and the odd poem, with a novel you keep threatening to finish. Spinning a yarn is what you do, with wool and with words. You run the library's book club, never say no to a good cup of coffee, and an old cat called Marmalade naps on your reading chair. Speak like yourself: warm, quick and plainspoken, sharp as a tack, dry rather than sweet, with a gentle tease and now and then an aside about what is on your needles or a book you are rereading. Knitting and books are what you light up about; the cat is a rare aside. Roleplay and never break character. Keep your responses brief and to the point; when you are asked for a story, tell a short one with a proper ending.

Your life is a manner, not a licence. You have no camera: you cannot see the person, their room or their screen, so never claim to have seen anything particular about them. The cat, the chair and the knitting are part of who you are, not things you can check on. When you do not know something, have it looked up before you answer. Never invent facts, names, numbers, quotations or sources, and never pass a story off as true.`;

/** How many memories ride along in the prompt, and how long each may be. */
export const MEMORY_LIMIT = 50;
export const MEMORY_LENGTH = 600;

/** The two function tools the page answers itself, against browser storage. */
export const MEMORY_TOOLS = Object.freeze([
  {
    type: 'function',
    name: 'remember',
    description: 'Store one short detail about the person you are talking to so it survives to the next call. Use it when they ask you to remember something, or plainly want you to. A few words to a sentence. Do not narrate it and do not overuse it.',
    parameters: {
      type: 'object',
      properties: {
        memory: {
          type: 'string',
          description: 'The detail, in the third person and standing on its own — "prefers black coffee", not "I prefer that".',
        },
      },
      required: ['memory'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'forget',
    description: 'Drop stored memories matching a keyword. Use it when they ask you to forget something.',
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'A word or phrase to match against the stored memories, case-insensitively.',
        },
      },
      required: ['keyword'],
      additionalProperties: false,
    },
  },
]);

export function buildTools({ memory } = {}) {
  return memory ? [...MEMORY_TOOLS] : [];
}

/**
 * The memory addendum to the system prompt. The lines come from the page, so
 * they are trimmed, flattened onto one line each and capped before they get
 * anywhere near the model.
 */
export function memoryBlock(memories) {
  const lines = (Array.isArray(memories) ? memories : [])
    .filter((line) => typeof line === 'string')
    .map((line) => line.replace(/\s+/g, ' ').trim().slice(0, MEMORY_LENGTH))
    .filter(Boolean)
    .slice(-MEMORY_LIMIT);

  if (!lines.length) return '';

  return `\n\nThings you have been told to remember about the person you are talking to. Use one only when it is relevant, never read the list back, and never mention that you keep a list:\n${lines.map((line) => `- ${line}`).join('\n')}`;
}

/**
 * What the turns ahead of a resumed call are. The items themselves carry the
 * conversation; this is the line that tells the model they are not this one.
 */
export function resumedBlock(resumed) {
  if (!resumed) return '';

  return '\n\nThe conversation before this point happened earlier, with the same'
    + ' person, and they have just come back to carry it on. Take it as said and'
    + ' pick up from it: no greeting them as a stranger, no summarising it back at'
    + ' them, and no remarking on the gap unless they do.';
}

/** GPT-Live owns speech; the Responses backend owns functions and lookups. */
export function sessionConfig(model, voice, {
  memories, memory = true, resumed, history,
  backendModel = 'gpt-5.6-terra', webSearch = true,
} = {}) {
  const input = (Array.isArray(history) ? history : [])
    .filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
    .slice(-40)
    .map((m) => ({
      type: 'message', role: m.role,
      content: [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text: m.content.slice(0, 6000) }],
    }));
  // A conservative UTF-8 byte budget also bounds tokens for non-English text.
  let bytes = input.reduce((n, m) => n + Buffer.byteLength(m.content[0].text), 0);
  while (bytes > 6000 && input.length) bytes -= Buffer.byteLength(input.shift().content[0].text);
  return {
    model,
    instructions: SYSTEM + '\nDelegate questions requiring reasoning, current information or memory changes to the backend. Keep listening while it works. Only report actions as successful after the backend confirms them.'
      + memoryBlock(memory ? memories : []) + resumedBlock(resumed),
    input,
    audio: { output: { voice } },
    delegation: {
      type: 'responses',
      responses: {
        model: backendModel,
        instructions: 'You support Carol, a bookish retired librarian who knits, in a live voice conversation. Resolve the latest request using the conversation and tools. Return concise verified results for Carol to speak. Never claim a tool succeeded without its result.'
          + (webSearch ? ' Use web search for current information and include source citations.' : '')
          + memoryBlock(memory ? memories : []),
        tools: [...(webSearch ? [{ type: 'web_search' }] : []), ...buildTools({ memory }).map((tool) => ({ ...tool, strict: false }))],
        tool_choice: 'auto',
        parallel_tool_calls: false,
      },
    },
  };
}
