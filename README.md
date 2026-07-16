# Multiply Mission

Gamified multiplication practice for times tables 1–12, hosted at `times.mathnasium.pro`.

- Easy mode uses four answer choices and awards mission patches.
- Hard mode requires typed answers and awards separate crowned Master badges.
- Progress, best scores, stars, and both reward tracks are saved in the browser.

## Local development

```bash
bun install
bun run dev
```

## Production build

```bash
bun run check
bun run build
```

The static site is written to `build/`. Pushing `main` deploys that directory through `.github/workflows/deploy-pages.yml`.

## Sound effects

The vendored Duolingo-style feedback sounds live in `static/audio/`:

- `duolingo-correct.mp3`: correct answer
- `duolingo-incorrect.mp3`: incorrect answer
- `duolingo-complete.mp3`: completed mission
