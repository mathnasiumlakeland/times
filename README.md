# Multiply Mission

Gamified multiplication practice for times tables 1–12, hosted at `times.mathnasium.pro`.

- Story Mode follows a sequential route through twelve table planets and four mixed-table alien bosses.
- Free Play keeps unrestricted Easy, Hard, single-table, and custom mixed-table practice.
- Boss encounters use six alien shield cells, three player shields, JRPG dialogue, and a dedicated battle theme.
- Progress, best scores, stars, story stages, and challenge victories are saved in the browser.

## Local development

```bash
bun install
bun run dev
```

## Tests

```bash
bun run test
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
- `story-boss-battle-theme.mid`: Story Mode boss theme
