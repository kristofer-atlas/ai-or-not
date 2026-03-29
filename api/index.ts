import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readFileSync } from "fs";
import { join } from "path";

interface GameImageSet {
  id: string;
  slot: number;
  category: string;
  realDisplayUrl: string;
  realSourceUrl: string;
  realAuthor: string;
  realCapturedAt: string | null;
  realSourceName: string;
  realTitle: string | null;
  aiPath: string;
  generationModel: string;
  generationPrompt: string;
  generatedAt: string | null;
}

interface DatasetEntry {
  id?: unknown;
  slot?: unknown;
  category?: unknown;
  active?: unknown;
  real?: {
    display_url?: unknown;
    source_url?: unknown;
    author?: unknown;
    captured_at?: unknown;
    source_name?: unknown;
    title?: unknown;
  };
  generated?: {
    path?: unknown;
    model?: unknown;
    prompt?: unknown;
    generated_at?: unknown;
  };
}

interface DatasetFile {
  entries?: unknown;
}

const DATASET_PATH = join(process.cwd(), "public", "ai-images", "dataset.json");

const LEGACY_IMAGE_SETS: GameImageSet[] = [
  { id: "legacy-0", slot: 0, category: "landscape", realDisplayUrl: "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 0", aiPath: "/ai-images/ai-0.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-1", slot: 1, category: "portrait", realDisplayUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 1", aiPath: "/ai-images/ai-1.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-2", slot: 2, category: "landscape", realDisplayUrl: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 2", aiPath: "/ai-images/ai-2.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-3", slot: 3, category: "nature", realDisplayUrl: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 3", aiPath: "/ai-images/ai-3.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-4", slot: 4, category: "animal", realDisplayUrl: "https://images.unsplash.com/photo-1529778873920-4da4926a72c2?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1529778873920-4da4926a72c2?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 4", aiPath: "/ai-images/ai-4.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-5", slot: 5, category: "portrait", realDisplayUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 5", aiPath: "/ai-images/ai-5.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-6", slot: 6, category: "landscape", realDisplayUrl: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 6", aiPath: "/ai-images/ai-6.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-7", slot: 7, category: "landscape", realDisplayUrl: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 7", aiPath: "/ai-images/ai-7.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-8", slot: 8, category: "architecture", realDisplayUrl: "https://images.unsplash.com/photo-1516117172878-fd2c41f4a759?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1516117172878-fd2c41f4a759?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 8", aiPath: "/ai-images/ai-8.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-9", slot: 9, category: "fantasy", realDisplayUrl: "https://images.unsplash.com/photo-1493238792000-8113da705763?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1493238792000-8113da705763?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 9", aiPath: "/ai-images/ai-9.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-10", slot: 10, category: "architecture", realDisplayUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 10", aiPath: "/ai-images/ai-10.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-11", slot: 11, category: "fantasy", realDisplayUrl: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 11", aiPath: "/ai-images/ai-11.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-12", slot: 12, category: "nature", realDisplayUrl: "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 12", aiPath: "/ai-images/ai-12.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-13", slot: 13, category: "landscape", realDisplayUrl: "https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 13", aiPath: "/ai-images/ai-13.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-14", slot: 14, category: "fantasy", realDisplayUrl: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 14", aiPath: "/ai-images/ai-14.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-15", slot: 15, category: "fantasy", realDisplayUrl: "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 15", aiPath: "/ai-images/ai-15.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-16", slot: 16, category: "fantasy", realDisplayUrl: "https://images.unsplash.com/photo-1465146633011-14f860dc2c2c?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1465146633011-14f860dc2c2c?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 16", aiPath: "/ai-images/ai-16.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-17", slot: 17, category: "fantasy", realDisplayUrl: "https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 17", aiPath: "/ai-images/ai-17.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-18", slot: 18, category: "fantasy", realDisplayUrl: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 18", aiPath: "/ai-images/ai-18.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
  { id: "legacy-19", slot: 19, category: "fantasy", realDisplayUrl: "https://images.unsplash.com/photo-1494500764479-0c8f2919a3d8?w=600&h=600&fit=crop", realSourceUrl: "https://images.unsplash.com/photo-1494500764479-0c8f2919a3d8?w=600&h=600&fit=crop", realAuthor: "Unknown (legacy seed)", realCapturedAt: null, realSourceName: "legacy-unsplash", realTitle: "Legacy seed image 19", aiPath: "/ai-images/ai-19.jpg", generationModel: "legacy-unknown", generationPrompt: "Legacy seed prompt unavailable.", generatedAt: null },
];

interface LeaderboardEntry { name: string; score: number; difficulty: string; date: string }
interface TournamentEntry { name: string; score: number; week: string; date: string }
interface Session { aiPosition: number; difficulty: string; startTime: number }
interface DailyStat { games: number; correct: number; players: Set<string> }

const leaderboard: LeaderboardEntry[] = [];
const tournamentLeaderboard: TournamentEntry[] = [];
const globalStats = { totalGames: 0, totalCorrect: 0, totalPlayed: 0, bestScore: 0 };
const dailyStats: Record<string, DailyStat> = {};

function getWeekSeed(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${weekNum}`;
}

const sessions = new Map<string, Session>();

function toOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function toDatasetSet(entry: DatasetEntry): GameImageSet | null {
  if (entry.active === false) {
    return null;
  }
  const slot = typeof entry.slot === "number" ? entry.slot : null;
  if (slot === null || !Number.isFinite(slot) || slot < 0) {
    return null;
  }

  const category = toOptionalString(entry.category)?.toLowerCase() ?? "uncategorized";
  const realDisplayUrl = toOptionalString(entry.real?.display_url);
  const aiPath = toOptionalString(entry.generated?.path);
  if (!realDisplayUrl || !aiPath) {
    return null;
  }

  return {
    id: toOptionalString(entry.id) ?? `dataset-${slot}`,
    slot,
    category,
    realDisplayUrl,
    realSourceUrl: toOptionalString(entry.real?.source_url) ?? realDisplayUrl,
    realAuthor: toOptionalString(entry.real?.author) ?? "Unknown",
    realCapturedAt: toOptionalString(entry.real?.captured_at),
    realSourceName: toOptionalString(entry.real?.source_name) ?? "unknown-source",
    realTitle: toOptionalString(entry.real?.title),
    aiPath,
    generationModel: toOptionalString(entry.generated?.model) ?? "unknown-model",
    generationPrompt: toOptionalString(entry.generated?.prompt) ?? "Prompt unavailable",
    generatedAt: toOptionalString(entry.generated?.generated_at),
  };
}

function loadImageSets(): GameImageSet[] {
  try {
    const raw = readFileSync(DATASET_PATH, "utf8");
    const parsed = JSON.parse(raw) as DatasetFile;
    if (!Array.isArray(parsed.entries)) {
      return LEGACY_IMAGE_SETS;
    }
    const fromDataset = parsed.entries
      .map((entry) => toDatasetSet(entry as DatasetEntry))
      .filter((entry): entry is GameImageSet => Boolean(entry))
      .sort((a, b) => a.slot - b.slot);
    if (fromDataset.length) {
      return fromDataset;
    }
  } catch {
    // Fallback for first deploys before dataset.json exists.
  }
  return LEGACY_IMAGE_SETS;
}

function listCategories(imageSets: GameImageSet[]): string[] {
  return [...new Set(imageSets.map((set) => set.category))].sort();
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  if (url.startsWith("/")) {
    const buffer = readFileSync(join(process.cwd(), "public", url));
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  }
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const mimeType = response.headers.get("content-type") || "image/jpeg";
  return `data:${mimeType};base64,${base64}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const action = url.searchParams.get("action");

  if (action === "new-round" && req.method === "GET") {
    const imageSets = loadImageSets();
    const categories = listCategories(imageSets);
    const difficulty = url.searchParams.get("difficulty") || "normal";
    const category = url.searchParams.get("category");
    const seed = url.searchParams.get("seed");
    const sessionId = crypto.randomUUID();
    
    let availableSets = category && category !== "all" 
      ? imageSets.filter(s => s.category === category)
      : imageSets;
    
    if (availableSets.length === 0) {
      availableSets = imageSets;
    }
    
    let shuffledIndices: number[] = availableSets.map((_, i) => i);
    
    if (seed) {
      let hash = 0;
      for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash = Math.abs(hash);
      for (let i = shuffledIndices.length - 1; i > 0; i--) {
        const j = (hash + i * 17) % (i + 1);
        const temp = shuffledIndices[i]!;
        shuffledIndices[i] = shuffledIndices[j]!;
        shuffledIndices[j] = temp;
      }
    } else {
      shuffledIndices = shuffledIndices.sort(() => Math.random() - 0.5);
    }
    
    const setIndex = shuffledIndices[0] ?? 0;
    const aiPosition = Math.random() < 0.5 ? 0 : 1;
    const set = availableSets[setIndex]!;

    const [img0, img1] = await Promise.all([
      fetchImageAsDataUrl(set.realDisplayUrl),
      fetchImageAsDataUrl(set.aiPath),
    ]);

    sessions.set(sessionId, { aiPosition, difficulty, startTime: Date.now() });

    const analysisData = [
      generateAnalysis(set.slot, aiPosition === 0),
      generateAnalysis(set.slot, aiPosition === 1),
    ];

    return res.status(200).json({
      sessionId,
      images: [
        { url: aiPosition === 0 ? img1 : img0, id: 0 },
        { url: aiPosition === 1 ? img1 : img0, id: 1 },
      ],
      analysis: analysisData,
      aiPosition,
      difficulty,
      category: set.category,
      pairMetadata: {
        datasetId: set.id,
        slot: set.slot,
        real: {
          sourceUrl: set.realSourceUrl,
          author: set.realAuthor,
          capturedAt: set.realCapturedAt,
          source: set.realSourceName,
          title: set.realTitle,
        },
        generation: {
          model: set.generationModel,
          prompt: set.generationPrompt,
          generatedAt: set.generatedAt,
        },
      },
    });
  }

  function generateAnalysis(slot: number, isAI: boolean) {
    const seed = slot * 17 + (isAI ? 13 : 7);
    const rand = (offset: number) => ((seed * 31 + offset * 47) % 100) / 100;
    
    if (isAI) {
      return {
        type: 'ai',
        colorPalette: ['vibrant', 'saturated', 'hyper-realistic'][slot % 3],
        artifactMarkers: ['facial asymmetry', 'hand deformities', 'text corruption'][slot % 3],
        textureQuality: ['unnatural skin', 'perfect lighting', 'idealized features'][slot % 3],
        symmetryScore: 60 + Math.floor(rand(1) * 30),
        detailLevel: ['over-rendered', 'excessive clarity', 'smoothed'][slot % 3],
        lighting: ['studio-perfect', 'dramatic', 'ethereal'][slot % 3],
        background: ['soft blur', 'depth-of-field', 'perfect bokeh'][slot % 3],
        patterns: ['repeating', 'mathematical', 'symmetric'][slot % 3],
        tells: [
          'Unnatural skin texture with visible pore smoothing',
          'Slight asymmetry in facial features (eyebrows, ears)',
          'Perfect but unrealistic hair strands',
          'Background elements with AI-generated artifacts',
        ][slot % 4],
      };
    } else {
      return {
        type: 'real',
        colorPalette: ['natural', 'warm', 'muted'][slot % 3],
        artifactMarkers: ['film grain', 'natural noise', 'lens artifacts'][slot % 3],
        textureQuality: ['organic', 'realistic', 'natural imperfection'][slot % 3],
        symmetryScore: 80 + Math.floor(rand(2) * 15),
        detailLevel: ['natural detail', 'realistic', 'organic'][slot % 3],
        lighting: ['natural light', 'mixed', 'available'][slot % 3],
        background: ['natural blur', 'real depth', 'practical'][slot % 3],
        patterns: ['natural', 'random', 'varied'][slot % 3],
        tells: [
          'Natural skin texture with realistic pores and variation',
          'Authentic lighting with subtle shadows',
          'Real background depth and bokeh',
          'Organic imperfections typical of camera capture',
        ][slot % 4],
      };
    }
  }

  if (action === "categories" && req.method === "GET") {
    const imageSets = loadImageSets();
    const categories = listCategories(imageSets);
    const categoryCounts: Record<string, number> = {};
    for (const cat of categories) {
      categoryCounts[cat] = imageSets.filter(s => s.category === cat).length;
    }
    return res.status(200).json({ categories, counts: categoryCounts });
  }

  if (action === "guess" && req.method === "POST") {
    const sessionId = url.searchParams.get("sessionId");
    const guessId = parseInt(url.searchParams.get("guessId") || "-1");

    if (!sessionId || guessId === -1) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(400).json({ error: "Invalid session" });
    }

    const correct = guessId === session.aiPosition;
    const responseTime = Date.now() - session.startTime;
    sessions.delete(sessionId);

    return res.status(200).json({ correct, aiPosition: session.aiPosition, responseTime });
  }

  if (action === "leaderboard" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const name = body.name as string | undefined;
    const score = body.score as number | undefined;
    const difficulty = (body.difficulty as string | undefined) || "normal";
    if (name && typeof score === "number") {
      const date = new Date().toISOString().split("T")[0]!;
      leaderboard.push({ name: String(name).slice(0, 20), score, difficulty: difficulty!, date });
      leaderboard.sort((a, b) => b.score - a.score);
      leaderboard.splice(50);
    }
    return res.status(200).json({ leaderboard: leaderboard.slice(0, 10) });
  }

  if (action === "leaderboard" && req.method === "GET") {
    return res.status(200).json({ leaderboard: leaderboard.slice(0, 10) });
  }

  if (action === "stats" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const correct = body.correct as number | undefined;
    const total = body.total as number | undefined;
    const playerId = body.playerId as string | undefined;
    globalStats.totalGames++;
    globalStats.totalCorrect += correct || 0;
    globalStats.totalPlayed += total || 0;
    if (correct && total) {
      const date = new Date().toISOString().split("T")[0]!;
      if (!dailyStats[date]) dailyStats[date] = { games: 0, correct: 0, players: new Set() };
      const stat = dailyStats[date]!;
      stat.games++;
      stat.correct += correct;
      if (playerId) stat.players.add(playerId);
    }
    return res.status(200).json({ stats: globalStats, daily: dailyStats });
  }

  if (action === "stats" && req.method === "GET") {
    const date = new Date().toISOString().split("T")[0]!;
    const today = dailyStats[date] ?? { games: 0, correct: 0, players: new Set<string>() };
    return res.status(200).json({
      stats: globalStats,
      today: { ...today, players: today.players?.size || 0 },
    });
  }

  if (action === "tournament-submit" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const name = body.name as string | undefined;
    const score = body.score as number | undefined;
    const week = getWeekSeed();
    if (name && typeof score === "number") {
      const safeName = String(name).slice(0, 20);
      tournamentLeaderboard.push({ name: safeName, score, week, date: new Date().toISOString().split("T")[0]! });
      tournamentLeaderboard.sort((a, b) => b.score - a.score);
      tournamentLeaderboard.splice(100);
    }
    const weekEntries = tournamentLeaderboard.filter(e => e.week === week);
    const rank = weekEntries.findIndex(e => e.name === String(name).slice(0, 20) && e.score === score) + 1;
    return res.status(200).json({ rank, total: weekEntries.length, week });
  }

  if (action === "tournament-leaderboard" && req.method === "GET") {
    const week = url.searchParams.get("week") || getWeekSeed();
    const weekEntries = tournamentLeaderboard.filter(e => e.week === week);
    return res.status(200).json({ leaderboard: weekEntries.slice(0, 20), week });
  }

  if (action === "tournament-week" && req.method === "GET") {
    return res.status(200).json({ week: getWeekSeed() });
  }

  return res.status(404).json({ error: "Not found" });
}
