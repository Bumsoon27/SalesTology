// 앱 아이콘 PNG 생성 (public/logo.svg 기준). 로고를 바꾸면 다시 실행: node scripts/generate-icons.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";

const logo = readFileSync("public/logo.svg");
// 꽉 찬 배경 아이콘용: 둥근 테두리 선을 뺀 로고
const bare = Buffer.from(logo.toString().replace(/<rect x="0\.5"[^>]*\/>/, ""));
const BG = { r: 10, g: 10, b: 12, alpha: 1 };

// 일반 아이콘: 둥근 사각형 로고 그대로
for (const size of [192, 512]) {
  await sharp(logo, { density: 384 }).resize(size, size).png().toFile(`public/icon-${size}.png`);
}

// maskable·Apple: 꽉 찬 검정 정사각형 + 안전 영역(가운데 72%) 안에 로고
async function padded(size, file) {
  const inner = Math.round(size * 0.72);
  const mark = await sharp(bare, { density: 384 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toFile(file);
}
await padded(512, "public/icon-maskable-512.png");
await padded(180, "public/apple-touch-icon.png");
console.log("icons generated");
