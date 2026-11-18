# Prompt Library: Dual-Track Instructions

> This page covers the two ways to write an agent's system prompt — inline and referencing the prompt library — plus three easy-to-miss semantics of referencing. For prompt-library page operations, see the [developer workbench](./workbench.md).

An agent's instructions (system prompt) can be written in two ways, switchable at any time:

- **Inline** (default): write the prompt directly in the definition's `instructions` field. Agents imported once from YAML are like this; existing agents and YAML import behave exactly as before.
- **Reference the prompt library**: set `prompt_key` in the definition (optionally pinning `prompt_version`) to point to a prompt in the library. The same prompt can be reused by many agents — edit one draft and publish one new version instead of maintaining a copy per agent.

References are **resolved at save time**: the system takes the prompt's current version (or your pinned version) and writes its full text into this agent definition's `instructions`, merging variables (the agent's own same-name variables win). So the agent version snapshot stores the **resolved full text** — running and replay read only the snapshot and never query the prompt library again.

Three easy-to-miss semantics:

1. **A new prompt version does not take effect automatically**: after the library publishes v3, agents referencing it won't silently change — to consume the new version, an agent must explicitly save a new version (clear `prompt_version` when publishing to take the current one).
2. **Passing the whole definition back pins the old version**: while editing other agent fields (say, changing the brain), the form resubmits the old `prompt_version`, so the new version keeps the old prompt content — editing an unrelated field will not quietly swap the prompt.
3. **Leaving a reference**: in the agent editor, "convert to inline" moves the content verbatim into `instructions`; afterwards there is no link to the prompt library.

Drafting, publishing, version history, and assignment to agents all happen on the workbench's "Prompt library" page (see the [developer workbench](./workbench.md)).
