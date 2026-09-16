#!/usr/bin/env node
/**
 * Generate PWA icons from the ASU Engineering System source icon.
 *
 * Source: src/assets/app-icon.png (same source used for build/ASU-Engineering-System.ico)
 * Output: public/icons/*
 */

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const srcPath = path.join(root, "src", "assets", "app-icon.png");
const outDir = path.join(root, "public", "icons");

async function main() {
  if (!fs.existsSync(srcPath)) {
    console.error("Source image not found:", srcPath);
    process.exit(1);
  }

  const sharp = require("sharp");
  fs.mkdirSync(outDir, { recursive: true });

  const artwork = sharp(srcPath);
  const meta = await artwork.metadata();
  console.log("Source:", meta.width, "x", meta.height);

  // 1) Standard icons — same design as the Windows .ico (fit: cover)
  await sharp(srcPath)
    .resize(192, 192, { fit: "cover", position: "centre" })
    .png()
    .toFile(path.join(outDir, "icon-192.png"));
  console.log("icon-192.png ✓");

  await sharp(srcPath)
    .resize(512, 512, { fit: "cover", position: "centre" })
    .png()
    .toFile(path.join(outDir, "icon-512.png"));
  console.log("icon-512.png ✓");

  // 2) Maskable icons — artwork at 70% on full white canvas (safe zone)
  const base = 512;
  const inner = Math.floor(base * 0.7);
  const masked = await sharp({
    create: { width: base, height: base, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } },
  })
    .composite([
      {
        input: await sharp(srcPath)
          .resize(inner, inner, { fit: "cover", position: "centre" })
          .toBuffer(),
        gravity: "centre",
      },
    ])
    .png()
    .toBuffer();
  await sharp(masked).resize(192, 192).png().toFile(path.join(outDir, "icon-maskable-192.png"));
  await sharp(masked).resize(512, 512).png().toFile(path.join(outDir, "icon-maskable-512.png"));
  console.log("icon-maskable-192.png ✓");
  console.log("icon-maskable-512.png ✓");

  // 3) Apple touch icons
  await sharp(srcPath)
    .resize(180, 180, { fit: "cover", position: "centre" })
    .png()
    .toFile(path.join(outDir, "apple-touch-icon.png"));
  await sharp(srcPath)
    .resize(152, 152, { fit: "cover", position: "centre" })
    .png()
    .toFile(path.join(outDir, "apple-touch-icon-152.png"));
  console.log("apple-touch-icon.png ✓");
  console.log("apple-touch-icon-152.png ✓");

  // 4) Favicon (48x48)
  await sharp(srcPath)
    .resize(48, 48, { fit: "cover", position: "centre" })
    .png()
    .toFile(path.join(outDir, "favicon-48.png"));
  console.log("favicon-48.png ✓");

  console.log("\nAll PWA icons generated in public/icons/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});