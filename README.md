# Strudel/TidalCycles → Score

Converts TidalCycles/Strudel mini-notation into live, readable sheet music, rendered with [Verovio](https://www.verovio.org/) from generated MEI. Built for a live-coding performance context: a performer reads notation generated from whatever the live coder is typing in Pulsar.

Single HTML file, no build step. Two ways to use it: a standalone scratch playground (presets + manual input), or live, fed from a real Pulsar/TidalCycles session via a small bridge.

## Running the standalone playground

Verovio needs to fetch its WASM binary, which most browsers block for pages opened directly as `file://`. Serve the folder instead:

```bash
cd tidalverovio
python3 -m http.server 8000
```

Then open **http://localhost:8000/index.html**. Stop the server with `Ctrl+C`.

(If you open `index.html` directly by double-clicking and it gets stuck on "Initialising Verovio…", that's this issue — switch to the local-server method above.)

## Running it live from Pulsar/TidalCycles

1. Start the bridge (also serves `index.html`, so you don't need a separate server for this mode):
   ```bash
   node tidal-score-bridge.js
   ```
   Listens on `http://127.0.0.1:8766` (HTTP + WebSocket) and `udp://127.0.0.1:6011` (OSC, currently unused by the score itself — see below).

2. Install the Pulsar package: symlink (or copy) `pulsar-tidal-score-forwarder/` into `~/.pulsar/packages/tidal-verovio-forwarder`.

3. Open `http://127.0.0.1:8766/index.html` in a browser, and click **Connect** in the "Live Lines" panel (default bridge URL `ws://127.0.0.1:8766` is already filled in).

4. In Pulsar, edit a `.tidal` buffer as normal. With `autoSendOnChange` (on by default), every edit POSTs the buffer to the bridge, which extracts every `dN $ ... (sound|s|note|n) "..."` line and writes it into the matching Live Lines row. Flag a line with `-- @score` above it in the source, or evaluate it normally (the forwarder follows your cursor/selection on Tidal-evaluation commands) to have it checked automatically. Multiple flagged lines render as separate, simultaneous staves.

No BootTidal/Haskell changes are required for this — only Pulsar-side and browser-side pieces. The bridge can also relay real Tidal OSC playback events (`tidal-event`/`clock`), but **this project deliberately ignores them for notation** (see Architecture notes below); they're only inherited because the bridge is shared infrastructure also used by the sibling VexFlow project.

## What it does

- **Parses mini-notation** (`bd sn hh`, `[c4 e4]*3`, `<bd sn>`, `bd*4, hh*8`, `bd/2`, etc.) into a rhythm tree using exact fraction math — no floating-point rounding.
- **No time signature.** A cycle is the natural rhythmic unit in live coding, so each cycle renders as its own free measure rather than being forced into 4/4 or similar.
- **Tuplet detection.** Any equal subdivision that isn't a power of two (3, 5, 6, 7...) is automatically bracketed as a proper, nestable MEI tuplet against the nearest power of two.
- **Rhythm or Pitch mode.** Pitch mode notates note names (`c4`, `e#5`) or MIDI numbers (`60`, `62`...) on a chosen clef. Rhythm mode draws every token (including sample-trigger words like `bd`/`sn`/`hh`, which carry no pitch) as a rhythm notehead on a fixed staff line.
- **Approximated-duration transparency.** If a rhythm can't be matched exactly (rare — only mixed-weight `@` groups, since tuplets handle the rest), the status line says so instead of silently snapping it.
- Rhythm mode renders on a genuine single-line percussion staff (`clef.shape="perc"`), not a 5-line staff with a fake fixed pitch — Verovio doesn't draw a clef glyph for this configuration, which is expected (the sibling comparison project's reference implementation has the same characteristic).
- **Live multi-line input with flagging.** A panel of `d1`–`d16` pattern lines; check a line to send it to the score, fed either by typing directly or by the Pulsar bridge. Multiple flagged lines render as separate, labeled staves playing together.

## Supported mini-notation syntax

| Syntax | Meaning |
|---|---|
| `a b c` | sequence — divides the cycle into equal parts |
| `[a b]` | sub-group — nests a sequence inside one slot |
| `a*3` | speed — fits 3 repeats into one slot |
| `a!3` | replicate — 3 separate full-weight copies |
| `a ! b` | bare `!` — repeats the previous element (`a ! b` == `a a b`) |
| `a@3` | elongation — weight 3 relative to siblings |
| `a/3` | slow — plays once every 3 cycles, rests otherwise |
| `~` / `r` | rest |
| `<a b c>` | cycle alternation — one pick per cycle, cycling through |
| `a, b` | parallel layers — simultaneous voices (top-level only; see limitations) |

## Architecture notes

This project was compared against a sibling project (`Tidal_VexFlow_Teste`) that also targets Tidal→score rendering. One real design fork is worth recording: that project's `vexflowD.html` builds notation from **OSC playback events** (Tidal's actual resolved note/cps/cycle/delta, via SuperDirt-style messages) rather than from re-parsing typed text. This project deliberately does **not** do that, even though the bridge it shares can relay those same OSC events. Reason: OSC only gives a flat list of already-resolved onset/duration events with no structural grouping, and reconstructing fractions from floating-point cycle/delta values is inherently lossy — both work against tuplet detection, which depends on knowing *which* events came from one equal subdivision, not just guessing it back from timing. Parsing the typed mini-notation text directly preserves that structure exactly. The tradeoff: this means Tidal features outside the quoted mini-notation string (`jux`, `every`, randomization, `#` chains) aren't reflected in the score, since only what's literally inside the quotes gets parsed.

## Known limitations

- Tuplet detection only triggers when all siblings in a group have equal weight; mixed `@`-elongation groups fall back to nearest-binary duration snapping instead of a tuplet bracket (surfaced via the "approximated" status, not silent).
- `,` (parallel layers) only produces true polyphony at a pattern's top level (e.g. a whole `d1` line). Nested inside a sub-bracket (e.g. `bd [sn, hh] cp`), it degrades to a flattened sequence rather than real simultaneous voices, so no events are silently dropped, but it isn't true polyphony there.
- Rhythm mode's single-line percussion staff still places every voice at the same vertical position, so simultaneous rhythm-mode voices can visually overlap where their onsets coincide (no pitch information to separate them — inherent to unpitched notation, not specific to this implementation).
- MIDI-number pitch mode has no scale/key awareness — it's a direct chromatic mapping (60 = middle C), same simplification as the sibling VexFlow project, for consistency.

## Files

- `index.html` — the app (playground + live-lines panel + bridge client).
- `tidal-score-bridge.js` — local HTTP+WebSocket(+OSC) relay between Pulsar and the browser.
- `pulsar-tidal-score-forwarder/` — Pulsar package that POSTs evaluated/edited `.tidal` text to the bridge.
- `just-verovio.html` — minimal Verovio smoke test, unrelated to the parser.
