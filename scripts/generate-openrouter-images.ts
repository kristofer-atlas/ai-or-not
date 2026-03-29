import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { createCanvas, loadImage } from "canvas";

type Category =
  | "landscape"
  | "portrait"
  | "nature"
  | "animal"
  | "architecture"
  | "fantasy";

interface ImageSet {
  real: string;
  aiIndex: number;
  category: Category;
}

interface ModelSummary {
  id: string;
  name: string;
  input_modalities?: string[];
  output_modalities?: string[];
}

interface PromptAnalysis {
  title: string;
  visual_summary: string;
  prompt: string;
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

interface CandidateReviewTrial {
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

interface CandidateSummary {
  candidate_index: number;
  output_path: string;
  review_trials: CandidateReviewTrial[];
  correct_rate: number;
  avg_detection_risk: number;
  avg_confidence: number;
  accepted: boolean;
}

interface AttemptRecord {
  attempt: number;
  prompt: string;
  candidate_summaries: CandidateSummary[];
  best_candidate_index: number;
  accepted: boolean;
}

interface FinalRecord {
  aiIndex: number;
  category: Category;
  real: string;
  output: string;
  attempts: AttemptRecord[];
  resolved: boolean;
  final_detection_risk: number;
}

interface HoldoutRecord {
  aiIndex: number;
  category: Category;
  passes: CandidateReviewTrial[];
  correct_passes: number;
  pass_count: number;
  correct_identification: boolean;
  avg_detection_risk: number;
  avg_confidence: number;
  dominant_reasons: string[];
}

interface HoldoutSummary {
  total: number;
  correct_identifications: number;
  success_rate: number;
  greater_than_50_percent: boolean;
}

interface OptimizationRoundRecord {
  round: number;
  processed_indices: number[];
  failing_indices_after_round: number[];
  holdout_success_rate: number;
}

interface CliArgs {
  listModels: boolean;
  dryRun: boolean;
  limit: number;
  startIndex: number;
  resume: boolean;
  requestTimeoutMs: number;
  targetSuccessRate: number;
  maxRounds: number;
  candidatesPerAttempt: number;
  reviewsPerCandidate: number;
  holdoutReviewsPerImage: number;
}

const MODEL_LIST_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OUTPUT_DIR = join(process.cwd(), "public", "ai-images");
const REPORT_PATH = join(OUTPUT_DIR, "openrouter-review-report.json");
const ATTEMPT_DIR = join(process.cwd(), "dist", "openrouter-attempts");

const DEFAULT_GENERATION_MODEL = "google/gemini-3.1-flash-image-preview";
const DEFAULT_REVIEW_MODEL = "google/gemini-3-flash-preview";

const GENERATION_MODEL =
  process.env.OPENROUTER_GENERATION_MODEL ?? DEFAULT_GENERATION_MODEL;
const REVIEW_MODEL = process.env.OPENROUTER_REVIEW_MODEL ?? DEFAULT_REVIEW_MODEL;

const MAX_ATTEMPTS = Number(process.env.OPENROUTER_MAX_ATTEMPTS ?? "6");
const DEFAULT_REQUEST_TIMEOUT_MS = Number(
  process.env.OPENROUTER_REQUEST_TIMEOUT_MS ?? "180000",
);
const DEFAULT_TARGET_SUCCESS_RATE = Number(
  process.env.OPENROUTER_TARGET_SUCCESS_RATE ?? "0.5",
);
const DEFAULT_MAX_ROUNDS = Number(
  process.env.OPENROUTER_MAX_OPTIMIZATION_ROUNDS ?? "4",
);
const DEFAULT_CANDIDATES_PER_ATTEMPT = Number(
  process.env.OPENROUTER_CANDIDATES_PER_ATTEMPT ?? "2",
);
const DEFAULT_REVIEWS_PER_CANDIDATE = Number(
  process.env.OPENROUTER_REVIEWS_PER_CANDIDATE ?? "2",
);
const DEFAULT_HOLDOUT_REVIEWS_PER_IMAGE = Number(
  process.env.OPENROUTER_HOLDOUT_REVIEWS_PER_IMAGE ?? "3",
);
const MAX_CORRECT_RATE_FOR_ACCEPT = Number(
  process.env.OPENROUTER_MAX_CORRECT_RATE_FOR_ACCEPT ?? "0.2",
);
const MAX_AVG_RISK_FOR_ACCEPT = Number(
  process.env.OPENROUTER_MAX_AVG_RISK_FOR_ACCEPT ?? "0.15",
);

let REQUEST_TIMEOUT_MS =
  Number.isFinite(DEFAULT_REQUEST_TIMEOUT_MS) && DEFAULT_REQUEST_TIMEOUT_MS > 0
    ? DEFAULT_REQUEST_TIMEOUT_MS
    : 180000;

const imageSets: ImageSet[] = [
  {
    real: "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=600&h=600&fit=crop",
    aiIndex: 0,
    category: "landscape",
  },
  {
    real: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&h=600&fit=crop",
    aiIndex: 1,
    category: "portrait",
  },
  {
    real: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=600&h=600&fit=crop",
    aiIndex: 2,
    category: "landscape",
  },
  {
    real: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&h=600&fit=crop",
    aiIndex: 3,
    category: "nature",
  },
  {
    real: "https://images.unsplash.com/photo-1529778873920-4da4926a72c2?w=600&h=600&fit=crop",
    aiIndex: 4,
    category: "animal",
  },
  {
    real: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=600&fit=crop",
    aiIndex: 5,
    category: "portrait",
  },
  {
    real: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=600&h=600&fit=crop",
    aiIndex: 6,
    category: "landscape",
  },
  {
    real: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=600&h=600&fit=crop",
    aiIndex: 7,
    category: "landscape",
  },
  {
    real: "https://images.unsplash.com/photo-1516117172878-fd2c41f4a759?w=600&h=600&fit=crop",
    aiIndex: 8,
    category: "architecture",
  },
  {
    real: "https://images.unsplash.com/photo-1493238792000-8113da705763?w=600&h=600&fit=crop",
    aiIndex: 9,
    category: "fantasy",
  },
  {
    real: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=600&fit=crop",
    aiIndex: 10,
    category: "architecture",
  },
  {
    real: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&h=600&fit=crop",
    aiIndex: 11,
    category: "fantasy",
  },
  {
    real: "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=600&h=600&fit=crop",
    aiIndex: 12,
    category: "nature",
  },
  {
    real: "https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=600&h=600&fit=crop",
    aiIndex: 13,
    category: "landscape",
  },
  {
    real: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&h=600&fit=crop",
    aiIndex: 14,
    category: "fantasy",
  },
  {
    real: "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=600&h=600&fit=crop",
    aiIndex: 15,
    category: "fantasy",
  },
  {
    real: "https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=600&h=600&fit=crop",
    aiIndex: 16,
    category: "fantasy",
  },
  {
    real: "https://images.unsplash.com/photo-1465146633011-14f860dc2c2c?w=600&h=600&fit=crop",
    aiIndex: 17,
    category: "fantasy",
  },
  {
    real: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600&h=600&fit=crop",
    aiIndex: 18,
    category: "fantasy",
  },
  {
    real: "https://images.unsplash.com/photo-1494500764479-0c8f2919a3d8?w=600&h=600&fit=crop",
    aiIndex: 19,
    category: "fantasy",
  },
];

function getApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENROUTER_API_KEY. Export it before running this pipeline.",
    );
  }
  return apiKey;
}

