# Copilot OpenAI activation — 12 November 2026

Base: deployed advice commit `0598dc836be082b87e8ab52565946b9ee4722b0f`, not the older backend main.

## Behavior and configuration

- `COPILOT_AI_PROVIDER=openai` selects Responses with `gpt-6-luna`, low reasoning and verbosity,
  and a 1,600-token budget for the existing 80-word answer / three-action contract.
- Explicitly provision `COPILOT_OPENAI_API_KEY` on advice. The generic Studio key is not borrowed.
  Credentials never enter frontend assets, build arguments or source control.
- Unset provider or `gemini` retains Gemini; unknown provider values fail closed.
- Account profile, quota reservation/settlement and replay are retained. Replays use `tersimpan`
  as source because the account replay contract does not return the original provider.
- OpenAI read-aloud returns base64 WAV using `gpt-4o-mini-tts` / `cedar`. Copilot speech requires
  an account session and per-account/IP rate limits. Gemini speech now explicitly uses the Copilot key.
- The paired frontend patch sends bearer authentication for speech, accepts OpenAI and replayed
  responses and labels generated speech. Publish this compatible frontend before switching advice.
- `store:false` disables Responses storage, not abuse-monitoring retention. No Zero Data Retention
  or regional entitlement has been verified. Application conversation storage is unchanged.
- No automatic retries or cross-provider fallback. Incomplete, refused or failed model output
  is never represented as a successful model response.

## Deployment and rollback

The user authorized the existing OpenAI key and Copilot activation. **Not deployed yet.**

1. Verify the advice image and save compose/config for rollback, without printing secret values.
2. Build a new advice image from the reviewed source using the existing production build procedure.
3. Publish the paired frontend JavaScript and cache-version update.
4. In `/opt/beshare-copilot-production`, securely provision the approved key as
   `COPILOT_OPENAI_API_KEY`; map it and `COPILOT_AI_PROVIDER=openai` into advice only.
5. Set the new advice image and restart only advice:
   `docker compose -p copilot-production up -d --no-deps --no-build --pull never --wait advice`.
6. Test a synthetic Malay question in a controlled account, reload to check persistence,
   and press Dengar suara AI to verify decoded audible playback. Check 401 without authentication
   and idempotent replay without a second provider call.
7. Restore the saved advice image/config if verification fails. The frontend remains compatible
   with the prior backend. Do not restart account, database, WhatsApp or Studio.

## Validation

```sh
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --experimental-strip-types --import ./tests/resolve-ts.mjs --test tests/copilot-kuta.test.mts tests/copilot-nasihat.test.mts tests/copilot-route.test.mts tests/copilot-openai.test.mts tests/penasihat-kuota.test.mts tests/penasihat.test.mts
```

32 focused tests and type checking passed with synthetic provider/account responses.
They do not verify live model access or voice quality. The broader suite requires an isolated
account checkout via `COPILOT_TEST_AKAUN_ROOT` and executable ffmpeg; these prerequisites are absent.
The approved local key is present, but the live `/v1/models` request timed out. Terminal approval
also timed out twice. No production settings or secrets have been written.

## Speech maintenance deadline

Current OpenAI documentation says `gpt-4o-mini-tts` shuts down on **6 January 2027**.
This short-term release preserves buffered playback. A Realtime adapter must replace it before
that deadline; Realtime is not implemented here.

References checked 12 November 2026:
- https://developers.openai.com/api/docs/guides/text-to-speech
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/guides/structured-outputs
