# Strudel/TidalCycles → Score

Converts TidalCycles/Strudel mini-notation into live, readable sheet music rendered with [Verovio](https://www.verovio.org/) from generated MEI. Built for live-coding performance: a performer reads notation generated from whatever the live coder is typing in Pulsar.

## Performance startup checklist

In this exact order (about 90 seconds total):

1. **Terminal** — start the bridge:
   ```bash
   cd ~/Tidal_Verovio_Teste/tidalverovio && node tidal-score-bridge.js
   ```
   Expect: "Tidal score bridge listening on http://127.0.0.1:8766". Keep this window open.
   *If it says "address already in use": a bridge is already running — that's fine, skip ahead.*
2. **Browser** — open http://127.0.0.1:8766/index.html → click **Connect bridge** → green dot.
   *If the page doesn't load: the bridge isn't running (step 1).*
3. **SuperCollider** — start SuperDirt as usual.
4. **Pulsar** — menu **Packages → TidalCycles → Boot TidalCycles** → wait for "Connected to SuperDirt".
   *One-off red "skip: N" at boot is harmless. If you edited BootTidal.hs since the last boot, use **Reboot** — boot-file changes only load on (re)boot; confirm by the page's cycle ring showing a small number.*
5. **Play** — open `demo.tidal` (a prepared line-by-line demo) or your own `.tidal` file; evaluate lines with `Cmd+Enter`. Typing auto-fills the Live Lines rows; `-- @score` above a line auto-flags it.

Panic buttons: `hush` in Pulsar silences everything; the browser page never needs restarting — worst case, refresh it and click Connect again.

Single HTML file, no build step. Two ways to use it: a standalone scratch playground (presets + manual input), or live, fed from a real Pulsar/TidalCycles session via a small bridge.

## Fully offline — no internet required

The Verovio rendering engine is **bundled locally** in this folder (`verovio-toolkit-wasm.js`, self-contained with the WASM embedded). The page loads it from disk, so the whole system works with zero internet — it boots in under a second and a flaky venue connection cannot break a performance. Previously the engine was fetched from verovio.org on every page load, which intermittently stalled for minutes.

To update the engine later (optional):
```bash
curl -sL -o verovio-toolkit-wasm.js https://www.verovio.org/javascript/latest/verovio-toolkit-wasm.js
```

## Running the standalone playground

Serve the folder with any local web server:

```bash
cd tidalverovio
python3 -m http.server 8000
```

Then open **http://localhost:8000/index.html**. Stop the server with `Ctrl+C`. (The local server needs no internet — see above.)

## Running it live from Pulsar/TidalCycles

1. Start the bridge (also serves `index.html`, so no separate server needed):
   ```bash
   node tidal-score-bridge.js
   ```
   Listens on `http://127.0.0.1:8766` (HTTP + WebSocket) and `udp://127.0.0.1:6011` (OSC, currently unused by the score — see Architecture notes).

2. Install the Pulsar package: symlink (or copy) `pulsar-tidal-score-forwarder/` into `~/.pulsar/packages/tidal-verovio-forwarder`.

3. Open `http://127.0.0.1:8766/index.html` in a browser and click **Connect** in the toolbar (the default `ws://127.0.0.1:8766` is prefilled). The dot turns green when connected. The bridge auto-reconnects at 2s if the connection drops.

4. In Pulsar, edit a `.tidal` buffer. With `autoSendOnChange` on (default), every edit POSTs the buffer to the bridge, which extracts `dN ... (s|n) "..."` lines into the matching Live Lines rows. Flag a line with `-- @score` above it in the source, or evaluate it normally (the forwarder follows your cursor). Multiple flagged lines render as separate staves.

5. Use the **CPS** input to set the tempo (cycles per second, e.g. `setcps (135/60/4)` = 0.5625). The bridge auto-extracts `setcps(...)` from your `.tidal` source when it arrives. Hit **Play** to advance cycles automatically — the score and the red playhead sweep in sync with the tempo.

6. **For true cycle sync and the live Graphic Score**, boot Tidal with this project's `BootTidal.hs` (a copy of the Pulsar package's boot file plus a score OSC target on udp 6011): in Pulsar, set Settings → Packages → tidalcycles → *Boot Tidal Path* to the absolute path of `tidalverovio/BootTidal.hs`, then boot Tidal as usual. Sound is unaffected. Without this step the text pipeline (typing → staff) still works, but the cycle ring/playhead run on the internal clock instead of Tidal's real one and the Graphic Score only shows typed patterns, not actual playback.