function clamp01(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function findNumberArg(argv: string[], prefix: string): number | undefined {
  const value = argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function positiveIntOrDefault(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const limitArg = findNumberArg(argv, "--limit=");
  const startIndexArg = findNumberArg(argv, "--start-index=");
  const requestTimeoutArg = findNumberArg(argv, "--request-timeout-ms=");
  const targetSuccessArg = findNumberArg(argv, "--target-success-rate=");
  const maxRoundsArg = findNumberArg(argv, "--max-rounds=");
  const candidatesPerAttemptArg = findNumberArg(argv, "--candidates-per-attempt=");
  const reviewsPerCandidateArg = findNumberArg(argv, "--reviews-per-candidate=");
  const holdoutReviewsArg = findNumberArg(argv, "--holdout-reviews=");

  const limit = positiveIntOrDefault(limitArg, imageSets.length);
  const startIndex =
    typeof startIndexArg === "number" && startIndexArg >= 0
      ? Math.floor(startIndexArg)
      : 0;
  const requestTimeoutMs = positiveIntOrDefault(
    requestTimeoutArg,
    REQUEST_TIMEOUT_MS,
  );
  const targetSuccessRate = clamp01(
    typeof targetSuccessArg === "number"
      ? targetSuccessArg
      : DEFAULT_TARGET_SUCCESS_RATE,
    0.5,
  );
  const maxRounds = positiveIntOrDefault(maxRoundsArg, DEFAULT_MAX_ROUNDS);
  const candidatesPerAttempt = positiveIntOrDefault(
    candidatesPerAttemptArg,
    DEFAULT_CANDIDATES_PER_ATTEMPT,
  );
  const reviewsPerCandidate = positiveIntOrDefault(
    reviewsPerCandidateArg,
    DEFAULT_REVIEWS_PER_CANDIDATE,
  );
  const holdoutReviewsPerImage = positiveIntOrDefault(
    holdoutReviewsArg,
    DEFAULT_HOLDOUT_REVIEWS_PER_IMAGE,
  );

  if (startIndex > imageSets.length - 1) {
    throw new Error(
      `Invalid --start-index=${startIndex}. Expected 0-${imageSets.length - 1}.`,
    );
  }

  return {
    listModels: argv.includes("--list-models"),
    dryRun: argv.includes("--dry-run"),
    limit,
    startIndex,
    resume: argv.includes("--resume"),
    requestTimeoutMs,
    targetSuccessRate,
    maxRounds,
    candidatesPerAttempt,
    reviewsPerCandidate,
    holdoutReviewsPerImage,
  };
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Request failed (${response.status}): ${errorText}`);
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

async function listRelevantModels(): Promise<ModelSummary[]> {
  const result = await fetchJson<{ data: Array<any> }>(MODEL_LIST_URL);
  return result.data
    .filter((model) => model.id.startsWith("google/gemini"))
    .map((model) => ({
      id: model.id,
      name: model.name,
      input_modalities: model.architecture?.input_modalities,
      output_modalities: model.architecture?.output_modalities,
    }));
}

function printModels(models: ModelSummary[]) {
  console.log("OpenRouter Gemini models:");
  for (const model of models) {
    const inputs = model.input_modalities?.join(", ") ?? "unknown";
    const outputs = model.output_modalities?.join(", ") ?? "unknown";
    console.log(`- ${model.id} | inputs: ${inputs} | outputs: ${outputs}`);
  }
}

async function openRouterChat(payload: object) {
  return fetchJson<any>(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/morgaesis/ai-or-not",
      "X-Title": "ai-or-not",
    },
    body: JSON.stringify(payload),
  });
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
    throw new Error(`Could not parse JSON from response: ${text}`);
  }
}

function toReviewVerdict(value: unknown): ReviewResult["suspected_ai"] {
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
    suspected_ai: toReviewVerdict(parsed.suspected_ai),
    confidence: clamp01(Number(parsed.confidence), 0),
    can_tell: Boolean(parsed.can_tell),
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String) : [],
    prompt_adjustments: Array.isArray(parsed.prompt_adjustments)
      ? parsed.prompt_adjustments.map(String)
      : [],
    revised_prompt: typeof parsed.revised_prompt === "string" ? parsed.revised_prompt : "",
  };
}

function compactLines(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

function appendPromptHints(prompt: string, hints: string[]): string {
  const compactHints = hints
    .map((hint) => compactLines(hint))
    .filter(Boolean)
    .slice(0, 4);
  if (!compactHints.length) {
    return prompt;
  }
  const combined = `${compactLines(prompt)}. Additional constraints: ${compactHints.join("; ")}`;
  return combined.slice(0, 1600);
}

async function createInitialPrompt(
  imageSet: ImageSet,
  failureHints: string[],
): Promise<PromptAnalysis> {
  const hintText = failureHints.length
    ? `Prior verifier findings to fix: ${failureHints.join("; ")}.`
    : "";
  const result = await openRouterChat({
    model: REVIEW_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You study a real photo and write a concise photorealistic recreation prompt. Return strict JSON with keys: title, visual_summary, prompt, avoid. The prompt must describe a plausible camera photo and explicitly include natural camera imperfections.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Analyze this ${imageSet.category} reference image and produce a prompt for a new image that matches realism, composition, lighting, lens behavior, and camera feel without copying exact copyrighted details. ${hintText}`,
          },
          {
            type: "image_url",
            image_url: {
              url: imageSet.real,
            },
          },
        ],
      },
    ],
  });

  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(`Expected text content for prompt analysis, got: ${JSON.stringify(result)}`);
  }
  const parsed = parseJsonObject<PromptAnalysis>(content);
  return {
    ...parsed,
    prompt: appendPromptHints(parsed.prompt, failureHints),
  };
}

