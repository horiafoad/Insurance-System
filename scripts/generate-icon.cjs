#!/usr/bin/env node
/**
 * Generate build/ASU-Engineering-System.ico from a square source image.
 *
 * Default source: src/assets/app-icon.png (the app icon artwork)
 * Usage: node scripts/generate-icon.cjs [path-to-source-png]
 */

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const srcPath = process.argv[2]
  ? path.resolve(root, process.argv[2])
  : path.join(root, "src", "assets", "app-icon.png");
const outPath = path.join(root, "build", "ASU-Engineering-System.ico");

async function generateIcon() {
  if (!fs.existsSync(srcPath)) {
    console.error("Source image not found:", srcPath);
    process.exit(1);
  }

  const sharp = require("sharp");
  const metadata = await sharp(srcPath).metadata();
  console.log("Source:", metadata.width, "x", metadata.height);

  const baseBuf = await sharp(srcPath)
    .resize(512, 512, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  const tmpPng = path.join(root, "_tmp_icon_512.png");
  fs.writeFileSync(tmpPng, baseBuf);

  const { default: pngToIco } = await import("png-to-ico");
  const icoBuffer = await pngToIco(tmpPng);
  fs.unlinkSync(tmpPng);

  fs.writeFileSync(outPath, icoBuffer);
  console.log("ICO created:", outPath, `(${(icoBuffer.length / 1024).toFixed(1)} KB)`);
}

generateIcon().catch((e) => {
  console.error(e);
  process.exit(1);
});