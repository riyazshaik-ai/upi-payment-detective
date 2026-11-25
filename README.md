# UPI Payment Detective

A local portfolio prototype for a support analyst investigating **one disputed order**. The buyer says “₹1,249 was debited”; the merchant cannot yet see confirmation. Replay separate order, gateway, and bank records and see exactly which source supports each status.

**All data is synthetic. No keys, payment APIs, real transactions, or external calls during a replay. The two roles execute deterministic rules; no LLM runs.**

## Run locally

Requires Node.js 20+ and npm. The downloadable ZIP includes a built copy: unzip it, open a terminal in `upi-payment-detective`, and run `npm start` (no keys or dependency install for this mode). To rebuild from source, use the commands below. The first npm install needs internet.

```sh
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:4173` on the same computer. Choose a scenario, click **Replay**, then click an evidence ID or move the **Arrival order** slider. Left/Right/Home/End work on the focused slider. Stop the local server with Ctrl+C.

```sh
npm test
npx playwright install chromium  # once, if Chromium isn't already available
npm run test:browser             # requires npm run build first
```

`CHROMIUM_PATH` may point to an installed compatible Chromium. Browser tests save screenshots under `test-output/`.

## Five replay scenarios

| Synthetic input | Final capture status | Final settlement status |
|---|---|---|
| Late confirmation | Captured | Unknown — no merchant credit |
| Merchant credited | Captured | Confirmed — reference and amount match |
| Out-of-order resend | Captured | Confirmed — 1 resend ignored |
| Payer debit only | Unconfirmed | Unknown — debit is not credit |
| Two candidate credits | Captured | Ambiguous — no unique linked credit |

## How it works

```text
Fixture → arrival order / replay cursor → deduplicate by ID and event fingerprint
                                           │
                           ┌───────────────┴─────────────────┐
                           ▼                                 ▼
                  Order + gateway rows                  Bank rows only
                  Lifecycle investigator               Settlement verifier
                           └───────────┬─────────────────────┘
                                       ▼
                           Evidence validation gate
                 Timed Node SSE snapshots → React evidence timeline
```

- `src/engine.ts`: Both source-scoped roles return typed status and evidence IDs. The gate checks the proposals against source criteria. An invented or contradictory citation, a runner error, or an unresolved match cannot assert settlement. In this prototype only the verified text is displayed.
- `src/fixtures.ts`: Invented cases, paise as integers, separate UTC event/arrival stamps displayed as IST. Same amount is **not** a duplicate or a sufficient reference match.
- `server.mjs` / `src/main.tsx`: One typed replay stream per run, one normalized arrival sequence, and a cursor over the received snapshots. Switching cases cancels the old stream and resets the evidence drawer; run and fixture IDs guard against stale results. With the HTTP server bound to loopback, there are no public routes or real accounts involved.
- **Claude extension, not implemented:** Keep `EvidenceRoles` as the proposal boundary. An async Claude adapter can pass each role only its approved fixture slice, require structured output matching `Claim`, and validate cited IDs with the gate before emitting each snapshot. The checked-in app uses the no-key adapters only. This is an orchestration demo, not proof of LLM accuracy.

## 90-second interview walkthrough

**0–25s:** Select **Late confirmation**, click Replay, and inspect gateway capture and payer debit. They are separate records. Bank settlement stays unknown.

**25–50s:** Replay **Merchant credited** and click the bank citation. Point out the matching reference and amount, and that there is now positive evidence for both capture and merchant credit.

**50–70s:** Show **Out-of-order resend**. Scrub across the old failure and replayed capture. A last-webhook-wins design would give misleading output; matching and deduplication preserve the known capture.

**70–90s:** Select **Two candidate credits**. Equal amounts alone cannot identify which order received payment. Explain the trade-off: narrower, independently scoped roles and explicit abstention make the workflow more auditable than a single freeform verdict.

## Scope

No bank statements, integrations, refunds, user uploads, production reconciliation, or financial advice. This reconstructs one disputed case; it does not replace a reconciliation system. RBI's [failed-transaction circular, Annex §4(b)](https://www.rbi.org.in/commonperson/English/Scripts/FAQs.aspx?Id=3074) is background for the scenario. A production integration would need authenticated, complete, provider-specific records and separate verification.