function extractImageDataUrl(result: any): string {
  const imageEntry = result.choices?.[0]?.message?.images?.[0];
  const url = imageEntry?.image_url?.url ?? imageEntry?.imageUrl?.url;
  if (typeof url !== "string" || !url.startsWith("data:image/")) {
    throw new Error(`No generated image returned: ${JSON.stringify(result)}`);
  }
  return url;
}

function variantHint(candidateIndex: number): string {
  const hints = [
    "handheld camera framing with subtle asymmetry, realistic micro-motion, and non-ideal focus transitions",
    "natural sensor noise, slight lens aberration, imperfect exposure roll-off, and practical lighting spill",
    "small framing shift, realistic depth cues, and texture irregularities from real optics",
    "minor white-balance inconsistency, authentic grain, and non-uniform detail sharpness",
  ];
  return hints[candidateIndex % hints.length];
}

async function generateCandidate(
  imageSet: ImageSet,
  prompt: string,
  candidateIndex: number,
): Promise<string> {
  const result = await openRouterChat({
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
          "Generate one square photorealistic camera image. Treat the provided reference photo as visual grounding only. Create a new shot with the same realism level while preserving natural camera artifacts, slight imperfections, and organic textures. Avoid synthetic smoothness and AI-looking details.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Prompt: ${prompt}. Variation target: ${variantHint(candidateIndex)}. Create a fresh but plausible scene variant, not a copy.`,
          },
          {
            type: "image_url",
            image_url: {
              url: imageSet.real,
            },
          },
        ],
      },
    ],
  });

  return extractImageDataUrl(result);
}

