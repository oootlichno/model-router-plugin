# model-router plugin

Routes each prompt to a model tier. A `UserPromptSubmit` hook classifies the prompt as **haiku**, **sonnet** or **opus**, then tells Claude to hand the work to the subagent pinned to that tier:

| Tier   | Subagent        | Model  | Typical work                                              |
|--------|-----------------|--------|-----------------------------------------------------------|
| haiku  | `haiku-worker`  | Haiku  | renames, formatting, lists, lookups, one-line answers     |
| sonnet | `sonnet-worker` | Sonnet | everyday coding, tests, small debugging (default tier)    |
| opus   | `opus-worker`   | Opus   | architecture, trade-offs, security, hard bugs, big refactors |

## How it works

1. `hooks/classify.js` reads the prompt from stdin, scores it with keyword and size signals, and picks a tier.
2. It returns the tier as `additionalContext`, which Claude sees before answering.
3. Claude calls the Agent tool with the matching subagent. Each subagent's `model:` frontmatter pins the model.

## Important limits

- A hook cannot switch the model of the main session. Routing works by delegation, so the main session keeps its own model and only the subagent runs on the tier model.
- The hook's guidance is advisory. Claude normally follows it, but it can deviate.
- Classification is heuristic (keywords, length, code blocks), not a model call. It costs nothing and adds no latency, but it is less accurate than an LLM classifier.

## Manual override

Start a prompt with `/tier haiku`, `/tier sonnet` or `/tier opus` to force a tier. Other slash commands are not classified.

## Install and test

Load it for one session:

```
claude --plugin-dir "./model-router-plugin"
```

Check the classifier alone:

```
node hooks/classify.js   (pipe in: {"prompt":"rename foo to bar"})
```

For a team or enterprise rollout, publish the folder to a plugin marketplace or distribute it through managed settings, following your organization's plugin policy.

## Tuning

Edit the `SIGNALS` patterns and the size thresholds in `hooks/classify.js`. Test with `node -e` against `classify()` (exported), then restart the session to pick up changes.

## Install

```
/plugin install model-router --marketplace oootlichno/model-router-plugin
```

The repo is private, so this needs GitHub read access on your machine. If your organisation distributes the plugin through claude.ai Organization settings, it is installed for you and this step is not needed.
