# ai-or-not

The API now consumes a dataset file at `public/ai-images/dataset.json`. Each entry stores:
- real-image metadata (`source_url`, `author`, `captured_at`, `source_name`)
- generation metadata (`model`, `prompt`, verifier outcome)
- local serving paths for generated and real images

The dataset model is sized for up to `100` slots by default.

To list the currently available OpenRouter Gemini models:

```bash
bun run openrouter:list-models
```

To generate local replacement images with OpenRouter and iterate prompts until the Gemini reviewer is uncertain or low-confidence:

```bash
export OPENROUTER_API_KEY=...
bun run openrouter:generate-images
```

The reviewer pass is now blind A/B: it is not told which image is generated. This makes the holdout metric meaningful for the adversarial objective (lower reviewer success is better).

If a run stalls or is interrupted, resume without regenerating completed outputs:

```bash
bun run openrouter:generate-images -- --resume --start-index=12
```

This pipeline currently defaults to:

- `google/gemini-3.1-flash-image-preview` for image generation
- `google/gemini-3-flash-preview` for image review (closest OpenRouter match for Gemini 3.0 Flash with multimodal image input)

You can override either default with `OPENROUTER_GENERATION_MODEL` and `OPENROUTER_REVIEW_MODEL`.
You can also set `OPENROUTER_REQUEST_TIMEOUT_MS` (or pass `--request-timeout-ms=<ms>`) to control per-request timeout behavior.
For stronger adversarial tuning, increase `OPENROUTER_MAX_ATTEMPTS` (for example `8`).

The script writes final checked-in app assets to `public/ai-images/ai-*.jpg`, writes intermediate attempts under `dist/openrouter-attempts/`, and writes a review log to `public/ai-images/openrouter-review-report.json`.

Daily dataset automation:

```bash
# one new daily item (or replace oldest slot once full)
bun run dataset:daily

# backfill until target_size (100 by default)
bun run dataset:fill
```

Daily pipeline behavior:
- sources random non-stock real photos from Wikimedia Commons
- asks Gemini/OpenRouter to produce a photoreal generation prompt
- generates an AI counterpart and loops verifier checks until detection risk is low
- writes/updates `public/ai-images/dataset.json`
- writes per-run logs to `public/ai-images/daily-pipeline-report.json`

Example cron command (local machine or CI runner with write access):

```bash
0 2 * * * cd /home/me/Projects/morgaesis/ai-or-not && set -a && source ~/.env && set +a && bun run dataset:daily
```

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.11. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