async function convertToJpeg(dataUrl: string): Promise<Buffer> {
  const image = await loadImage(dataUrl);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return canvas.toBuffer("image/jpeg", { quality: 0.92, progressive: true });
}

async function writeAttemptImage(
  aiIndex: number,
  attempt: number,
  candidateIndex: number,
  jpeg: Buffer,
): Promise<string> {
  const path = join(
    ATTEMPT_DIR,
    `ai-${aiIndex}-attempt-${attempt}-candidate-${candidateIndex}.jpg`,
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, jpeg);
  return path;
}

async function encodeLocalImage(path: string): Promise<string> {
  const buffer = await readFile(path);
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

async function reviewCandidate(
  imageSet: ImageSet,
  candidatePath: string,
  prompt: string,
  candidateFirstOverride?: boolean,
): Promise<{ review: ReviewResult; candidateFirst: boolean }> {
  const candidateDataUrl = await encodeLocalImage(candidatePath);
  const candidateFirst = candidateFirstOverride ?? Math.random() < 0.5;
  const promptText = [
    "Two images follow: Image A and Image B.",
    "Exactly one image is AI-generated and one is a real camera photo.",
    "You are not told which is AI.",
    "Decide whether you can reliably identify the AI-generated image.",
    "Return strict JSON with keys: suspected_ai, confidence, can_tell, reasons, prompt_adjustments, revised_prompt.",
    "Use suspected_ai values: image_a, image_b, or uncertain.",
    "Confidence must be a number between 0 and 1.",
    "Set can_tell to true only if you can distinguish with specific evidence.",
    `Current generation prompt: ${prompt}`,
  ].join(" ");

  const result = await openRouterChat({
    model: REVIEW_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a strict blind image forensics reviewer. Compare Image A and Image B without assuming order. Focus on realism, lighting, anatomy, perspective, texture, lens behavior, and artifact patterns. Return strict JSON only.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: promptText,
          },
          {
            type: "image_url",
            image_url: {
              url: candidateFirst ? candidateDataUrl : imageSet.real,
            },
          },
          {
            type: "image_url",
            image_url: {
              url: candidateFirst ? imageSet.real : candidateDataUrl,
            },
          },
        ],
      },
    ],
  });

  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(`Expected text review response, got: ${JSON.stringify(result)}`);
  }
  return {
    review: parseReviewResult(content),
    candidateFirst,
  };
}

function reviewerCorrectlyIdentifiesCandidate(
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

function reviewerDetectionRisk(review: ReviewResult, candidateFirst: boolean): number {
  return reviewerCorrectlyIdentifiesCandidate(review, candidateFirst)
    ? review.confidence
    : 0;
}

function mean(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function mostFrequent(items: string[], limit = 3): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const normalized = compactLines(item);
    if (!normalized) {
      continue;
    }
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([item]) => item);
}

