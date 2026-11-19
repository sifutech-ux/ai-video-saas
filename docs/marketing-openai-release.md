# Marketing OpenAI credential isolation

`POST /api/marketing/draf` uses only `MARKETING_OPENAI_API_KEY` on the advice
service. It retains the existing account session, business context, shared
`copilot_nasihat` quota, idempotency and settlement behavior. Draft responses use
the same structured format, `gpt-6-luna` model and 3,000-token budget as the
enhanced Copilot endpoint.

`/api/copilot/bijak`, legacy Copilot text, buffered speech and realtime voice keep
their existing configuration. A missing or blank Marketing key returns HTTP 503
before reserving quota or calling a provider. Marketing never borrows the
Copilot, Studio or Gemini credential, and the browser cannot select a key.

## Configuration and release order

1. Preserve the current advice image and Compose configuration for rollback.
   Build the backend with the existing provider retry/diagnostic fixes included.
2. Store the Marketing credential in a protected runtime environment file
   (mode 0600), as `MARKETING_OPENAI_API_KEY`. Map that file into the `advice`
   service alongside its existing environment files. Preserve
   `COPILOT_OPENAI_API_KEY`, `COPILOT_AI_PROVIDER`, account URL/host and quota
   secret. Credentials belong in neither source code nor build arguments.
3. Deploy the backend and recreate only `advice`; no account schema or worker
   configuration change is required. Check that unauthenticated draft requests
   return 401 before publishing the frontend that calls `/api/marketing/draf`.
4. Publish the paired Marketing frontend endpoint/cache update. Keep Business
   Copilot on `/api/copilot/bijak`. Verify a controlled draft and replay when a
   live provider check is authorized; mocked tests do not prove live key access.

For rollback, restore the paired Marketing frontend endpoint first, then the
saved advice image/configuration. Do not replace the existing Copilot credential.

## Local verification

```sh
node --experimental-strip-types --import ./tests/resolve-ts.mjs --test tests/marketing-draft.test.mts tests/copilot-openai.test.mts tests/copilot-provider-diagnostics.test.mts tests/copilot-intelligence.test.mts tests/copilot-realtime-route.test.mts
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Provider and account traffic in these tests is mocked with synthetic keys.
