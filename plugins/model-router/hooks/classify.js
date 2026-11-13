#!/usr/bin/env node
// UserPromptSubmit hook: classify the prompt into a tier and tell Claude which
// model-pinned subagent should do the work. Fails open: on any error it prints
// nothing and exits 0, so a broken router never blocks a prompt.
'use strict';

const OVERRIDE = /^\s*\/tier\s+(haiku|sonnet|opus)\b/i;

const SIGNALS = {
  opus: {
    weight: 3,
    patterns: [
      /\b(architect(ure)?|design (a|the|an)|trade-?offs?|root cause|debug(ging)? (a |the )?(complex|intermittent|race)|security|vulnerab\w*|threat model|migration plan|refactor (the )?(whole|entire|across)|system design|strategy|decision)\b/i,
      /\b(why (is|does|did|would)|analy[sz]e|evaluate|compare .* (and|vs\.?|versus) )\b/i,
      /\b(across (all |the )?(files|modules|services|repo)|end-to-end|multi-?step)\b/i,
    ],
  },
  haiku: {
    weight: 2,
    patterns: [
      /^\s*(list|show|count|rename|format|translate|typo|spell|lint|grep|find|what is|what's|define|convert|sort|add a comment|summari[sz]e (this|the) (short|following))\b/i,
      /\b(one[- ]line|quick(ly)?|just (tell|give|show)|yes or no|boilerplate|rename this|fix the typo)\b/i,
    ],
  },
};

const CODE_BLOCK = /```[\s\S]*?```/g;

function classify(prompt) {
  const text = prompt.trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  const codeBlocks = (text.match(CODE_BLOCK) || []).length;
  const scores = { haiku: 0, sonnet: 1, opus: 0 }; // sonnet is the default

  for (const tier of ['opus', 'haiku']) {
    for (const p of SIGNALS[tier].patterns) {
      if (p.test(text)) scores[tier] += SIGNALS[tier].weight;
    }
  }

  // Size and shape signals.
  if (words > 250) scores.opus += 2;
  else if (words > 120) scores.opus += 1;
  if (words <= 25 && codeBlocks === 0) scores.haiku += 1;
  if (codeBlocks >= 2) scores.opus += 1;
  const scope = text.match(/\b(\d+)\s+(files|functions|tests)\b/i);
  if (scope && Number(scope[1]) >= 5) scores.opus += 2;

  // Pick highest score; ties go to sonnet (the middle tier).
  let tier = 'sonnet';
  if (scores.opus > scores.sonnet && scores.opus >= scores.haiku) tier = 'opus';
  else if (scores.haiku > scores.sonnet && scores.haiku > scores.opus) tier = 'haiku';
  return { tier, scores, words };
}

function buildContext(tier, source) {
  const agent = `${tier}-worker`;
  return [
    `[model-router] Tier for this prompt: ${tier.toUpperCase()} (${source}).`,
    `Do the work by delegating to the \`${agent}\` subagent (pinned to ${tier}) using the Agent tool.`,
    'Pass the user request to it in full, with any file paths, constraints and context it needs.',
    'Return its result to the user, in your own words only where a short summary helps.',
    'Only answer directly, without delegating, if the request is a pure conversational reply such as a greeting or thanks.',
    'Do not change the main session model. This tier is a routing decision, not a model switch.',
  ].join(' ');
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(raw || '{}');
      const prompt = String(input.prompt || '');
      const override = prompt.match(OVERRIDE);
      // Skip slash commands, except /tier which is our own override.
      if (!prompt.trim() || (prompt.trim().startsWith('/') && !override)) return;

      const { tier, scores, words } = override
        ? { tier: override[1].toLowerCase(), scores: null, words: 0 }
        : classify(prompt);
      const source = override
        ? 'user override with /tier'
        : `score h=${scores.haiku} s=${scores.sonnet} o=${scores.opus}, ${words} words`;

      const out = {
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: buildContext(tier, source),
        },
      };
      process.stdout.write(JSON.stringify(out));
    } catch (err) {
      // Fail open: a router error must never block the prompt.
    }
  });
}

if (require.main === module) main();
module.exports = { classify };