function candidatePasses(summary: CandidateSummary): boolean {
  return (
    summary.correct_rate <= MAX_CORRECT_RATE_FOR_ACCEPT &&
    summary.avg_detection_risk <= MAX_AVG_RISK_FOR_ACCEPT
  );
}

async function evaluateCandidate(
  imageSet: ImageSet,
  candidatePath: string,
  prompt: string,
  reviewsPerCandidate: number,
): Promise<CandidateReviewTrial[]> {
  const trials: CandidateReviewTrial[] = [];

  for (let i = 0; i < reviewsPerCandidate; i += 1) {
    const { review, candidateFirst } = await reviewCandidate(
      imageSet,
      candidatePath,
      prompt,
      Math.random() < 0.5,
    );
    const correctIdentification = reviewerCorrectlyIdentifiesCandidate(
      review,
      candidateFirst,
    );
    trials.push({
      candidate_first: candidateFirst,
      suspected_ai: review.suspected_ai,
      confidence: review.confidence,
      can_tell: review.can_tell,
      correct_identification: correctIdentification,
      detection_risk: reviewerDetectionRisk(review, candidateFirst),
      reasons: review.reasons,
      prompt_adjustments: review.prompt_adjustments,
      revised_prompt: review.revised_prompt,
    });
  }

  return trials;
}

function summarizeCandidate(
  candidateIndex: number,
  outputPath: string,
  reviewTrials: CandidateReviewTrial[],
): CandidateSummary {
  const correctRate = mean(
    reviewTrials.map((trial) => (trial.correct_identification ? 1 : 0)),
  );
  const avgDetectionRisk = mean(
    reviewTrials.map((trial) => trial.detection_risk),
  );
  const avgConfidence = mean(reviewTrials.map((trial) => trial.confidence));
  const summary: CandidateSummary = {
    candidate_index: candidateIndex,
    output_path: outputPath,
    review_trials: reviewTrials,
    correct_rate: correctRate,
    avg_detection_risk: avgDetectionRisk,
    avg_confidence: avgConfidence,
    accepted: false,
  };
  summary.accepted = candidatePasses(summary);
  return summary;
}

function compareCandidateSummaries(a: CandidateSummary, b: CandidateSummary): number {
  if (a.avg_detection_risk !== b.avg_detection_risk) {
    return a.avg_detection_risk - b.avg_detection_risk;
  }
  if (a.correct_rate !== b.correct_rate) {
    return a.correct_rate - b.correct_rate;
  }
  return a.avg_confidence - b.avg_confidence;
}

function buildPromptFromFeedback(
  currentPrompt: string,
  bestCandidate: CandidateSummary,
  priorFailureHints: string[],
): string {
  const revisedPrompt = bestCandidate.review_trials
    .map((trial) => compactLines(trial.revised_prompt))
    .find((value) => value.length > 0 && value !== compactLines(currentPrompt));
  if (revisedPrompt) {
    return appendPromptHints(revisedPrompt, priorFailureHints);
  }

  const promptAdjustments = mostFrequent(
    bestCandidate.review_trials.flatMap((trial) => trial.prompt_adjustments),
    6,
  );
  const reasons = mostFrequent(
    bestCandidate.review_trials.flatMap((trial) => trial.reasons),
    6,
  );
  const fallbackHints = [
    ...promptAdjustments,
    ...reasons,
    ...priorFailureHints,
    "emphasize natural skin and material micro-textures with subtle randomness",
    "avoid geometric symmetry and over-processed HDR contrast",
    "include camera realism: lens aberration, uneven sharpness, mild sensor grain, imperfect white balance",
  ];
  return appendPromptHints(currentPrompt, fallbackHints);
}

