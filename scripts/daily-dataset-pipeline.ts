import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createCanvas, loadImage } from "canvas";

interface DatasetRealImage {
  display_url: string;
  source_url: string;
  source_name: string;
  author: string;
  captured_at: string | null;
  title: string | null;
  license: string | null;
}

interface DatasetGeneratedImage {
  path: string;
  model: string;
  prompt: string;
  generated_at: string;
  verifier_model: string;
  verifier_passed: boolean;
  verifier_attempts: number;
  verifier_confidence: number;
  verifier_detection_risk: number;
}

interface DatasetPipelineMeta {
  source_kind: "legacy-seed" | "wikimedia-random" | "manual-url";
  source_reason: string;
  attempts: AttemptSummary[];
}

interface DatasetEntry {
  id: string;
  slot: number;
  category: string;
  active: boolean;
  created_at: string;
  real: DatasetRealImage;
  generated: DatasetGeneratedImage;
  pipeline: DatasetPipelineMeta;
}

interface ImageDataset {
  version: number;
  target_size: number;
  updated_at: string;
  entries: DatasetEntry[];
}

interface CliArgs {
  dailyCount: number;
  fillToTarget: boolean;
  targetSize: number;
  maxAttempts: number;
  reviewsPerAttempt: number;
  maxCorrectRate: number;
  maxDetectionRisk: number;
  requestTimeoutMs: number;
  dryRun: boolean;
  seedUrl: string | null;
}

interface CommonsImageInfo {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  user?: string;
  timestamp?: string;
  mime?: string;
  extmetadata?: Record<string, { value?: string }>;
}

interface CommonsCandidate {
  mediaUrl: string;
  sourceUrl: string;
  sourceName: string;
  author: string;
  capturedAt: string | null;
  title: string;
  description: string;
  license: string | null;
  categoryHints: string;
}

interface ReferenceAnalysis {
  accepted: boolean;
  category: string;
  prompt: string;
  title: string;
  reason: string;
  avoid: string[];
}

interface ReviewResult {
  suspected_ai: "image_a" | "image_b" | "uncertain";
  confidence: number;
  can_tell: boolean;
  reasons: string[];
  prompt_adjustments: string[];
  revised_prompt: string;
}

interface ReviewTrial {
  candidate_first: boolean;
  suspected_ai: ReviewResult["suspected_ai"];
  confidence: number;
  can_tell: boolean;
  correct_identification: boolean;
  detection_risk: number;
  reasons: string[];
  prompt_adjustments: string[];
  revised_prompt: string;
}

interface AttemptSummary {
  attempt: number;
  prompt: string;
  correct_rate: number;
  detection_risk: number;
  avg_confidence: number;
  accepted: boolean;
  trials: ReviewTrial[];
}

interface InsertSlot {
  slot: number;
  replacedEntryId: string | null;
}

const DATASET_PATH = join(process.cwd(), "public", "ai-images", "dataset.json");
const DAILY_REPORT_PATH = join(
  process.cwd(),
  "public",
  "ai-images",
  "daily-pipeline-report.json",
);
const AI_OUTPUT_DIR = join(process.cwd(), "public", "ai-images");
const REAL_OUTPUT_DIR = join(process.cwd(), "public", "real-images");
const ATTEMPT_DIR = join(process.cwd(), "dist", "daily-pipeline-attempts");

const MODEL_LIST_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const COMMONS_URL = "https://commons.wikimedia.org/w/api.php";

const GENERATION_MODEL =
  process.env.OPENROUTER_GENERATION_MODEL ?? "google/gemini-3.1-flash-image-preview";
const REVIEW_MODEL =
  process.env.OPENROUTER_REVIEW_MODEL ?? "google/gemini-3-flash-preview";

const DEFAULT_TARGET_SIZE = Number(process.env.DATASET_TARGET_SIZE ?? "100");
const DEFAULT_MAX_ATTEMPTS = Number(process.env.OPENROUTER_MAX_ATTEMPTS ?? "10");
const DEFAULT_REVIEWS_PER_ATTEMPT = Number(
  process.env.OPENROUTER_REVIEWS_PER_ATTEMPT ?? "3",
);
const DEFAULT_MAX_CORRECT_RATE = Number(
  process.env.OPENROUTER_MAX_CORRECT_RATE_FOR_ACCEPT ?? "0.34",
);
const DEFAULT_MAX_DETECTION_RISK = Number(
  process.env.OPENROUTER_MAX_DETECTION_RISK_FOR_ACCEPT ?? "0.2",
);
const DEFAULT_REQUEST_TIMEOUT_MS = Number(
  process.env.OPENROUTER_REQUEST_TIMEOUT_MS ?? "180000",
);

