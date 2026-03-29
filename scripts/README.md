This directory contains repo-local utility scripts.

`generate-openrouter-images.ts` defaults to:
- generation model: `google/gemini-3.1-flash-image-preview`
- review model: `google/gemini-3-flash-preview` (Gemini 3.0 Flash style reviewer with image input support on OpenRouter)

Supported recovery flags:
- `--resume` reuses existing `public/ai-images/ai-<index>.jpg` files instead of regenerating them.
- `--start-index=<n>` starts generation from image index `n`.
- `--request-timeout-ms=<ms>` sets OpenRouter request timeout for this run.

Review behavior:
- The reviewer compares blind `Image A` vs `Image B` and must guess which is AI.
- Attempt selection minimizes reviewer detection risk (correct, confident identification).

`daily-dataset-pipeline.ts` manages the dataset consumed by the backend:
- stores metadata in `public/ai-images/dataset.json`
- keeps a `target_size` dataset model (default `100`)
- pulls random non-stock candidates from Wikimedia Commons with source metadata
- asks Gemini/OpenRouter to derive a generation prompt from the reference
- generates and verifies until detection risk is low enough
- saves AI images to `public/ai-images/ai-<slot>.jpg`
- saves real references to `public/real-images/real-<slot>.jpg`

Useful commands:
- `bun run dataset:daily` for one daily generation/replacement run
- `bun run dataset:fill` to backfill until dataset size reaches `target_size`

Cron-style automation example:
- `0 2 * * * cd /home/me/Projects/morgaesis/ai-or-not && set -a && source ~/.env && set +a && bun run dataset:daily`
