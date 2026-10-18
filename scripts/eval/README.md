# Prompt eval harness

Dependency-free (Node 20+, built-in `fetch`). Runs 12 golden prompts against a running Create server and checks the responses.

    node scripts/eval/run.mjs                      # default http://localhost:3001
    BASE_URL=https://example.com node scripts/eval/run.mjs
    node scripts/eval/run.mjs --only edit,chat     # filter by group or case id substring
    node scripts/eval/run.mjs --strict             # treat WARN as failure (use with a real key)

Env: `BASE_URL`, `EVAL_TIMEOUT_MS` (default 90000). Exit code is 1 only when a case FAILs (or WARNs under `--strict`).

## Cases (`prompts.json`)

Groups: non-technical (bakery, wedding RSVP form, portfolio), technical (SaaS pricing with a `data` node, ops dashboard), edit (`/api/edit-node`), pointer (`/api/route-intent` with a pointer target), chat (`/api/ask` about a figure). A body field of `"$name"` is replaced by `screens.name` from the same file. Add a case by appending to `cases`.

## Statuses

- PASS: all checks passed.
- FAIL: contract check failed (HTTP status, response shape against what the shared schema promises, node count bounds, latency, intent fields, empty answer).
- WARN: only content checks failed (required node types, text patterns). The server reports `"mock": true` on `/api/health`, and mock output is canned, so these are expected there. Under a real key they are reported as FAIL.
- PENDING: the endpoint returned 404 (route not landed yet). Never fails the run.

Latency limits are per case (`maxLatencyMs`); route-intent is held to 2000 ms, generation to 60 s. The mode (mock or real) is recorded in the results file.

## Results

Each run writes `scripts/eval/results/<timestamp>.json` (mode, per-case status, latency, node counts, failure reasons). These are local artifacts: add `scripts/eval/results/` to `.gitignore` (the root `.gitignore` does not list it yet; this harness does not edit it).
