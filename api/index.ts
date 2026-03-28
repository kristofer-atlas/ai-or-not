import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readFileSync } from "fs";
import { join } from "path";

const imageSets = [
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

const categories = ["landscape", "portrait", "animal", "nature", "architecture", "fantasy"];

const leaderboard: { name: string; score: number; difficulty: string; date: string }[] = [];
const tournamentLeaderboard: { name: string; score: number; week: string; date: string }[] = [];
const globalStats = { totalGames: 0, totalCorrect: 0, totalPlayed: 0, bestScore: 0 };
const dailyStats: Record<string, { games: number; correct: number; players: Set<string> }> = {};

function getWeekSeed(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${weekNum}`;
}

const sessions = new Map<string, { aiPosition: number; difficulty: string; startTime: number }>();

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
    
    let shuffledIndices = availableSets.map((_, i) => i);
    
    if (seed) {
      let hash = 0;
      for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash = Math.abs(hash);
      for (let i = shuffledIndices.length - 1; i > 0; i--) {
        const j = (hash + i * 17) % (i + 1);
        [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
      }
    } else {
      shuffledIndices = shuffledIndices.sort(() => Math.random() - 0.5);
    }
    
    let poolSize = availableSets.length;
    if (difficulty === "hard") {
      poolSize = Math.min(10, availableSets.length);
    } else if (difficulty === "easy") {
      poolSize = Math.min(5, availableSets.length);
    }
    
    const setIndex = shuffledIndices[0];
    const aiPosition = Math.random() < 0.5 ? 0 : 1;
    const set = availableSets[setIndex];

    const [img0, img1] = await Promise.all([
      fetchImageAsDataUrl(set.real),
      fetchImageAsDataUrl(`/ai-images/ai-${set.aiIndex}.jpg`),
    ]);

    sessions.set(sessionId, { aiPosition, difficulty, startTime: Date.now() });

    return res.status(200).json({
      sessionId,
      images: [
        { url: aiPosition === 0 ? img1 : img0, id: 0 },
        { url: aiPosition === 1 ? img1 : img0, id: 1 },
      ],
      aiPosition,
      difficulty,
      category: set.category,
    });
  }

  if (action === "categories" && req.method === "GET") {
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
    const { name, score, difficulty } = body;
    if (name && typeof score === "number") {
      const date = new Date().toISOString().split("T")[0];
      leaderboard.push({ name: String(name).slice(0, 20), score, difficulty: difficulty || "normal", date });
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
    const { correct, total, playerId } = body;
    globalStats.totalGames++;
    globalStats.totalCorrect += correct || 0;
    globalStats.totalPlayed += total || 0;
    if (correct && total) {
      const date = new Date().toISOString().split("T")[0];
      if (!dailyStats[date]) dailyStats[date] = { games: 0, correct: 0, players: new Set() };
      dailyStats[date].games++;
      dailyStats[date].correct += correct;
      if (playerId) dailyStats[date].players.add(playerId);
    }
    return res.status(200).json({ stats: globalStats, daily: dailyStats });
  }

  if (action === "stats" && req.method === "GET") {
    const date = new Date().toISOString().split("T")[0];
    const today = dailyStats[date] || { games: 0, correct: 0, players: 0 };
    return res.status(200).json({
      stats: globalStats,
      today: { ...today, players: today.players?.size || 0 },
    });
  }

  if (action === "tournament-submit" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const { name, score } = body;
    const week = getWeekSeed();
    if (name && typeof score === "number") {
      tournamentLeaderboard.push({ name: String(name).slice(0, 20), score, week, date: new Date().toISOString().split("T")[0] });
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
