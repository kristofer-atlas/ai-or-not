import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface ImageSet {
  real: string;
  aiIndex: number;
  category: string;
}

interface HoldoutSummary {
  total: number;
  correct_identifications: number;
  success_rate: number;
  greater_than_50_percent: boolean;
}

const PUBLIC_DIR = join(process.cwd(), "public");
const IMAGE_DIR = join(PUBLIC_DIR, "ai-images");
const REPORT_PATH = join(IMAGE_DIR, "openrouter-review-report.json");
const PORT = Number(process.env.LOCAL_GALLERY_PORT ?? "3434");
const HOST = "127.0.0.1";

const imageSets: ImageSet[] = [
  { real: "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=1200&h=1200&fit=crop", aiIndex: 0, category: "landscape" },
  { real: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=1200&h=1200&fit=crop", aiIndex: 1, category: "portrait" },
  { real: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200&h=1200&fit=crop", aiIndex: 2, category: "landscape" },
  { real: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200&h=1200&fit=crop", aiIndex: 3, category: "nature" },
  { real: "https://images.unsplash.com/photo-1529778873920-4da4926a72c2?w=1200&h=1200&fit=crop", aiIndex: 4, category: "animal" },
  { real: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200&h=1200&fit=crop", aiIndex: 5, category: "portrait" },
  { real: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=1200&h=1200&fit=crop", aiIndex: 6, category: "landscape" },
  { real: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1200&h=1200&fit=crop", aiIndex: 7, category: "landscape" },
  { real: "https://images.unsplash.com/photo-1516117172878-fd2c41f4a759?w=1200&h=1200&fit=crop", aiIndex: 8, category: "architecture" },
  { real: "https://images.unsplash.com/photo-1493238792000-8113da705763?w=1200&h=1200&fit=crop", aiIndex: 9, category: "fantasy" },
  { real: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=1200&fit=crop", aiIndex: 10, category: "architecture" },
  { real: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1200&h=1200&fit=crop", aiIndex: 11, category: "fantasy" },
  { real: "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=1200&h=1200&fit=crop", aiIndex: 12, category: "nature" },
  { real: "https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=1200&h=1200&fit=crop", aiIndex: 13, category: "landscape" },
  { real: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&h=1200&fit=crop", aiIndex: 14, category: "fantasy" },
  { real: "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1200&h=1200&fit=crop", aiIndex: 15, category: "fantasy" },
  { real: "https://images.unsplash.com/photo-1465146633011-14f860dc2c2c?w=1200&h=1200&fit=crop", aiIndex: 16, category: "fantasy" },
  { real: "https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=1200&h=1200&fit=crop", aiIndex: 17, category: "fantasy" },
  { real: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1200&h=1200&fit=crop", aiIndex: 18, category: "fantasy" },
  { real: "https://images.unsplash.com/photo-1494500764479-0c8f2919a3d8?w=1200&h=1200&fit=crop", aiIndex: 19, category: "fantasy" },
];

function readHoldoutSummary(): HoldoutSummary | null {
  if (!existsSync(REPORT_PATH)) {
    return null;
  }

  const report = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as {
    holdout_evaluation?: { summary?: HoldoutSummary };
  };

  return report.holdout_evaluation?.summary ?? null;
}

function renderHtml() {
  const holdout = readHoldoutSummary();
  const cards = imageSets
    .map((set) => {
      return `
        <article class="pair-card">
          <div class="pair-header">
            <div>
              <span class="pair-index">#${set.aiIndex}</span>
              <span class="pair-category">${set.category}</span>
            </div>
            <a href="/ai-images/ai-${set.aiIndex}.jpg" target="_blank" rel="noreferrer">open generated</a>
          </div>
          <div class="pair-grid">
            <figure>
              <img loading="lazy" src="${set.real}" alt="Real reference ${set.aiIndex}" />
              <figcaption>Real counterpart</figcaption>
            </figure>
            <figure>
              <img loading="lazy" src="/ai-images/ai-${set.aiIndex}.jpg" alt="Generated image ${set.aiIndex}" />
              <figcaption>Generated image</figcaption>
            </figure>
          </div>
        </article>
      `;
    })
    .join("");

  const summary = holdout
    ? `
      <section class="summary">
        <div><strong>Holdout success rate</strong><span>${(holdout.success_rate * 100).toFixed(1)}%</span></div>
        <div><strong>Correct IDs</strong><span>${holdout.correct_identifications}/${holdout.total}</span></div>
        <div><strong>> 50%</strong><span>${String(holdout.greater_than_50_percent)}</span></div>
      </section>
    `
    : `
      <section class="summary summary-empty">
        <div>Holdout report not found at <code>public/ai-images/openrouter-review-report.json</code>.</div>
      </section>
    `;

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Local AI Gallery</title>
      <style>
        :root {
          color-scheme: dark;
          --bg: #0e1116;
          --panel: #171c24;
          --panel-border: #283242;
          --text: #ecf2ff;
          --muted: #97a6ba;
          --accent: #6dd3fb;
          --accent-2: #ffd166;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: "Iosevka Aile", "IBM Plex Sans", sans-serif;
          background:
            radial-gradient(circle at top left, rgba(109, 211, 251, 0.12), transparent 28%),
            radial-gradient(circle at top right, rgba(255, 209, 102, 0.14), transparent 22%),
            var(--bg);
          color: var(--text);
        }
        main {
          width: min(1400px, calc(100vw - 32px));
          margin: 0 auto;
          padding: 32px 0 48px;
        }
        h1 {
          margin: 0 0 8px;
          font-size: clamp(2rem, 4vw, 3.5rem);
          letter-spacing: -0.04em;
        }
        .lede {
          margin: 0 0 24px;
          color: var(--muted);
          max-width: 70ch;
        }
        .summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }
        .summary div {
          background: rgba(23, 28, 36, 0.88);
          border: 1px solid var(--panel-border);
          border-radius: 16px;
          padding: 14px 16px;
        }
        .summary strong,
        .summary code {
          display: block;
          color: var(--muted);
          font-size: 0.88rem;
          margin-bottom: 6px;
        }
        .summary span {
          font-size: 1.35rem;
          font-weight: 700;
        }
        .summary-empty div {
          grid-column: 1 / -1;
        }
        .pairs {
          display: grid;
          gap: 18px;
        }
        .pair-card {
          background: rgba(23, 28, 36, 0.88);
          border: 1px solid var(--panel-border);
          border-radius: 20px;
          overflow: hidden;
        }
        .pair-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 16px 18px;
          border-bottom: 1px solid rgba(151, 166, 186, 0.15);
        }
        .pair-header a {
          color: var(--accent);
          text-decoration: none;
          font-size: 0.9rem;
        }
        .pair-index {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 42px;
          padding: 4px 10px;
          margin-right: 8px;
          border-radius: 999px;
          background: rgba(109, 211, 251, 0.16);
          color: var(--accent);
          font-weight: 700;
        }
        .pair-category {
          color: var(--accent-2);
          text-transform: capitalize;
          font-weight: 600;
        }
        .pair-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          padding: 16px;
        }
        figure {
          margin: 0;
        }
        img {
          width: 100%;
          display: block;
          aspect-ratio: 1;
          object-fit: cover;
          border-radius: 14px;
          background: #0b0f14;
        }
        figcaption {
          padding-top: 10px;
          color: var(--muted);
          font-size: 0.92rem;
        }
        @media (max-width: 760px) {
          .pair-grid {
            grid-template-columns: 1fr;
          }
          main {
            width: min(100vw - 20px, 1400px);
            padding-top: 20px;
          }
        }
      </style>
    </head>
    <body>
      <main>
        <h1>Local Generated vs Real Gallery</h1>
        <p class="lede">This page is served only by the local Bun gallery server bound to 127.0.0.1. It does not modify the main app and is intended only for dev inspection of each generated image beside its real counterpart.</p>
        ${summary}
        <section class="pairs">${cards}</section>
      </main>
    </body>
  </html>`;
}

function serveStaticImage(pathname: string) {
  const localPath = join(PUBLIC_DIR, pathname);
  if (!existsSync(localPath)) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(readFileSync(localPath), {
    headers: { "content-type": "image/jpeg" },
  });
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/gallery") {
      return new Response(renderHtml(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname.startsWith("/ai-images/")) {
      return serveStaticImage(url.pathname);
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Local gallery available at http://${HOST}:${server.port}/gallery`);
