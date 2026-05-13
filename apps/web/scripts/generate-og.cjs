const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const W = 1200;
const H = 630;

async function main() {
  const root = path.join(__dirname, "..");

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="8%" y1="0%" x2="92%" y2="100%">
      <stop offset="0%" stop-color="#d4c0c0"/>
      <stop offset="28%" stop-color="#f28c5f"/>
      <stop offset="55%" stop-color="#8b3328"/>
      <stop offset="100%" stop-color="#0f0c1d"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <text x="72" y="222" font-family="system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="42" font-weight="700" fill="#ffffff">Turn TikTok &amp; Instagram</text>
  <text x="72" y="284" font-family="system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="42" font-weight="700" fill="#ffdcc4">workouts into real training</text>
  <text x="72" y="352" font-family="system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="22" font-weight="500" fill="rgba(255,255,255,0.9)">Fitfo: share a Reel, train the plan</text>
</svg>`;

  const base = await sharp(Buffer.from(svg)).png().toBuffer();

  const logoPath = path.join(root, "public/vector-no-bg.png");
  const phonePath = path.join(root, "public/assets/IMG_4970.PNG");
  const composites = [];

  if (fs.existsSync(logoPath)) {
    const logo = await sharp(logoPath).resize({ height: 84 }).png().toBuffer();
    composites.push({ input: logo, top: 48, left: 72 });
  }

  if (fs.existsSync(phonePath)) {
    const phone = await sharp(phonePath)
      .resize({ height: 490, width: 238, fit: "cover", position: "top" })
      .png()
      .toBuffer();
    composites.push({ input: phone, top: 72, left: W - 278 });
  }

  await sharp(base)
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(path.join(root, "public/og-image.png"));

  if (fs.existsSync(logoPath)) {
    await sharp(logoPath)
      .resize(32, 32)
      .png()
      .toFile(path.join(root, "public/favicon-32x32.png"));
    await sharp(logoPath)
      .resize(16, 16)
      .png()
      .toFile(path.join(root, "public/favicon-16x16.png"));
    await sharp(logoPath)
      .resize(180, 180)
      .png()
      .toFile(path.join(root, "public/apple-touch-icon.png"));
  }

  console.log("Wrote public/og-image.png", composites.length ? `(+${composites.length} overlays)` : "");
  if (fs.existsSync(logoPath)) {
    console.log("Wrote favicon-16x16.png, favicon-32x32.png, apple-touch-icon.png");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
