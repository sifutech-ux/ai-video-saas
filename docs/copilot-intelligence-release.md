# BeShare Copilot intelligence — build for sequential acceptance tests

Status: implemented and locally verified; NOT deployed to production. The existing text and buffered speech deployment remains on 978966e. Realtime is disabled unless COPILOT_REALTIME_ENABLED=true.

## Included

1. Account memory: product/prices, target customers, location, channels, marketing budget and goals. Editable, clearable, versioned and isolated by authenticated owner.
2. Account-backed advice: /api/copilot/bijak fetches authoritative memory, goal, this week's tasks and 90-day numbers before using the existing quota/settlement flow. Decimal arithmetic runs in the account service; totals distinguish missing records from zero and MYR from counts. Returns week, previous week, month and full-window totals, with a labelled 50-entry detail sample.
3. Confirmed actions: model returns proposals for MYR income/cost or current-week tasks. Signed settlement stores the proposals and account versions. Browser submits only the stored proposal ID plus explicit confirmation. Account server checks ownership and versions and applies the group in one transaction. Receipt replay prevents duplicate writes. Existing Angka withdrawal and Plan editing remain available.
4. Today's focus: deterministic suggestions from saved goals, first unfinished task and actual weekly records; refresh on navigation/account data changes. No model cost for dashboard refresh. A user-triggered follow-up requests AI guidance.
5. Flexible answers: concise, analysis, plan, marketing and action responses, zero to five steps, preserved paragraphs, copy/shorten/tone/edit controls and an add-to-plan control for marketing work. Edited marketing text is a temporary draft until copied.
6. Realtime conversation: browser WebRTC with server-mediated SDP, gpt-realtime-2.1, cedar voice, Malay transcription, interruptions, visible transcript, explicit start/stop and microphone cleanup. Uses the same read-only account context. Voice statements can be copied into the message composer for review and subsequent confirmed actions; voice itself does not write business records. Transcripts are ephemeral and clearly labelled in the UI.

## Integration order

- Account source is based on deployed sifutech-ux/beshare-ipo commit 6417db74a4cca2354a675cdee8ccea6e804410d1. New pelanggan_copilot.py must be included in the account image. Schema changes add only copilot_memory, copilot_action_receipt and copilot_voice_usage; existing records are retained. Do not deploy the trading bot or point this service at the IPO database.
- Advice source is based on codex/copilot-openai-activation at 9b4a27b6df6539b9d7b3edaa74ee6f7e0743af56. Keep the approved dedicated COPILOT_OPENAI_API_KEY, COPILOT_AKAUN_URL/HOST and quota secret. No key is put into browser code.
- Frontend uses /api/copilot/bijak and requires the account and advice versions above. Publish the frontend last. Existing /api/copilot/nasihat remains available for the older frontend.
- Realtime requires the persistent Docker Node server; its five-minute hangup timer is not suitable for an ephemeral serverless function. Ten session-start attempts per account per Malaysia day are persisted. One active call per account is enforced within this single Node process. A failed provider start consumes one allowance conservatively. On process restart the in-memory call map is lost; browser stop still closes media, and provider expiry is the final backstop. Multi-worker deployment needs a shared call registry and durable expiry worker before enabling voice.
- Stage all three services together against an isolated account database. Keep production untouched until sequential acceptance checks succeed. An additive-schema rollback restores previous account/advice images and frontend paths without deleting the new tables or user data.

## Verification

Automated: 120 tests pass: 40 targeted advice/backend tests, 7 frontend audio/lifecycle tests, 41 SQLite account tests and 32 PostgreSQL tests (24 existing and 8 intelligence variants). The PostgreSQL 16.15 fixture completed on 13 November 2026 (Malaysia) in 53.180 seconds with zero errors, failures or skips. Both temporary containers exited with code 0; production containers retained their IDs and healthy status. Evidence is saved in account PR #47 at docs/qa/postgres-2026-11-13.json. Next production webpack build and TypeScript checks pass.