const LEGACY_SEEDS: Array<{ real: string; aiIndex: number; category: string }> = [
  { real: "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=600&h=600&fit=crop", aiIndex: 0, category: "landscape" },
  { real: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&h=600&fit=crop", aiIndex: 1, category: "portrait" },
  { real: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=600&h=600&fit=crop", aiIndex: 2, category: "landscape" },
  { real: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&h=600&fit=crop", aiIndex: 3, category: "nature" },
  { real: "https://images.unsplash.com/photo-1529778873920-4da4926a72c2?w=600&h=600&fit=crop", aiIndex: 4, category: "animal" },
  { real: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=600&fit=crop", aiIndex: 5, category: "portrait" },
  { real: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=600&h=600&fit=crop", aiIndex: 6, category: "landscape" },
  { real: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=600&h=600&fit=crop", aiIndex: 7, category: "landscape" },
  { real: "https://images.unsplash.com/photo-1516117172878-fd2c41f4a759?w=600&h=600&fit=crop", aiIndex: 8, category: "architecture" },
  { real: "https://images.unsplash.com/photo-1493238792000-8113da705763?w=600&h=600&fit=crop", aiIndex: 9, category: "fantasy" },
  { real: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=600&fit=crop", aiIndex: 10, category: "architecture" },
  { real: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&h=600&fit=crop", aiIndex: 11, category: "fantasy" },
  { real: "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=600&h=600&fit=crop", aiIndex: 12, category: "nature" },
  { real: "https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=600&h=600&fit=crop", aiIndex: 13, category: "landscape" },
  { real: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&h=600&fit=crop", aiIndex: 14, category: "fantasy" },
  { real: "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=600&h=600&fit=crop", aiIndex: 15, category: "fantasy" },
  { real: "https://images.unsplash.com/photo-1465146633011-14f860dc2c2c?w=600&h=600&fit=crop", aiIndex: 16, category: "fantasy" },
  { real: "https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=600&h=600&fit=crop", aiIndex: 17, category: "fantasy" },
  { real: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600&h=600&fit=crop", aiIndex: 18, category: "fantasy" },
  { real: "https://images.unsplash.com/photo-1494500764479-0c8f2919a3d8?w=600&h=600&fit=crop", aiIndex: 19, category: "fantasy" },
];

function getApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY. Export it before running this script.");
  }
  return apiKey;
}

function clamp01(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function positiveInt(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}

function parseNumberArg(args: string[], prefix: string): number | undefined {
  const value = args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseStringArg(args: string[], prefix: string): string | null {
  const value = args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const dailyCount = positiveInt(parseNumberArg(args, "--daily-count="), 1);
  const fillToTarget = args.includes("--fill-to-target");
  const targetSize = positiveInt(parseNumberArg(args, "--target-size="), DEFAULT_TARGET_SIZE);
  const maxAttempts = positiveInt(parseNumberArg(args, "--max-attempts="), DEFAULT_MAX_ATTEMPTS);
  const reviewsPerAttempt = positiveInt(
    parseNumberArg(args, "--reviews-per-attempt="),
    DEFAULT_REVIEWS_PER_ATTEMPT,
  );
  const requestTimeoutMs = positiveInt(
    parseNumberArg(args, "--request-timeout-ms="),
    DEFAULT_REQUEST_TIMEOUT_MS,
  );
  const maxCorrectRate = clamp01(
    parseNumberArg(args, "--max-correct-rate=") ?? DEFAULT_MAX_CORRECT_RATE,
    DEFAULT_MAX_CORRECT_RATE,
  );
  const maxDetectionRisk = clamp01(
    parseNumberArg(args, "--max-detection-risk=") ?? DEFAULT_MAX_DETECTION_RISK,
    DEFAULT_MAX_DETECTION_RISK,
  );
  const seedUrl = parseStringArg(args, "--seed-url=");
  return {
    dailyCount,
    fillToTarget,
    targetSize,
    maxAttempts: Math.max(1, maxAttempts),
    reviewsPerAttempt: Math.max(1, reviewsPerAttempt),
    maxCorrectRate,
    maxDetectionRisk,
    requestTimeoutMs: Math.max(30000, requestTimeoutMs),
    dryRun: args.includes("--dry-run"),
    seedUrl,
  };
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Request failed (${response.status}): ${text}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function openRouterChat(payload: object, timeoutMs: number) {
  return fetchJson<any>(
    OPENROUTER_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/morgaesis/ai-or-not",
        "X-Title": "ai-or-not-daily-pipeline",
      },
      body: JSON.stringify(payload),
    },
    timeoutMs,
  );
}

function parseJsonObject<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    }
    throw new Error(`Could not parse JSON from model output: ${text}`);
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function asStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function mean(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function compact(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

function uniq(values: string[], limit = 6): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = compact(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= limit) {
      break;
    }
  }
  return output;
}

function createLegacyDataset(targetSize: number): ImageDataset {
  const now = new Date().toISOString();
  return {
    version: 1,
    target_size: targetSize,
    updated_at: now,
    entries: LEGACY_SEEDS.map((seed) => ({
      id: `legacy-${seed.aiIndex}`,
      slot: seed.aiIndex,
      category: seed.category,
      active: true,
      created_at: now,
      real: {
        display_url: seed.real,
        source_url: seed.real,
        source_name: "legacy-unsplash",
        author: "Unknown (legacy seed)",
        captured_at: null,
        title: `Legacy seed image ${seed.aiIndex}`,
        license: null,
      },
      generated: {
        path: `/ai-images/ai-${seed.aiIndex}.jpg`,
        model: GENERATION_MODEL,
        prompt: "Legacy seed prompt unavailable.",
        generated_at: now,
        verifier_model: REVIEW_MODEL,
        verifier_passed: false,
        verifier_attempts: 0,
        verifier_confidence: 1,
        verifier_detection_risk: 1,
      },
      pipeline: {
        source_kind: "legacy-seed",
        source_reason: "Migrated from pre-dataset hardcoded image list.",
        attempts: [],
      },
    })),
  };
}

function normalizeDataset(data: unknown, targetSize: number): ImageDataset {
  if (typeof data !== "object" || data === null) {
    return createLegacyDataset(targetSize);
  }
  const parsed = data as Partial<ImageDataset>;
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const normalizedTarget = Number.isFinite(parsed.target_size)
    ? Math.max(1, Math.floor(parsed.target_size as number))
    : targetSize;
  return {
    version: Number.isFinite(parsed.version) ? Math.floor(parsed.version as number) : 1,
    target_size: normalizedTarget,
    updated_at: asStringOrNull(parsed.updated_at) ?? new Date().toISOString(),
    entries: entries as DatasetEntry[],
  };
}

async function saveDataset(dataset: ImageDataset): Promise<void> {
  await mkdir(dirname(DATASET_PATH), { recursive: true });
  await writeFile(DATASET_PATH, JSON.stringify(dataset, null, 2));
}

async function loadOrCreateDataset(targetSize: number): Promise<ImageDataset> {
  try {
    const raw = await readFile(DATASET_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const normalized = normalizeDataset(parsed, targetSize);
    if (!normalized.entries.length) {
      const seeded = createLegacyDataset(normalized.target_size);
      await saveDataset(seeded);
      return seeded;
    }
    return normalized;
  } catch {
    const seeded = createLegacyDataset(targetSize);
    await saveDataset(seeded);
    return seeded;
  }
}

async function appendDailyReport(record: object): Promise<void> {
  let runs: unknown[] = [];
  try {
    const raw = await readFile(DAILY_REPORT_PATH, "utf8");
    const parsed = JSON.parse(raw) as { runs?: unknown[] };
    if (Array.isArray(parsed.runs)) {
      runs = parsed.runs;
    }
  } catch {
    runs = [];
  }
  runs.push(record);
  const capped = runs.slice(-200);
  await mkdir(dirname(DAILY_REPORT_PATH), { recursive: true });
  await writeFile(
    DAILY_REPORT_PATH,
    JSON.stringify({ updated_at: new Date().toISOString(), runs: capped }, null, 2),
  );
}

function findInsertionSlot(dataset: ImageDataset, targetSize: number): InsertSlot {
  const usedSlots = new Set(dataset.entries.map((entry) => entry.slot));
  for (let slot = 0; slot < targetSize; slot += 1) {
    if (!usedSlots.has(slot)) {
      return { slot, replacedEntryId: null };
    }
  }

  const oldest = [...dataset.entries]
    .sort((a, b) => {
      const aTime = Date.parse(a.created_at || "") || 0;
      const bTime = Date.parse(b.created_at || "") || 0;
      return aTime - bTime;
    })[0];
  return {
    slot: oldest?.slot ?? 0,
    replacedEntryId: oldest?.id ?? null,
  };
}

function pickMimeImageUrl(info: CommonsImageInfo): string | null {
  const mime = asStringOrNull(info.mime);
  if (!mime || !mime.startsWith("image/")) {
    return null;
  }
  if (mime.includes("svg")) {
    return null;
  }
  const thumb = asStringOrNull(info.thumburl);
  const original = asStringOrNull(info.url);
  return thumb ?? original;
}

function extValue(extmetadata: CommonsImageInfo["extmetadata"], key: string): string | null {
  const raw = extmetadata?.[key]?.value;
  return asStringOrNull(typeof raw === "string" ? stripHtml(raw) : null);
}

function isLikelyPhotoCandidate(candidate: CommonsCandidate): boolean {
  const text = `${candidate.title} ${candidate.description} ${candidate.categoryHints}`.toLowerCase();
  const banned = [
    "logo",
    "illustration",
    "drawing",
    "painting",
    "poster",
    "screenshot",
    "flag",
    "coat of arms",
    "map",
    "diagram",
    "icon",
    "stamp",
    "currency",
    "scan",
  ];
  return !banned.some((token) => text.includes(token));
}

async function fetchCommonsCandidates(batchSize = 20, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<CommonsCandidate[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "random",
    grnnamespace: "6",
    grnlimit: String(batchSize),
    prop: "imageinfo",
    iiprop: "url|mime|timestamp|user|extmetadata",
    iiurlwidth: "1400",
  });
  const result = await fetchJson<any>(`${COMMONS_URL}?${params.toString()}`, undefined, timeoutMs);
  const pages = result?.query?.pages;
  if (!pages || typeof pages !== "object") {
    return [];
  }
  const candidates: CommonsCandidate[] = [];
  for (const value of Object.values(pages)) {
    const page = value as { title?: string; imageinfo?: CommonsImageInfo[] };
    const info = Array.isArray(page.imageinfo) ? page.imageinfo[0] : undefined;
    if (!info) {
      continue;
    }
    const mediaUrl = pickMimeImageUrl(info);
    const sourceUrl = asStringOrNull(info.descriptionurl);
    if (!mediaUrl || !sourceUrl) {
      continue;
    }
    const title = extValue(info.extmetadata, "ObjectName") ?? (asStringOrNull(page.title)?.replace(/^File:/, "") ?? "Untitled");
    const description = extValue(info.extmetadata, "ImageDescription") ?? "";
    const categoryHints = extValue(info.extmetadata, "Categories") ?? "";
    const author = extValue(info.extmetadata, "Artist") ?? asStringOrNull(info.user) ?? "Unknown";
    const capturedAt = extValue(info.extmetadata, "DateTimeOriginal") ?? extValue(info.extmetadata, "DateTime") ?? asStringOrNull(info.timestamp);
    const license = extValue(info.extmetadata, "LicenseShortName") ?? extValue(info.extmetadata, "UsageTerms");
    const candidate: CommonsCandidate = {
      mediaUrl,
      sourceUrl,
      sourceName: "Wikimedia Commons",
      author,
      capturedAt,
      title,
      description,
      license: license ?? null,
      categoryHints,
    };
    if (isLikelyPhotoCandidate(candidate)) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

function normalizeCategory(value: string | null): string {
  if (!value) {
    return "uncategorized";
  }
  const normalized = value.trim().toLowerCase();
  return normalized || "uncategorized";
}

async function analyzeReferenceCandidate(
  candidate: CommonsCandidate,
  timeoutMs: number,
): Promise<ReferenceAnalysis> {
  const result = await openRouterChat(
    {
      model: REVIEW_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You curate candid non-stock reference photos for an AI detection game. Accept only real camera photos that look natural and not commercial stock/studio advertising. Reject illustrations, graphics, screenshots, logos, maps, or synthetic-looking visuals. Return strict JSON with keys: accepted, category, prompt, title, reason, avoid.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Metadata: title=${candidate.title}; author=${candidate.author}; captured_at=${candidate.capturedAt ?? "unknown"}; source=${candidate.sourceUrl}; hints=${candidate.categoryHints}. Write a photoreal generation prompt if accepted.`,
            },
            {
              type: "image_url",
              image_url: { url: candidate.mediaUrl },
            },
          ],
        },
      ],
    },
    timeoutMs,
  );
  const content = result?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(`Expected text from reference analysis model, got: ${JSON.stringify(result)}`);
  }
  const parsed = parseJsonObject<any>(content);
  return {
    accepted: Boolean(parsed.accepted),
    category: normalizeCategory(asStringOrNull(parsed.category)),
    prompt: asStringOrNull(parsed.prompt) ?? "",
    title: asStringOrNull(parsed.title) ?? candidate.title,
    reason: asStringOrNull(parsed.reason) ?? "No reason provided",
    avoid: Array.isArray(parsed.avoid) ? parsed.avoid.map(String) : [],
  };
}

async function selectReferenceCandidate(
  timeoutMs: number,
  seedUrl: string | null,
): Promise<{ candidate: CommonsCandidate; analysis: ReferenceAnalysis; sourceKind: "wikimedia-random" | "manual-url" }> {
  if (seedUrl) {
    const manual: CommonsCandidate = {
      mediaUrl: seedUrl,
      sourceUrl: seedUrl,
      sourceName: "manual-url",
      author: "Unknown",
      capturedAt: null,
      title: "Manual seed URL",
      description: "",
      license: null,
      categoryHints: "",
    };
    const analysis = await analyzeReferenceCandidate(manual, timeoutMs);
    if (!analysis.accepted || !analysis.prompt.trim()) {
      throw new Error(`Manual seed URL rejected by analysis model: ${analysis.reason}`);
    }
    return { candidate: manual, analysis, sourceKind: "manual-url" };
  }

  let analyzed = 0;
  const maxAnalyzed = 15;
  for (let batch = 0; batch < 8; batch += 1) {
    const candidates = await fetchCommonsCandidates(20, timeoutMs);
    for (const candidate of candidates) {
      const analysis = await analyzeReferenceCandidate(candidate, timeoutMs);
      analyzed += 1;
      if (analysis.accepted && analysis.prompt.trim()) {
        return { candidate, analysis, sourceKind: "wikimedia-random" };
      }
      if (analyzed >= maxAnalyzed) {
        break;
      }
    }
    if (analyzed >= maxAnalyzed) {
      break;
    }
  }
  throw new Error("Could not find an acceptable non-stock random photo in candidate batches.");
}

function extractImageDataUrl(result: any): string {
  const imageEntry = result?.choices?.[0]?.message?.images?.[0];
  const url = imageEntry?.image_url?.url ?? imageEntry?.imageUrl?.url;
  if (typeof url !== "string" || !url.startsWith("data:image/")) {
    throw new Error(`No generated image found in response: ${JSON.stringify(result)}`);
  }
  return url;
}

async function generateCandidateFromPrompt(
  prompt: string,
  referenceImageUrl: string,
  timeoutMs: number,
): Promise<string> {
  const result = await openRouterChat(
    {
      model: GENERATION_MODEL,
      modalities: ["image", "text"],
      image_config: {
        aspect_ratio: "1:1",
        image_size: "1K",
      },
      messages: [
        {
          role: "system",
          content:
            "Generate one square photorealistic camera image from the prompt and reference. Keep natural imperfections and avoid synthetic smoothing or CGI artifacts.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Prompt: ${prompt}`,
            },
            {
              type: "image_url",
              image_url: { url: referenceImageUrl },
            },
          ],
        },
      ],
    },
    timeoutMs,
  );
  return extractImageDataUrl(result);
}

async function toSquareJpegBuffer(dataUrl: string): Promise<Buffer> {
  const image = await loadImage(dataUrl);
  const side = Math.min(image.width, image.height);
  const sx = Math.floor((image.width - side) / 2);
  const sy = Math.floor((image.height - side) / 2);
  const canvas = createCanvas(1024, 1024);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, sx, sy, side, side, 0, 0, 1024, 1024);
  return canvas.toBuffer("image/jpeg", { quality: 0.92, progressive: true });
}

function bufferToDataUrl(buffer: Buffer): string {
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

async function downloadAndConvertRealImage(url: string, timeoutMs: number): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to download real image (${response.status}) from ${url}`);
    }
    const mime = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const dataUrl = `data:${mime};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
    return await toSquareJpegBuffer(dataUrl);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeReviewVerdict(value: unknown): ReviewResult["suspected_ai"] {
  if (typeof value !== "string") {
    return "uncertain";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "image_a" || normalized === "a") {
    return "image_a";
  }
  if (normalized === "image_b" || normalized === "b") {
    return "image_b";
  }
  return "uncertain";
}

function parseReviewResult(content: string): ReviewResult {
  const parsed = parseJsonObject<any>(content);
  return {
    suspected_ai: normalizeReviewVerdict(parsed.suspected_ai),
    confidence: clamp01(Number(parsed.confidence), 0),
    can_tell: Boolean(parsed.can_tell),
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String) : [],
    prompt_adjustments: Array.isArray(parsed.prompt_adjustments)
      ? parsed.prompt_adjustments.map(String)
      : [],
    revised_prompt: asStringOrNull(parsed.revised_prompt) ?? "",
  };
}

async function runBlindReview(
  realDataUrl: string,
  candidateDataUrl: string,
  prompt: string,
  timeoutMs: number,
): Promise<{ candidateFirst: boolean; review: ReviewResult }> {
  const candidateFirst = Math.random() < 0.5;
  const result = await openRouterChat(
    {
      model: REVIEW_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a strict blind reviewer. Exactly one of Image A or Image B is AI-generated and one is real. Return strict JSON: suspected_ai (image_a/image_b/uncertain), confidence (0..1), can_tell (boolean), reasons, prompt_adjustments, revised_prompt.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Current generation prompt: ${prompt}`,
            },
            {
              type: "image_url",
              image_url: {
                url: candidateFirst ? candidateDataUrl : realDataUrl,
              },
            },
            {
              type: "image_url",
              image_url: {
                url: candidateFirst ? realDataUrl : candidateDataUrl,
              },
            },
          ],
        },
      ],
    },
    timeoutMs,
  );
  const content = result?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(`Expected text review response, got: ${JSON.stringify(result)}`);
  }
  return {
    candidateFirst,
    review: parseReviewResult(content),
  };
}

function reviewerCorrectlyIdentifiedCandidate(
  review: ReviewResult,
  candidateFirst: boolean,
): boolean {
  if (!review.can_tell || review.suspected_ai === "uncertain") {
    return false;
  }
  return candidateFirst
    ? review.suspected_ai === "image_a"
    : review.suspected_ai === "image_b";
}

function buildNextPrompt(currentPrompt: string, trials: ReviewTrial[], avoid: string[]): string {
  const revised = trials
    .map((trial) => compact(trial.revised_prompt))
    .find((value) => value && value !== compact(currentPrompt));
  if (revised) {
    return revised;
  }
  const hints = uniq([
    ...trials.flatMap((trial) => trial.prompt_adjustments),
    ...trials.flatMap((trial) => trial.reasons),
    ...avoid,
    "preserve realistic camera imperfections and subtle texture variation",
    "avoid over-smooth surfaces and over-sharpened detail",
  ]);
  if (!hints.length) {
    return currentPrompt;
  }
  return `${compact(currentPrompt)}. Adjustments: ${hints.join("; ")}`.slice(0, 1700);
}

async function ensureModelsReachable(timeoutMs: number): Promise<void> {
  const models = await fetchJson<{ data: Array<{ id: string }> }>(
    MODEL_LIST_URL,
    undefined,
    timeoutMs,
  );
  const modelIds = new Set(models.data.map((model) => model.id));
  if (!modelIds.has(GENERATION_MODEL)) {
    throw new Error(`Generation model not listed on OpenRouter: ${GENERATION_MODEL}`);
  }
  if (!modelIds.has(REVIEW_MODEL)) {
    throw new Error(`Review model not listed on OpenRouter: ${REVIEW_MODEL}`);
  }
}

async function writeAttemptPreview(slot: number, attempt: number, jpeg: Buffer): Promise<string> {
  const path = join(ATTEMPT_DIR, `slot-${slot}-attempt-${attempt}.jpg`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, jpeg);
  return path;
}

async function generateVerifiedEntry(
  slot: number,
  candidate: CommonsCandidate,
  analysis: ReferenceAnalysis,
  sourceKind: DatasetPipelineMeta["source_kind"],
  args: CliArgs,
): Promise<DatasetEntry> {
  const realJpeg = await downloadAndConvertRealImage(candidate.mediaUrl, args.requestTimeoutMs);
  const realDisplayPath = `/real-images/real-${slot}.jpg`;
  const realFilePath = join(REAL_OUTPUT_DIR, `real-${slot}.jpg`);
  await mkdir(dirname(realFilePath), { recursive: true });
  await writeFile(realFilePath, realJpeg);
  const realDataUrl = bufferToDataUrl(realJpeg);

  let prompt = compact(analysis.prompt);
  if (!prompt) {
    throw new Error(`Reference analysis did not return a usable prompt: ${analysis.reason}`);
  }

  const attempts: AttemptSummary[] = [];
  let acceptedJpeg: Buffer | null = null;
  let acceptedSummary: AttemptSummary | null = null;

  for (let attempt = 1; attempt <= args.maxAttempts; attempt += 1) {
    const generatedDataUrl = await generateCandidateFromPrompt(
      prompt,
      candidate.mediaUrl,
      args.requestTimeoutMs,
    );
    const candidateJpeg = await toSquareJpegBuffer(generatedDataUrl);
    await writeAttemptPreview(slot, attempt, candidateJpeg);
    const candidateDataUrl = bufferToDataUrl(candidateJpeg);

    const trials: ReviewTrial[] = [];
    for (let reviewPass = 0; reviewPass < args.reviewsPerAttempt; reviewPass += 1) {
      const { candidateFirst, review } = await runBlindReview(
        realDataUrl,
        candidateDataUrl,
        prompt,
        args.requestTimeoutMs,
      );
      const correctIdentification = reviewerCorrectlyIdentifiedCandidate(
        review,
        candidateFirst,
      );
      trials.push({
        candidate_first: candidateFirst,
        suspected_ai: review.suspected_ai,
        confidence: review.confidence,
        can_tell: review.can_tell,
        correct_identification: correctIdentification,
        detection_risk: correctIdentification ? review.confidence : 0,
        reasons: review.reasons,
        prompt_adjustments: review.prompt_adjustments,
        revised_prompt: review.revised_prompt,
      });
    }

    const correctRate = mean(
      trials.map((trial) => (trial.correct_identification ? 1 : 0)),
    );
    const detectionRisk = mean(trials.map((trial) => trial.detection_risk));
    const avgConfidence = mean(trials.map((trial) => trial.confidence));
    const accepted =
      correctRate <= args.maxCorrectRate && detectionRisk <= args.maxDetectionRisk;

    const summary: AttemptSummary = {
      attempt,
      prompt,
      correct_rate: correctRate,
      detection_risk: detectionRisk,
      avg_confidence: avgConfidence,
      accepted,
      trials,
    };
    attempts.push(summary);

    if (accepted) {
      acceptedJpeg = candidateJpeg;
      acceptedSummary = summary;
      break;
    }
    prompt = buildNextPrompt(prompt, trials, analysis.avoid);
  }

  if (!acceptedJpeg || !acceptedSummary) {
    throw new Error(
      `Verifier still detects AI after ${args.maxAttempts} attempts (slot ${slot}).`,
    );
  }

  const aiPath = `/ai-images/ai-${slot}.jpg`;
  const aiFilePath = join(AI_OUTPUT_DIR, `ai-${slot}.jpg`);
  await mkdir(dirname(aiFilePath), { recursive: true });
  await writeFile(aiFilePath, acceptedJpeg);

  const now = new Date().toISOString();
  return {
    id: `${now.split("T")[0]}-slot-${slot}`,
    slot,
    category: normalizeCategory(analysis.category),
    active: true,
    created_at: now,
    real: {
      display_url: realDisplayPath,
      source_url: candidate.sourceUrl,
      source_name: candidate.sourceName,
      author: candidate.author,
      captured_at: candidate.capturedAt,
      title: analysis.title || candidate.title,
      license: candidate.license,
    },
    generated: {
      path: aiPath,
      model: GENERATION_MODEL,
      prompt: acceptedSummary.prompt,
      generated_at: now,
      verifier_model: REVIEW_MODEL,
      verifier_passed: true,
      verifier_attempts: acceptedSummary.attempt,
      verifier_confidence: acceptedSummary.avg_confidence,
      verifier_detection_risk: acceptedSummary.detection_risk,
    },
    pipeline: {
      source_kind: sourceKind,
      source_reason: analysis.reason,
      attempts,
    },
  };
}

function upsertDatasetEntry(dataset: ImageDataset, entry: DatasetEntry): ImageDataset {
  const nextEntries = dataset.entries.filter((item) => item.slot !== entry.slot);
  nextEntries.push(entry);
  nextEntries.sort((a, b) => a.slot - b.slot);
  return {
    ...dataset,
    updated_at: new Date().toISOString(),
    entries: nextEntries,
  };
}

async function runOneDailyGeneration(
  dataset: ImageDataset,
  args: CliArgs,
  runIndex: number,
): Promise<{ dataset: ImageDataset; report: object }> {
  const slotSelection = findInsertionSlot(dataset, args.targetSize);
  console.log(
    `[run ${runIndex}] selected slot ${slotSelection.slot}${
      slotSelection.replacedEntryId ? ` (replacing ${slotSelection.replacedEntryId})` : ""
    }`,
  );
  const { candidate, analysis, sourceKind } = await selectReferenceCandidate(
    args.requestTimeoutMs,
    args.seedUrl,
  );
  const newEntry = await generateVerifiedEntry(
    slotSelection.slot,
    candidate,
    analysis,
    sourceKind,
    args,
  );
  const nextDataset = upsertDatasetEntry(dataset, newEntry);
  await saveDataset(nextDataset);

  const report = {
    executed_at: new Date().toISOString(),
    slot: newEntry.slot,
    replaced_entry_id: slotSelection.replacedEntryId,
    source_kind: sourceKind,
    source_url: newEntry.real.source_url,
    source_author: newEntry.real.author,
    source_date: newEntry.real.captured_at,
    source_license: newEntry.real.license,
    source_title: newEntry.real.title,
    category: newEntry.category,
    generation_model: newEntry.generated.model,
    generation_prompt: newEntry.generated.prompt,
    verifier_model: newEntry.generated.verifier_model,
    verifier_attempts: newEntry.generated.verifier_attempts,
    verifier_detection_risk: newEntry.generated.verifier_detection_risk,
    verifier_confidence: newEntry.generated.verifier_confidence,
  };
  await appendDailyReport(report);
  return { dataset: nextDataset, report };
}

async function main() {
  const args = parseArgs();
  console.log(`Generation model: ${GENERATION_MODEL}`);
  console.log(`Review model: ${REVIEW_MODEL}`);
  console.log(`Target size: ${args.targetSize}`);
  console.log(`Max attempts: ${args.maxAttempts}`);
  console.log(`Reviews per attempt: ${args.reviewsPerAttempt}`);
  console.log(`Accept max correct rate: ${args.maxCorrectRate.toFixed(2)}`);
  console.log(`Accept max detection risk: ${args.maxDetectionRisk.toFixed(2)}`);
  console.log(`Request timeout: ${args.requestTimeoutMs}ms`);

  let dataset = await loadOrCreateDataset(args.targetSize);
  if (dataset.target_size !== args.targetSize) {
    dataset.target_size = args.targetSize;
    dataset.updated_at = new Date().toISOString();
    await saveDataset(dataset);
  }

  const plannedRuns = args.fillToTarget
    ? Math.max(args.targetSize - dataset.entries.length, 0)
    : args.dailyCount;
  if (args.dryRun) {
    console.log(
      `Dry run: dataset has ${dataset.entries.length} entries, planned runs=${plannedRuns}.`,
    );
    return;
  }
  if (plannedRuns <= 0) {
    console.log("No runs scheduled.");
    return;
  }

  await ensureModelsReachable(args.requestTimeoutMs);

  for (let i = 0; i < plannedRuns; i += 1) {
    const runIndex = i + 1;
    console.log(`\n=== Daily generation ${runIndex}/${plannedRuns} ===`);
    const output = await runOneDailyGeneration(dataset, args, runIndex);
    dataset = output.dataset;
    console.log(
      `Saved slot ${String((output.report as { slot: number }).slot)}. Dataset size: ${dataset.entries.length}/${dataset.target_size}.`,
    );
  }

  console.log(`\nUpdated dataset: ${DATASET_PATH}`);
  console.log(`Daily report log: ${DAILY_REPORT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
