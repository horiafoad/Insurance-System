#!/usr/bin/env node
/**
 * Release script for ASU Engineering System — automatic.
 *
 * Usage:
 *   node scripts/release.cjs [patch|minor|major]
 *   npm run release            (bump patch, default)
 *   npm run release:minor
 *   npm run release:major
 *
 * Steps:
 *   1. Bumps version in package.json
 *   2. Runs Vite build
 *   3. Creates and pushes the git tag vX.Y.Z (required by GitHub before release)
 *   4. Builds Windows installer with electron-builder
 *   5. Publishes to GitHub Releases
 *
 * Token sources (checked in order):
 *   - process.env.GH_TOKEN
 *   - a file named "release.token" in the project root (git-ignored)
 *
 * If no token is found, the installer is built locally without publishing.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const remoteUrl = (token) =>
  `https://x-access-token:${token}@github.com/horiafoad/Insurance-System.git`;

function run(cmd) {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, { cwd: root, stdio: "inherit" });
}

function tryRun(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function getToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  const tokenPath = path.join(root, "release.token");
  if (fs.existsSync(tokenPath)) {
    const token = fs.readFileSync(tokenPath, "utf8").trim();
    if (token) return token;
  }
  return null;
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

function ensureAndPushTag(version, token) {
  const tag = `v${version}`;
  const exists = tryRun(`git rev-parse -q --verify refs/tags/${tag}`);
  if (!exists) {
    run(`git tag ${tag}`);
  } else {
    console.log(`\nTag ${tag} already exists locally.`);
  }

  try {
    run(`git push ${remoteUrl(token)} ${tag}`);
  } catch {
    console.log(`\nTag ${tag} already exists remotely (push skipped).`);
  }
}

// --- Main ---

const versionType = process.argv[2] || "patch";

if (!["patch", "minor", "major"].includes(versionType)) {
  console.error("Usage: node scripts/release.cjs [patch|minor|major]");
  process.exit(1);
}

const token = getToken();

console.log("=== ASU Engineering System Automatic Release ===");
console.log(`Bump type: ${versionType}`);
console.log(`Publishing: ${token ? "YES (GitHub Releases)" : "NO (local installer only)"}`);

// Step 1: Bump version
const newVersion = bumpVersion(versionType);

// Step 2: Vite build
run("npm run build");

// Step 3: Create + push tag (GitHub requires the tag before creating the release)
if (token) {
  ensureAndPushTag(newVersion, token);
}

// Step 4/5: Build Windows installer and publish
if (token) {
  process.env.GH_TOKEN = token;
  console.log("\nBuilding + publishing to GitHub Releases...");
  run("npx electron-builder --win --publish always");
  console.log(`\n=== Release v${newVersion} published! ===`);
  console.log(`GitHub Release: https://github.com/horiafoad/Insurance-System/releases/tag/v${newVersion}`);
} else {
  console.log("\nNo token found. Building installer locally (no publish)...");
  run("npx electron-builder --win --publish never");
  console.log(`\n=== Installer v${newVersion} built locally ===`);
  console.log(`File: release\\ASU-Engineering-System-Setup-${newVersion}.exe`);
  console.log("To publish automatically, set GH_TOKEN or create a release.token file in the project root.");
}

console.log("\nDone!");