async function saveFinalImage(aiIndex: number, jpeg: Buffer): Promise<string> {
  const output = join(OUTPUT_DIR, `ai-${aiIndex}.jpg`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, jpeg);
  return output;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function selectImageSets(args: CliArgs): ImageSet[] {
  return imageSets
    .filter((imageSet) => imageSet.aiIndex >= args.startIndex)
    .slice(0, args.limit);
}

function mapFailureHints(holdoutEvaluations: HoldoutRecord[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const evaluation of holdoutEvaluations) {
    if (!evaluation.correct_identification) {
      continue;
    }
    map.set(evaluation.aiIndex, evaluation.dominant_reasons);
  }
  return map;
}

async function optimizeImageSet(
  imageSet: ImageSet,
  args: CliArgs,
  round: number,
  roundResumeEnabled: boolean,
  failureHints: string[],
): Promise<FinalRecord> {
  console.log(`\n[${imageSet.aiIndex}] round=${round} ${imageSet.category} -> ${basename(imageSet.real)}`);
  const existingOutput = join(OUTPUT_DIR, `ai-${imageSet.aiIndex}.jpg`);
  if (roundResumeEnabled && (await pathExists(existingOutput))) {
    console.log(`  resume: reusing existing ${basename(existingOutput)}`);
    return {
      aiIndex: imageSet.aiIndex,
      category: imageSet.category,
      real: imageSet.real,
      output: existingOutput,
      attempts: [],
      resolved: false,
      final_detection_risk: 1,
    };
  }

  const initial = await createInitialPrompt(imageSet, failureHints);
  let prompt = initial.prompt;
  const attempts: AttemptRecord[] = [];
  let resolved = false;
  let acceptedOutput = "";
  let bestOverall: { summary: CandidateSummary; jpeg: Buffer } | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    console.log(`  attempt ${attempt}/${MAX_ATTEMPTS}`);
    const candidateSummaries: CandidateSummary[] = [];
    let bestAttempt: { summary: CandidateSummary; jpeg: Buffer } | null = null;

    for (let candidateIndex = 0; candidateIndex < args.candidatesPerAttempt; candidateIndex += 1) {
      const generatedDataUrl = await generateCandidate(imageSet, prompt, candidateIndex);
      const jpeg = await convertToJpeg(generatedDataUrl);
      const candidatePath = await writeAttemptImage(
        imageSet.aiIndex,
        attempt,
        candidateIndex,
        jpeg,
      );
      const reviewTrials = await evaluateCandidate(
        imageSet,
        candidatePath,
        prompt,
        args.reviewsPerCandidate,
      );
      const summary = summarizeCandidate(candidateIndex, candidatePath, reviewTrials);
      candidateSummaries.push(summary);

      if (!bestAttempt || compareCandidateSummaries(summary, bestAttempt.summary) < 0) {
        bestAttempt = { summary, jpeg };
      }
      if (!bestOverall || compareCandidateSummaries(summary, bestOverall.summary) < 0) {
        bestOverall = { summary, jpeg };
      }
    }

    if (!bestAttempt) {
      throw new Error(`No candidate generated for ai-${imageSet.aiIndex} attempt ${attempt}`);
    }

    candidateSummaries.sort(compareCandidateSummaries);
    const accepted = bestAttempt.summary.accepted;
    attempts.push({
      attempt,
      prompt,
      candidate_summaries: candidateSummaries,
      best_candidate_index: bestAttempt.summary.candidate_index,
      accepted,
    });

    if (accepted) {
      acceptedOutput = await saveFinalImage(imageSet.aiIndex, bestAttempt.jpeg);
      resolved = true;
      console.log(
        `    accepted: candidate=${bestAttempt.summary.candidate_index} correct_rate=${bestAttempt.summary.correct_rate.toFixed(2)} avg_risk=${bestAttempt.summary.avg_detection_risk.toFixed(2)}`,
      );
      break;
    }

    prompt = buildPromptFromFeedback(prompt, bestAttempt.summary, failureHints);
    console.log(
      `    retrying: best candidate=${bestAttempt.summary.candidate_index} correct_rate=${bestAttempt.summary.correct_rate.toFixed(2)} avg_risk=${bestAttempt.summary.avg_detection_risk.toFixed(2)}`,
    );
  }

  if (!acceptedOutput && bestOverall) {
    acceptedOutput = await saveFinalImage(imageSet.aiIndex, bestOverall.jpeg);
    console.log(
      `    unresolved: saved lowest-risk candidate (risk=${bestOverall.summary.avg_detection_risk.toFixed(2)}, correct_rate=${bestOverall.summary.correct_rate.toFixed(2)})`,
    );
  }

  return {
    aiIndex: imageSet.aiIndex,
    category: imageSet.category,
    real: imageSet.real,
    output: acceptedOutput,
    attempts,
    resolved,
    final_detection_risk: bestOverall?.summary.avg_detection_risk ?? 1,
  };
}

