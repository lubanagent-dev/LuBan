# Model Center and Model Factory

> This page covers model onboarding, editable brain slots, and how "switching models without code changes" works.

**What it is**: model access has two strictly separated layers —

- **Connection info, in the database**: every model is a database record — a fixed key (e.g. `deepseek-chat`), provider, API URL, key reference, capability claims (Tool Calling / vision), and cost parameters. Registering, editing, and enabling/disabling are database edits that take effect at runtime.
- **Connection code, one module**: all the "how to talk to this API" code (client construction, parameter adaptation, vendor differences) lives in one dedicated module — the model factory (`lubanagent/model/`). Adding a vendor means code only in this module; business code and other modules are untouched.

An agent never binds directly to "a vendor's specific model"; it binds a **logical brain** slot. The initial presets are `fast` (routing/classification), `smart` (main reasoning), `cheap` (low-cost tasks), and `vision` (multimodal); you can also add your own slots, e.g. `support`. Slot → model key → connection record in the database, all resolved at runtime.

**Switching models = repointing the database mapping to another fixed key — no code change, no release.** Moving `smart` from `deepseek-chat` to `qwen3-max` is one mapping edit: agent definitions stay untouched, new Runs immediately use the new model, and historical Run Traces still faithfully record the old model.

**Why it exists**: swapping models (price hikes, quality drops, new releases) is a data operation, not an engineering schedule; adaptation differences converge in one factory module instead of leaking into business code — abstractions leak, so the adaptation surface must stay narrow; model capabilities are declared at registration and validated before execution, falling back in a **controlled way** to an available model instead of crashing.

**Onboarding**: everything uses the **OpenAI-compatible protocol** — one client covers DeepSeek, Qwen, GLM and other vendors plus self-hosted vLLM / Ollama; vendor-native SDK factories can be added as needed.

**How to use it**: open the workbench "Model center", register the model first, then choose the mapped model for each brain slot. The page uses the server's current environment and back-fills existing mappings. Click "Add slot" to fill in key, name, and purpose; "Edit" changes those three or adjusts the mapping. The agent's primary and fallback slot dropdowns follow the current catalog.

Keys must start with a lowercase letter, followed by lowercase letters, digits, underscores, or hyphens, 1–64 characters total. The name is for display; the purpose note is optional. Renaming keeps the old key as a compatibility alias and moves all environment mappings to the new key; old agent versions and historical Runs are not rewritten, and newly saved versions use the new key. A new key cannot collide with another slot's current key or historical alias.

You can also add a slot and bind a model in one API call (the request uses the default server environment):

```bash
curl -X POST http://localhost:8000/v1/brain-profiles \
  -H "Content-Type: application/json" \
  -d '{"key":"support","name":"客服大脑","description":"客服问答","model_key":"deepseek-chat"}'
```

Illustrative mapping:

```text
Model registry (database):
key=deepseek-chat  provider=deepseek  base_url=https://api.deepseek.com/v1  api_key_env=DEEPSEEK_API_KEY  capability={tool_calling: true}
key=qwen-vl-max    provider=qwen      base_url=...                          api_key_env=DASHSCOPE_API_KEY  capability={tool_calling: true, vision: true}

Logical brain mappings (database, configured per environment; agents choose slots):
smart  → deepseek-chat
vision → qwen-vl-max
```

**Boundary**: before deletion, the agents, versions, and fields using the slot are listed. As long as any saved runnable historical version still uses the primary slot, the fallback slot, or implicitly uses `cheap` via summary memory, the backend refuses deletion (409) and does not touch the catalog or mappings; editing only the current version cannot release old-version references. Without references the slot can be deleted — including the initial presets; deletion removes all environment mappings and will not be restored by restart. After deleting unused `smart`/`cheap`, later default agents, eval judges, or summarization need explicit reconfiguration and are not auto-restored.

Viewing the catalog, usage list, and mappings requires `config:read`; adding/editing/deleting slots and saving mappings require `config:write`. Backend authorization and deletion checks are the final constraint. Connection code stays centralized in the model factory; vendor-native (non-OpenAI-compatible) SDKs need a factory adapter. More replacement notes are in the [customization guide](../customization/overview.md).
