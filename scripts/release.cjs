#!/usr/bin/env node
/**
 * Release script for ASU Engineering System
 *
 * Usage:
 *   node scripts/release.cjs [patch|minor|major]
 *
 * This script:
 *   1. Bumps the version in package.json
 *   2. Runs Vite build
 *   3. Builds Windows installer with electron-builder
 *   4. Publishes to GitHub Releases (requires GH_TOKEN env var)
 *
 * Prerequisites:
 *   - Set GH_TOKEN environment variable with a GitHub Personal Access Token
 *     that has "repo" scope
 *   - node_modules must be installed
 *
 * Example:
 *   set GH_TOKEN=ghp_xxxxxxxxxxxx
 *   node scripts/release.cjs patch
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkgPath = path.join(root, "package.json");

function run(cmd) {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, { cwd: root, stdio: "inherit" });
}

function bumpVersion(type) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const [major, minor, patch] = pkg.version.split(".").map(Number);

  let newVersion;
  switch (type) {
    case "major":
      newVersion = `${major + 1}.0.0`;
      break;
    case "minor":
      newVersion = `${major}.${minor + 1}.0`;
      break;
    case "patch":
    default:
      newVersion = `${major}.${minor}.${patch + 1}`;
      break;
  }

  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`\nVersion bumped: ${pkg.version} (was ${major}.${minor}.${patch})`);
  return newVersion;
}

// --- Main ---

const versionType = process.argv[2] || "patch";

if (!["patch", "minor", "major"].includes(versionType)) {
  console.error("Usage: node scripts/release.cjs [patch|minor|major]");
  process.exit(1);
}

console.log("=== ASU Engineering System Release ===");
console.log(`Bump type: ${versionType}`);

// Step 1: Bump version
const newVersion = bumpVersion(versionType);

// Step 2: Vite build
run("npm run build");

// Step 3: Build Windows installer + publish to GitHub
// electron-builder will create the NSIS installer and upload to GitHub Releases
if (process.env.GH_TOKEN) {
  console.log("\nGH_TOKEN found. Publishing to GitHub Releases...");
  run("npx electron-builder --win --publish always");
  console.log(`\n=== Release v${newVersion} published! ===`);
  console.log(`GitHub Release: https://github.com/horiafoad/Insurance-System/releases/tag/v${newVersion}`);
} else {
  console.log("\nGH_TOKEN not set. Building installer locally (no publish)...");
  run("npx electron-builder --win --publish never");
  console.log(`\n=== Installer v${newVersion} built locally ===`);
  console.log("To publish to GitHub Releases, run with GH_TOKEN:");
  console.log("  set GH_TOKEN=your_token_here");
  console.log("  node scripts/release.cjs patch");
}

console.log("\nDone!");
