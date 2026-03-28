import { writeFileSync, mkdirSync } from "fs";
import { createCanvas } from "canvas";

const OUTPUT_DIR = "./public/ai-images";
mkdirSync(OUTPUT_DIR, { recursive: true });

const aiPrompts = [
  "a beautiful mountain sunset landscape with pine trees",
  "a portrait photo of a young woman with long hair smiling",
  "a snowy mountain range at night with stars and full moon",
  "a breathtaking waterfall in a tropical rainforest",
  "an adorable kitten with bright blue eyes playing",
  "a handsome man with beard wearing a leather jacket",
  "a stunning ocean beach at sunset with palm trees",
  "a green meadow with red flowers and a wooden barn",
  "a cozy library with thousands of books and fireplace",
  "a robotic humanoid face with metallic skin",
  "an ancient castle on a cliff with dragons flying",
  "a magical forest with glowing mushrooms",
  "a hidden waterfall inside a crystal cave",
  "a cherry blossom garden with Japanese pavilion",
  "a futuristic city with flying cars and neon lights",
  "a phoenix rising from flames in dramatic sky",
  "floating islands with waterfalls falling into clouds",
  "a space station orbiting a ringed planet",
  "a cyberpunk street scene with holographic ads",
  "a mystical library with floating books and portals",
];

function drawGradientImage(ctx: any, width: number, height: number, index: number, prompt: string) {
  const hue1 = (index * 47) % 360;
  const hue2 = (hue1 + 40) % 360;

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsl(${hue1}, 70%, 50%)`);
  gradient.addColorStop(0.5, `hsl(${hue2}, 60%, 40%)`);
  gradient.addColorStop(1, `hsl(${hue1}, 80%, 30%)`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 50; i++) {
    ctx.beginPath();
    ctx.arc(
      Math.random() * width,
      Math.random() * height,
      Math.random() * 100 + 20,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = `hsla(${hue2}, 70%, 70%, ${Math.random() * 0.3})`;
    ctx.fill();
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(width / 2 - 150, height / 2 - 40, 300, 80);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("AI-Generated", width / 2, height / 2 - 15);

  ctx.font = "16px Arial";
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.fillText(`Sample #${index + 1}`, width / 2, height / 2 + 25);
}

for (let i = 0; i < aiPrompts.length; i++) {
  const canvas = createCanvas(600, 600);
  const ctx = canvas.getContext("2d");
  drawGradientImage(ctx, 600, 600, i, aiPrompts[i]);
  const buffer = canvas.toBuffer("image/jpeg", { quality: 85 });
  writeFileSync(`${OUTPUT_DIR}/ai-${i}.jpg`, buffer);
  console.log(`✓ Saved ai-${i}.jpg`);
}

console.log("\nDone! Note: These are placeholder images.");
console.log("Replace with real AI-generated images using an image generation API.");
