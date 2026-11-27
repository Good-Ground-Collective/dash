# @good-ground-collective/agentic-communication-standards

Zod schemas for the messages that pass between Dash's components: Mission Control, the web app, the hooks and the bench daemon. Each component builds against this package, so nobody keeps a hand-synced copy of a message shape.

## Install

The package is published to GitHub Packages. Map the scope and supply a token with `read:packages`:

```sh
echo '@good-ground-collective:registry=https://npm.pkg.github.com' >> .npmrc
echo '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}' >> ~/.npmrc
pnpm add @good-ground-collective/agentic-communication-standards
```

## The envelope

Every message has the same outer fields:

| Field           | What it holds                                                |
| --------------- | ------------------------------------------------------------ |
| `schemaVersion` | `"<major>.<minor>"`, versioned per message kind              |
| `kind`          | A dotted message name, such as `example.ping`                |
| `id`            | A UUID, unique per message, so receivers can drop duplicates |
| `emittedAt`     | An ISO 8601 UTC timestamp, such as `2026-11-27T09:30:00Z`    |
| `payload`       | The message-specific body                                    |

Sender identity, sessions and sequence numbers are not part of the envelope yet.

```ts
import { examplePing } from '@good-ground-collective/agentic-communication-standards';

const ping = examplePing.schema.parse(JSON.parse(body));
```

## Adding a message

1. Create `src/messages/<area>.ts` and construct a `MessageDefinition` with the kind, the starting version (`1.0`) and a `z.object` payload. `src/messages/example.ts` is the model.
2. Add the definition to `messageRegistry` in `src/registry.ts`. Generators read the registry, so a message missing from it is missing from the generated schemas.
3. Export it from `src/index.ts`.

## Versioning rules

### Minor and major bumps

A minor bump (`1.0` → `1.1`) is any change an older reader can still read:

- adding an optional field
- adding a value to an enum marked open

A major bump (`1.4` → `2.0`) is any change that can break an existing reader or writer:

- removing or renaming a field
- making a field required
- narrowing a type
- adding a value to a closed enum

### How readers behave

- Readers ignore fields they don't know. Wire schemas use `z.object`, which strips unknown keys, never `z.strictObject`.
- Readers reject a message whose major version they don't know, and accept any minor version of a major they do. `MessageDefinition` builds this into `schemaVersion`: a `1.0` definition accepts `1.0` and `1.7` and rejects `2.0`.

### Keeping schemas portable

Wire schemas avoid transforms and refinements that JSON Schema can't express, so the generated JSON Schema says the same thing as the Zod schema. Prefer `.min()`, `.max()`, `.regex()`, `z.enum` and `z.literal` over `.transform()`, `.refine()` and `.superRefine()`.

### The package version

The package's own major version moves only when a message's major version moves. New messages and minor message bumps are minor package releases.

## Telemetry attributes

Telemetry attribute names follow the [OpenTelemetry GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions/blob/v1.45.0/docs/registry/attributes/gen-ai.md), so the same attributes can go out over OTLP later without renaming anything. `genAiAttributes` holds the names, `telemetryAttributesSchema` is a flat, all-optional attribute set that messages embed, and `genAiSemconvVersion` is the pinned release, `1.45.0`.

```ts
import {
  genAiAttributes,
  telemetryAttributesSchema,
} from '@good-ground-collective/agentic-communication-standards';

const attributes = telemetryAttributesSchema.parse({
  [genAiAttributes.requestModel]: 'claude-opus-4-1',
  [genAiAttributes.usageInputTokens]: 1200,
});
```

### The `dash.*` rule

Anything the semantic conventions don't cover goes under `dash.*`, in `dashAttributes`. Never put a field of our own under `gen_ai.*`: a later semconv release could claim the name with a different meaning.

### The pinned release

The GenAI conventions are still in development, and names change between releases. `src/telemetry/semconv-v1.45.0.json` lists every `gen_ai.*` attribute in the pinned release, and a test fails if a constant names one that isn't on the list. Deprecated names, such as `gen_ai.system` and `gen_ai.usage.prompt_tokens`, are left off it. Moving to a new release is a deliberate change with its own pull request: replace the list, bump `genAiSemconvVersion`, and rename any constants the release renamed.

In 1.45.0 the core registry marks the GenAI attributes as moved to the [semantic-conventions-genai](https://github.com/open-telemetry/semantic-conventions-genai) repository, where they are still in development. Its first release, 0.1.0, renames `gen_ai.usage.cache_creation.input_tokens` to `gen_ai.usage.cache_write.input_tokens`.

### Mapping

| Attribute                                  | Stability in semantic-conventions-genai | What it means for Dash                                        |
| ------------------------------------------ | --------------------------------------- | ------------------------------------------------------------- |
| `gen_ai.provider.name`                     | Development                             | The model provider, such as `anthropic` or `openai`           |
| `gen_ai.request.model`                     | Development                             | The model an agent asked for                                  |
| `gen_ai.response.model`                    | Development                             | The model that answered, which can differ from the request    |
| `gen_ai.operation.name`                    | Development                             | What the agent was doing, such as `chat` or `execute_tool`    |
| `gen_ai.conversation.id`                   | Development                             | The harness session, such as a Claude Code session ID         |
| `gen_ai.agent.id`                          | Development                             | The agent's unique ID                                         |
| `gen_ai.agent.name`                        | Development                             | The agent's human-readable name                               |
| `gen_ai.tool.name`                         | Development                             | The tool an agent called                                      |
| `gen_ai.usage.input_tokens`                | Development                             | Input tokens, including cached ones                           |
| `gen_ai.usage.output_tokens`               | Development                             | Output tokens                                                 |
| `gen_ai.usage.cache_read.input_tokens`     | Development                             | Input tokens served from the provider's prompt cache          |
| `gen_ai.usage.cache_creation.input_tokens` | Development                             | Input tokens written to the provider's prompt cache           |
| `dash.usage.cost_usd`                      | Dash                                    | What the usage cost, in US dollars; semconv has no cost field |

What gets reported, and when, belongs to the heartbeat and telemetry discussions.

## License

MIT