async function runRound(
  imageSetsForRound: ImageSet[],
  args: CliArgs,
  round: number,
  roundResumeEnabled: boolean,
  failureHintsByIndex: Map<number, string[]>,
): Promise<FinalRecord[]> {
  const results: FinalRecord[] = [];
  for (const imageSet of imageSetsForRound) {
    const failureHints = failureHintsByIndex.get(imageSet.aiIndex) ?? [];
    const result = await optimizeImageSet(
      imageSet,
      args,
      round,
      roundResumeEnabled,
      failureHints,
    );
    results.push(result);
  }
  return results;
}

async function runHoldoutEvaluation(
  results: FinalRecord[],
  holdoutReviewsPerImage: number,
): Promise<{ evaluations: HoldoutRecord[]; summary: HoldoutSummary }> {
  const evaluations: HoldoutRecord[] = [];

  for (const result of results) {
    const imageSet = imageSets.find((set) => set.aiIndex === result.aiIndex);
    if (!imageSet || !result.output) {
      continue;
    }

    const passes: CandidateReviewTrial[] = [];
    for (let i = 0; i < holdoutReviewsPerImage; i += 1) {
      const { review, candidateFirst } = await reviewCandidate(
        imageSet,
        result.output,
        "Holdout evaluation. Decide which image is AI-generated.",
      );
      const correctIdentification = reviewerCorrectlyIdentifiesCandidate(
        review,
        candidateFirst,
      );
      passes.push({
        candidate_first: candidateFirst,
        suspected_ai: review.suspected_ai,
        confidence: review.confidence,
        can_tell: review.can_tell,
        correct_identification: correctIdentification,
        detection_risk: reviewerDetectionRisk(review, candidateFirst),
        reasons: review.reasons,
        prompt_adjustments: review.prompt_adjustments,
        revised_prompt: review.revised_prompt,
      });
    }

    const correctPasses = passes.filter((pass) => pass.correct_identification).length;
    const passCount = passes.length;
    const correctIdentification = passCount > 0 && correctPasses / passCount > 0.5;
    const avgDetectionRisk = mean(passes.map((pass) => pass.detection_risk));
    const avgConfidence = mean(passes.map((pass) => pass.confidence));
    const dominantReasons = mostFrequent(
      passes
        .filter((pass) => pass.correct_identification)
        .flatMap((pass) => pass.reasons),
      4,
    );

    evaluations.push({
      aiIndex: result.aiIndex,
      category: result.category,
      passes,
      correct_passes: correctPasses,
      pass_count: passCount,
      correct_identification: correctIdentification,
      avg_detection_risk: avgDetectionRisk,
      avg_confidence: avgConfidence,
      dominant_reasons: dominantReasons,
    });
  }

  const total = evaluations.length;
  const correctIdentifications = evaluations.filter(
    (entry) => entry.correct_identification,
  ).length;
  const successRate = total === 0 ? 0 : correctIdentifications / total;

  return {
    evaluations,
    summary: {
      total,
      correct_identifications: correctIdentifications,
      success_rate: successRate,
      greater_than_50_percent: successRate > 0.5,
    },
  };
}