## What it does

- **Parses mini-notation** into a rhythm tree using exact fraction math — no floating-point rounding.
- **No time signature.** A cycle is the natural rhythmic unit in live coding; each cycle renders as its own free measure.
- **Structural tuplet detection.** Any equal subdivision that isn't a power of two (3, 5, 6, 7…) is automatically bracketed as a proper, nestable MEI tuplet.
- **Ties.** Durations that are exact sums of standard note values (e.g. 5/8 = half + eighth) are rendered as properly tied notes instead of snapping to the nearest single duration.
- **Euclidean rhythms.** `bd(3,8)` uses the Bjorklund algorithm to distribute 3 hits over 8 steps evenly, starting on a hit (matching TidalCycles convention).
- **Degrade `?`.** `bd?` renders grey on the score — the performer can see it but knows it's probabilistic.
- **Rhythm or Pitch mode.** Pitch mode notates note names (`c4`, `e#5`) or MIDI numbers (`60`, `62`). Rhythm mode draws every token on a single-line percussion staff (`clef.shape="perc"`).
- **Approximated-duration transparency.** Non-representable durations (rare) surface as "N durations approximated" in the status line rather than silently snapping.
- **Live playback clock.** Set CPS, click Play — cycles advance automatically, alternation and slow patterns evolve, and a red playhead sweeps the score in real time.
- **Event timeline ribbon.** Below the score, each event appears as a colored proportional block, one row per live line — useful for seeing timing structure at a glance.
- **Multi-cycle preview.** Show 1, 4, or 8 cycles side by side to see how `<alternation>` and `/slow` patterns evolve.
- **Live multi-line input with flagging.** A panel of `d1`–`d16` pattern lines; check a line to send it to the score. Multiple flagged lines render as separate, labeled staves playing together.
- **Auto-reconnect.** The WebSocket bridge client reconnects automatically every 2s if the bridge restarts.

## Staff source: Typed vs Played

The staff has two sources, switchable live (**Staff source** selector):

- **Typed pattern** (default): notates the mini-notation text with exact structural fidelity — tuplets, ties, degrade shading. Functions outside the translated set don't appear (grey badge).
- **Played (live)**: notates the **real OSC events** of the current cycle, per orbit, notes appearing as they sound. Everything Tidal plays becomes notation — `chunk`, `sometimes`, `chop`, all of it — because the notes are reconstructed from actual playback. Trade-off: timings are quantized to a musical grid (binary and tuplet grids are detected and notated exactly, e.g. real triplet/quintuplet brackets; anything that misses every grid is flagged "approximated").

## Tidal functions on the staff

Function chains written before the quoted pattern (e.g. `d1 $ every 4 rev $ fast 2 $ s "bd sn"`) are detected and — where honestly possible — translated onto the staff. Each live line shows its chain as badges: **green** = translated, **grey/struck** = shown only in the graphic score.