Live provider acceptance on 13 November 2026: seven real Responses calls passed eight integration checks using synthetic accounts and an isolated, guarded PostgreSQL account database over verified TLS. Verified RM8.00 memory, updated RM9.50 price, proposed RM350 income/RM120 cost with owner confirmation and replay protection, exact RM230 difference, marketing paragraphs persisted in account, a saved weekly task, and absent records described as missing rather than RM0. The actual Next route handler functions were exercised with real Request/Response objects; this was not a newly deployed Next HTTP server.

Realtime: actual route setup returned HTTP 201 from the provider; duplicate session and foreign-owner stop checks passed. The first browser media attempt failed after delayed manual SDP delivery. A fresh call through the same createRealtimeCall adapter, with the browser automatically accepting the delivered SDP, connected successfully. AI-generated WAV input was transcribed as “Berapakah harga lati saya sekarang?”; generated output correctly stated RM9.50. Chrome received 188286 audio bytes before the acceptance snapshot. The pronunciation/transcription variation is retained in the evidence. Microphone capture and human listening were not assessed. Provider hangup was confirmed and the retry container exited 0. Both live fixtures are stopped and production retains its healthy containers. Evidence: docs/qa/live-copilot-2026-11-13.json.

Opt-in reproduction helpers: tests/live-copilot-fixture.py, tests/live-copilot-intelligence.mts and tests/live-copilot-browser.html. These use the approved server-side key file and synthetic fixture secrets only; no standard API key is returned to the browser. After preparing live-audio.json and arming the browser's automatic answer polling, write shared/media-ready.json in the fixture to allow SDP creation. This explicit test-only gate was added after the manual relay timeout. They are test helpers, not deployment entrypoints. Do not treat the earlier whole-run media timeout as a passing combined staging test.

Browser UI: real local account service with a temporary synthetic SQLite database and explicitly labelled model fixtures. Verified memory persistence across reload, action preview/confirmation, RM350 income + RM120 cost, confirmed-status replay, marketing paragraphs/editor, add-to-plan and refreshed focus. Inspected desktop 1440x1000 and phone 390x844; profile form fits the 390px viewport. Provider calls and acoustic quality were not verified by these fixture tests.

Commands:

```sh
node --experimental-strip-types --import ./tests/resolve-ts.mjs --test tests/copilot-kuta.test.mts tests/copilot-nasihat.test.mts tests/copilot-route.test.mts tests/copilot-openai.test.mts tests/copilot-intelligence.test.mts tests/copilot-realtime-route.test.mts tests/penasihat-kuota.test.mts tests/penasihat.test.mts
npx tsc --noEmit
npx next build --webpack
```

In the account checkout: `python3 -m unittest discover -s tests`. For the frontend: `node --test tests/copilot-ai-audio.test.mjs tests/copilot-intelligence-ui.test.mjs`.

## Acceptance order

1. Save product and price, reload, ask AI about that product, edit the price and verify next answer. Check another account cannot read it.
2. Enter known MYR income/cost and unit counts. Ask about the stated week/month and verify exact totals. Check the empty account yields missing data, not invented zero or profit.
3. Ask “Catat jualan hari ini RM350 dan kos RM120”. Verify no records before confirmation; confirm once; reload/retry and verify exactly two records. Change a proposed plan's version and verify stale proposal rejection.
4. Add/complete a plan task and edit the goal; verify focus updates and the CTA opens the correct workflow.
5. Ask a simple question, a plan and a marketing draft. Verify response shape, paragraph persistence, copy, shortening, editing and adding a marketing task.
6. Enable Realtime only on staging. Test allowed/denied microphone, Malay conversation, interruptions, transcript-to-composer, stop, logout, page hide, disconnection and five-minute expiry on Mac and iPhone. Actual provider/model access and synthetic WebRTC speech input/output passed on 13 November 2026. Physical microphones, acoustic quality and paired full-app staging acceptance still remain.

Local synthetic preview (account checkout): `python3 tests/preview.py ../copilot-aurora-review`, then http://localhost:8000/qa. This fixture harness binds loopback only and is never part of deployment.