async function runOptimization(args: CliArgs): Promise<{
  results: FinalRecord[];
  holdout: { evaluations: HoldoutRecord[]; summary: HoldoutSummary };
  optimization_rounds: OptimizationRoundRecord[];
}> {
  const selectedSets = selectImageSets(args);
  const resultMap = new Map<number, FinalRecord>();
  let failureHintsByIndex = new Map<number, string[]>();
  let setsForRound = [...selectedSets];
  let latestHoldout: { evaluations: HoldoutRecord[]; summary: HoldoutSummary } = {
    evaluations: [],
    summary: {
      total: 0,
      correct_identifications: 0,
      success_rate: 1,
      greater_than_50_percent: true,
    },
  };
  const optimizationRounds: OptimizationRoundRecord[] = [];

  for (let round = 1; round <= args.maxRounds; round += 1) {
    if (!setsForRound.length) {
      break;
    }

    console.log(
      `\n=== Optimization round ${round}/${args.maxRounds} (${setsForRound.length} images) ===`,
    );
    const roundResumeEnabled = round === 1 && args.resume;
    const roundResults = await runRound(
      setsForRound,
      args,
      round,
      roundResumeEnabled,
      failureHintsByIndex,
    );
    for (const roundResult of roundResults) {
      resultMap.set(roundResult.aiIndex, roundResult);
    }

    const consolidatedResults = selectedSets
      .map((set) => resultMap.get(set.aiIndex))
      .filter((result): result is FinalRecord => Boolean(result));
    latestHoldout = await runHoldoutEvaluation(
      consolidatedResults,
      args.holdoutReviewsPerImage,
    );

    const failingIndices = latestHoldout.evaluations
      .filter((evaluation) => evaluation.correct_identification)
      .map((evaluation) => evaluation.aiIndex);
    optimizationRounds.push({
      round,
      processed_indices: roundResults.map((result) => result.aiIndex),
      failing_indices_after_round: failingIndices,
      holdout_success_rate: latestHoldout.summary.success_rate,
    });

    console.log(
      `Round ${round} holdout success rate: ${(latestHoldout.summary.success_rate * 100).toFixed(1)}% (${latestHoldout.summary.correct_identifications}/${latestHoldout.summary.total})`,
    );

    if (latestHoldout.summary.success_rate <= args.targetSuccessRate) {
      break;
    }

    failureHintsByIndex = mapFailureHints(latestHoldout.evaluations);
    setsForRound = selectedSets.filter((set) => failingIndices.includes(set.aiIndex));
  }

  const finalResults = selectedSets
    .map((set) => resultMap.get(set.aiIndex))
    .filter((result): result is FinalRecord => Boolean(result));
  return {
    results: finalResults,
    holdout: latestHoldout,
    optimization_rounds: optimizationRounds,
  };
}

async function main() {
  const args = parseArgs();
  REQUEST_TIMEOUT_MS = args.requestTimeoutMs;
  const models = await listRelevantModels();
  printModels(models);

  if (args.listModels || args.dryRun) {
    return;
  }

  console.log(`\nGeneration model: ${GENERATION_MODEL}`);
  console.log(`Review model: ${REVIEW_MODEL}`);
  console.log(`Request timeout: ${REQUEST_TIMEOUT_MS}ms`);
  console.log(`Max attempts per image: ${MAX_ATTEMPTS}`);
  console.log(`Candidates per attempt: ${args.candidatesPerAttempt}`);
  console.log(`Review passes per candidate: ${args.reviewsPerCandidate}`);
  console.log(`Holdout review passes per image: ${args.holdoutReviewsPerImage}`);
  console.log(`Target holdout success rate: ${(args.targetSuccessRate * 100).toFixed(1)}%`);
  console.log(`Max optimization rounds: ${args.maxRounds}`);
  console.log(`Accept max correct rate: ${MAX_CORRECT_RATE_FOR_ACCEPT.toFixed(2)}`);
  console.log(`Accept max avg risk: ${MAX_AVG_RISK_FOR_ACCEPT.toFixed(2)}`);
  if (args.resume) {
    console.log("Resume mode: enabled for optimization round 1.");
  }
  if (args.startIndex > 0) {
    console.log(`Start index: ${args.startIndex}`);
  }

  const optimization = await runOptimization(args);

  const report = {
    generated_at: new Date().toISOString(),
    generation_model: GENERATION_MODEL,
    review_model: REVIEW_MODEL,
    max_attempts: MAX_ATTEMPTS,
    request_timeout_ms: REQUEST_TIMEOUT_MS,
    start_index: args.startIndex,
    resume: args.resume,
    target_success_rate: args.targetSuccessRate,
    max_optimization_rounds: args.maxRounds,
    candidates_per_attempt: args.candidatesPerAttempt,
    reviews_per_candidate: args.reviewsPerCandidate,
    holdout_reviews_per_image: args.holdoutReviewsPerImage,
    accept_max_correct_rate: MAX_CORRECT_RATE_FOR_ACCEPT,
    accept_max_avg_risk: MAX_AVG_RISK_FOR_ACCEPT,
    optimization_rounds: optimization.optimization_rounds,
    results: optimization.results,
    holdout_evaluation: optimization.holdout,
  };

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(
    `Holdout success rate: ${(optimization.holdout.summary.success_rate * 100).toFixed(1)}% (${optimization.holdout.summary.correct_identifications}/${optimization.holdout.summary.total})`,
  );
  console.log(
    `Reviewer correctly identifies generated image >50%: ${optimization.holdout.summary.greater_than_50_percent}`,
  );
  console.log(`\nWrote report: ${REPORT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
