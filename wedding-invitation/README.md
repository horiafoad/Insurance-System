# HORIA & FOAD — Interactive Wedding Invitation

A short, cinematic interactive wedding invitation built with **React + Vite + JavaScript + CSS**.
Fully static — no backend, no database.

Brand: **Ivory / Warm White + Champagne Gold** — minimal luxury.

## 🚀 Run

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## ⚙️ The only file you edit

Everything lives in one file: **`src/data/weddingData.js`**

```js
brideName, groomName, weddingDate, weddingDay, weddingTime,
venueName, venueAddress, googleMapsUrl, musicFile,
childhoodImages, coupleImages
```

Change the names, date, venue, and map link there — nothing else needs editing.

## 🎵 Music

Drop your own licensed audio file named **`wedding-song.mp3`** into:

```
src/assets/music/wedding-song.mp3
```

The music plays only after the guest presses **ANSWER** (this respects mobile autoplay rules).
No copyrighted song is bundled in the project — you supply your own file.

## 🖼 Photos

Place real photos replacing the placeholders in `src/assets/images/`:

```
childhood-1.jpg  childhood-2.jpg  childhood-3.jpg
couple-1.jpg     couple-2.jpg     couple-3.jpg     couple-4.jpg
```

If you keep those exact filenames, the experience upgrades automatically.
Missing images fall back to an elegant placeholder — the app never breaks.

## 🎬 Experience (≈ 45–60s)

1. **Incoming Call** — very dark, quiet screen. Tap `ANSWER`.
2. **Dawn transition** — soft champagne light blooms from the center, turning the world from dark to ivory as the music begins.
3. **Childhood** — three memories (zoom / pan / drift) in champagne-framed photos.
4. **Reveal** — "بس عندنا خبر مهم…" → WE'RE GETTING MARRIED 💍
5. **Couple** — four artistic framed shots.
6. **Details** — date, time, venue + **OPEN LOCATION** (Google Maps).
7. **Final** — Save the Date 🤍

A floating music button lets guests pause/resume the song at any moment.