const fs = require("fs");
const path = require("path");

const WIN1252_EXTRA = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

function toWin1252Bytes(str) {
  const bytes = [];
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code <= 0xff) bytes.push(code);
    else if (WIN1252_EXTRA[code] != null) bytes.push(WIN1252_EXTRA[code]);
    else return null;
  }
  return Buffer.from(bytes);
}

function fixChunk(s) {
  const buf = toWin1252Bytes(s);
  if (!buf) return null;
  const decoded = buf.toString("utf8");
  if (decoded.includes("\uFFFD")) return null;
  if (decoded === s) return null;
  return decoded;
}

const MOJIBAKE_RUN =
  /(?:[\u0080-\u00FF]|[\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018-\u201E\u2020-\u2022\u2026\u2030\u2039\u203A\u20AC\u2122])+/g;

const appPath = path.join(__dirname, "..", "src", "App.jsx");
const bakPath = path.join(__dirname, "..", "src", "App.jsx.before-encoding-fix.bak");

fs.copyFileSync(bakPath, appPath);

const original = fs.readFileSync(appPath, "utf8");
const updated = original.replace(MOJIBAKE_RUN, (match) => {
  const fixed = fixChunk(match);
  return fixed == null ? match : fixed;
});

fs.writeFileSync(appPath, updated, "utf8");

const samples = [
  original.match(/Ù‚Ø·Ø§Ø¹[\s\S]{0,40}/)?.[0],
  updated.match(/قطاع[\s\S]{0,40}/)?.[0],
  updated.slice(updated.indexOf("menuItems") > -1 ? 0 : 0, 0),
];

console.log("restored from bak and converted");
console.log("hero before:", original.split("\n")[1179]);
console.log("hero after:", updated.split("\n")[1179]);
console.log("arrow after:", updated.split("\n")[615]);
console.log("remaining mojibake lines:", updated.split("\n").filter((l) => /[ØÙÃÂ]|ðŸ|â€/.test(l)).length);