Translated (deterministic structural transforms): `rev`, `palindrome`, `fast N`/`density N`/`hurry N` (hurry is notation-equivalent to fast — its sample-speed aspect doesn't change rhythm), `ply N`, `every N f`, `repeatCycles N`, `iter N` (exact when the rotation lands on an element boundary), `jux f` (rendered as two simultaneous voices in one staff), and a global `all $ f` line (applies to every flagged line). Chains also work typed directly into the playground or a live-line row.

Deliberately **not** translated on the staff (the graphic score shows their real result): random functions (`sometimes`, `irand`, `shuffle`, `scramble`), sample-slicing (`chop`, `striate`), whole-line `slow N` (needs cross-barline tie slicing — future work), time-slicing functions (`off`, `stut`, `compress`, `zoom`, `chunk`, `rot`, `within`), `inv` (needs boolean-pattern support), and audio params (`cut`, `gain`, `pan`…) which don't change rhythm structure.

## Supported mini-notation syntax

| Syntax | Meaning |
|---|---|
| `a b c` | sequence — divides the cycle into equal parts |
| `[a b]` | sub-group — nests a sequence inside one slot |
| `a b . c c c` | `.` grouping shorthand — same as `[a b] [c c c]` |
| `a*3` | speed — fits 3 repeats into one slot |
| `a*4%2` | speed by ratio — same as `a*2` |
| `a!3` | replicate — 3 full-weight copies |
| `a !` | bare `!` — repeats the previous element |
| `a@3` | elongation — weight 3 relative to siblings |
| `a _ _` | `_` elongation — each underscore extends the previous element one step |
| `a/3` | slow — plays once every 3 cycles, rests otherwise |
| `~` / `r` | rest |
| `<a b c>` | cycle alternation — one pick per cycle |
| `a, b` | parallel layers — simultaneous voices (top-level only; see Limitations) |
| `{a b c d, e f g}` | polymeter — each part keeps its own step count and wraps across cycles |
| `{a b c}%8` | polymeter subdivision — 8 slots per cycle wrapping the 3 elements |
| `[a \|b \|c]` | random choice — one pick per cycle; shown grey on the staff (random = unpredictable), true pick in the graphic score |
| `a:3` | sample index — treated as the same instrument family (`bd:3` sits at bd's drum position) |
| `a(k,n)` | Euclidean rhythm — Bjorklund: k hits over n steps |
| `a(k,n,r)` | Euclidean rhythm with rotation offset r |
| `a?` / `a?0.2` | degrade — probabilistic; shown grey in the score, shade scaled to the probability; during a live session the notehead turns black the moment it actually plays |

## Architecture notes

This project was compared against a sibling project (`Tidal_VexFlow_Teste`) that also targets Tidal→score rendering. One real design fork: that project's `vexflowD.html` builds notation from **OSC playback events** (Tidal's actual resolved note/cps/cycle/delta) rather than from re-parsing typed text. This project deliberately does **not** do that. Reason: OSC gives a flat list of already-resolved events with no structural grouping, and reconstructing fractions from floating-point cycle/delta values is inherently lossy — both work against tuplet detection, which depends on knowing which events came from one equal subdivision. Parsing the typed mini-notation text directly preserves that structure exactly. Tradeoff: Tidal features outside the quoted mini-notation string (`jux`, `every`, randomisation, `#` chains) aren't reflected in the score.

## Known limitations

- `/` on groups deviates from Tidal: `[a b]/2` renders the whole group every 2nd cycle, while Tidal plays *half of the group per cycle* (a on cycle 0, b on cycle 1). Exact for single elements (`bd/2`). The true behavior needs cross-barline note slicing — future work; the graphic score shows the real playback meanwhile.

- Tuplet detection only triggers when all siblings have **equal weight**; mixed `@`-elongation groups fall back to nearest-binary duration snapping (shown as "N durations approximated").
- Ties can't help non-binary denominators (e.g. 1/3, 1/5 of a non-tuplet context) — those still snap.
- `,` (parallel layers) only produces true polyphony at a pattern's **top level**. Nested inside a sub-bracket (e.g. `bd [sn, hh] cp`), it degrades to a flattened sequence — no events are dropped, but it isn't true polyphony there.
- Rhythm mode's single-line percussion staff places every voice at the same vertical position; simultaneous rhythm-mode voices can overlap visually (inherent to unpitched notation).
- MIDI-number pitch mode is a direct chromatic mapping with no scale/key awareness.
- **Octave naming follows Tidal, not scientific pitch notation**: Tidal calls middle C "c5" (MIDI 60), one octave above the scientific name "C4". Typed note names and graphic-score labels both use Tidal's convention, and the staff draws notes at their true sounding pitch — so `note "c4"` appears one octave below middle C, exactly as it sounds.
- Verovio renders no clef glyph for the percussion staff configuration — this is expected behavior, not a defect (the sibling VexFlow/Verovio reference project has the same characteristic).
- `bd?` degrade is always shown (deterministic score); the grey colour indicates probability. For a performance score, always-visible is more useful than randomly-hiding.

## Files

- `index.html` — the entire app: parser, MEI generator, Verovio renderer, playback clock, timeline, bridge client, live-lines panel.
- `tidal-score-bridge.js` — local HTTP+WebSocket(+OSC) relay between Pulsar and the browser.
- `pulsar-tidal-score-forwarder/` — Pulsar IDE package that POSTs `.tidal` buffer text to the bridge.
- `just-verovio.html` — minimal Verovio smoke test, unrelated to the parser.
