# 07 · Communication standards

## What we know
- A package of schemas that defines the interfaces between components: heartbeats, telemetry, and the API.
- Other organisations may eventually keep their own mirror. For now, only the GGC package exists.

## Starting recommendation
- **Zod 4 is the source of truth.** Generate JSON Schema with `z.toJSONSchema`, then Go structs from that for the daemon. That's one source and no hand-synced copies.
- Every message carries `schemaVersion`. Add fields freely; only bump the major version for breaking changes.
- Publish as `@good-ground/dash-standards` (or similar) through GitHub Packages or npm.

## Questions
1. Name, and public or private?
2. Go codegen tool: quicktype, go-jsonschema, or hand-written and validated in tests?
3. Versioning: semantic-release, or changesets?
4. API contracts: OpenAPI generated from Zod, or schemas only?
5. Do we borrow OpenTelemetry GenAI attribute names now, to make OTLP export easier later?

## Done when
The source-of-truth plan, package name and versioning are agreed.
