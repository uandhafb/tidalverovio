# Strudel/TidalCycles → Score

Converts TidalCycles/Strudel mini-notation into live, readable sheet music rendered with [Verovio](https://www.verovio.org/) from generated MEI. Built for live-coding performance: a performer reads notation generated from whatever the live coder is typing in Pulsar.

## Requirements

Install these first (each has official installers for macOS / Linux / Windows):

| What | Why | Check it works |
|---|---|---|
| [Node.js](https://nodejs.org) ≥ 18 | runs the bridge server | `node -v` prints a version |
| [Pulsar](https://pulsar-edit.dev) + its `tidalcycles` package | the live-coding editor | Packages menu shows "TidalCycles" |
| [SuperCollider](https://supercollider.github.io) + [SuperDirt](https://github.com/musikinformatik/SuperDirt) | the sound engine | SuperDirt boots in SC |
| [TidalCycles](https://tidalcycles.org) ≥ 1.9 | the pattern language | booting Tidal in Pulsar prints a version |

Any modern browser works. No other dependencies — the notation engine is bundled in this repo.

## Install from scratch

```bash
git clone https://github.com/uandhafb/tidalverovio.git
cd tidalverovio
```

1. **Install the Pulsar forwarder** (sends what you type to the score). macOS/Linux, from inside the cloned folder:
   ```bash
   ln -s "$(pwd)/pulsar-tidal-score-forwarder" ~/.pulsar/packages/tidal-verovio-forwarder
   ```
   Windows: copy the `pulsar-tidal-score-forwarder` folder into `%USERPROFILE%\.pulsar\packages\` and rename it `tidal-verovio-forwarder`.
   Then restart Pulsar (or `Ctrl/Cmd+Shift+P` → "Window: Reload").

2. **Point Tidal at this repo's boot file** (enables real clock sync + the live Graphic Score). Print the absolute path:
   ```bash
   echo "$(pwd)/BootTidal.hs"
   ```
   Then EITHER in Pulsar: Settings → Packages → tidalcycles → Settings → *Boot Tidal Path* → paste that path — OR add to `~/.pulsar/config.cson`:
   ```cson
   tidalcycles:
     bootTidalPath: "/absolute/path/to/tidalverovio/BootTidal.hs"
   ```
   Boot-file changes only load when Tidal (re)boots.

## Performance startup checklist

Assumes the one-time [Install from scratch](#install-from-scratch) steps are done. Quick check: `ls ~/.pulsar/packages/tidal-verovio-forwarder` should show the symlink — if it doesn't, notes will play but the score will stay empty.

In this exact order (about 90 seconds total):

1. **Terminal** — start the bridge:
   ```bash
   cd <path-to-your-clone>/tidalverovio && node tidal-score-bridge.js
   ```
   Expect: "Tidal score bridge listening on http://127.0.0.1:8766". Keep this window open.
   *If it says "address already in use": a bridge is already running — that's fine, skip ahead.*
2. **Browser** — open http://127.0.0.1:8766/index.html → click **Connect bridge** → green dot.
   *If the page doesn't load: the bridge isn't running (step 1).*
3. **SuperCollider** — start SuperDirt as usual.
4. **Pulsar** — menu **Packages → TidalCycles → Boot TidalCycles** → wait for "Connected to SuperDirt".
   *One-off red "skip: N" at boot is harmless. If you edited BootTidal.hs since the last boot, use **Reboot** — boot-file changes only load on (re)boot; confirm by the page's cycle ring showing a small number.*
5. **Play** — open `examples.tidal` (a prepared line-by-line demo) or your own `.tidal` file; evaluate lines with `Cmd+Enter`. Typing auto-fills the Live Lines rows; `-- @score` above a line auto-flags it.

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

### Extra REPL helpers in `BootTidal.hs`

Beyond the stock Pulsar `tidalcycles` boot file, this project's `BootTidal.hs` also defines the TidalCycles ≥ 1.10.1 helpers:

- `setbpm <n>` / `getbpm` — set/read tempo in BPM, an alternative to `setcps`/`getcps`.
- `enableLink` / `disableLink` — turn Ableton Link sync on/off.
- `autoNudge` — corrects the audio-phase offset against Link-synced apps (see [Ableton Link phase alignment](#ableton-link-phase-alignment) below).
- `_d1` … `_d16` — force-mute one orbit: `_d1 $ <anything>` silences orbit 1 only (the pattern argument is ignored), unlike `hush`, which silences everything.

These need TidalCycles ≥ 1.10.1 — on older installs they'll fail at boot with an "unknown identifier" error. If you're on an older Tidal, remove the corresponding lines from `BootTidal.hs` (everything else in this file works back to 1.9).

### Ableton Link phase alignment

`enableLink` locks Tidal's tempo to Ableton Live (or any other Link peer) correctly, but the two can still sound a fraction of a cycle **out of phase** — onsets don't quite line up even though the tempo is exact. This isn't Link failing to sync: Link's shared clock is phase-locked between peers, but it deliberately doesn't compensate for each app's own audio pipeline latency (SuperCollider/SuperDirt's buffer + DAC vs. Ableton's own audio engine output latency) — that's left to the host app.

`nudgeAll <seconds>` shifts Tidal's scheduling by a constant offset to compensate. The catch: the correct value is **tempo-dependent**, not a fixed constant. `BootTidal.hs` includes `autoNudge`, which looks up/interpolates a nudge value from a table of `(cps, nudge)` points calibrated by ear:

```haskell
nudgeTable = [(0.125, 0.253), (0.5, 0.045), (1.0, 0.18), (1.1, 0.22)]
```

Call it after every tempo change:
```haskell
enableLink
setcps (0.8)   -- or setbpm ...
autoNudge
```

These points are specific to one machine/audio setup and are **not monotonic in cps** — a single formula didn't fit the measured data, hence the lookup table rather than a formula. To recalibrate for your own setup: pick a tempo, find the `nudgeAll (n)` value that sounds phase-aligned by ear, and add `(cps, n)` to `nudgeTable` (sorted by cps) in `BootTidal.hs`. More points make the interpolation more accurate. See [issue #15](https://github.com/uandhafb/tidalverovio/issues/15) for the calibration writeup.

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

Translated (deterministic structural transforms): `rev`, `palindrome`, `fast/density/hurry N`, **`slow N`** (true per-cycle slices), `fastGap N`, `compress (a,b)`, `zoom (a,b)`, `within (a,b) f`, `off T f` (shifted ghost voice), `press`/`pressBy X`, `swing N`/`swingBy X N`, `ply N`, `degradeBy X`/`unDegradeBy X` (grey shading), `every N f`, `every' N O f`, `foldEvery [..] f`, `whenmod A B f`, `repeatCycles N`, `iter N`/`iter' N`, `rot N`, `euclid/euclidInv/euclidOff/euclidFull`, `struct`/`mask`/`sew`/`stitch` with quoted boolean patterns, `jux f`/`juxBy X f`/`superimpose f` (simultaneous voices), `scale NAME [root]` (15 scales, degrees → pitches), **chords** (`c5'maj`, `e5'min7'i2'o` with inversions/open/drop voicings, drawn as real chords), `arp MODE` (up/down/updown/downup/converge/diverge), `rolled`, `always`/`never`, and a global `all $ f` line. The randomness family renders as **grey possibility**: `sometimesBy X f` and aliases (`sometimes`, `often`, `rarely`, `almostAlways`, `almostNever`, `someCycles`) show the base in black plus the transformed ghost in grey shaded by probability; `choose`/`wchoose`/`cycleChoose` show rotating grey picks. Chains also work typed directly into the playground or a live-line row.

Deliberately **not** translated on the staff (the graphic score and Played-staff mode show their real result): pure value-randomness (`irand`, `rand`, `perlin`, `shuffle`, `scramble`, `fadeIn/Out`), sample-slicing (`chop`, `striate`), remaining time-slicers (`linger`, `trunc`, `chunk`, `stut`, `echo`, `brak`, `inside`/`outside`), `inv`/`euclidBool`, and audio params (`cut`, `gain`, `pan`…) which don't change rhythm structure.

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
| `a?` / `a?0.2` | degrade — the number is the probability of REMOVAL (Tidal semantics: `a?0.2` plays 80% of the time); shown grey in the score, darker = more likely to sound; during a live session the notehead turns black the moment it actually plays |

## Architecture notes

This project was compared against a sibling project (`Tidal_VexFlow_Teste`) that also targets Tidal→score rendering. One real design fork: that project's `vexflowD.html` builds notation from **OSC playback events** (Tidal's actual resolved note/cps/cycle/delta) rather than from re-parsing typed text. This project deliberately does **not** do that. Reason: OSC gives a flat list of already-resolved events with no structural grouping, and reconstructing fractions from floating-point cycle/delta values is inherently lossy — both work against tuplet detection, which depends on knowing which events came from one equal subdivision. Parsing the typed mini-notation text directly preserves that structure exactly. Tradeoff: Tidal features outside the quoted mini-notation string (`jux`, `every`, randomisation, `#` chains) aren't reflected in the score.

## Known limitations

- `/` on groups deviates from Tidal: `[a b]/2` renders the whole group every 2nd cycle, while Tidal plays *half of the group per cycle* (a on cycle 0, b on cycle 1). Exact for single elements (`bd/2`). The true behavior needs cross-barline note slicing — future work; the graphic score shows the real playback meanwhile.

- Tuplet detection only triggers when all siblings have **equal weight**; mixed `@`-elongation groups fall back to nearest-binary duration snapping (shown as "N durations approximated").
- Ties can't help non-binary denominators (e.g. 1/3, 1/5 of a non-tuplet context) — those still snap.
- `,` (parallel layers) only produces true polyphony at a pattern's **top level**. Nested inside a sub-bracket (e.g. `bd [sn, hh] cp`), it degrades to a flattened sequence — no events are dropped, but it isn't true polyphony there.
- Rhythm mode's single-line percussion staff places every voice at the same vertical position; simultaneous rhythm-mode voices can overlap visually (inherent to unpitched notation).
- MIDI-number pitch mode is a direct chromatic mapping with no scale/key awareness.
- **Note names follow Tidal exactly**: sharps are `s`, flats are `f` (`cs5`, `ef5`; `c#5`/`eb5` accepted as aliases), and the octave digit is optional — Tidal's default octave 5 is used (`note "c e g"` = the middle-C octave).
- **Note numbers follow Tidal exactly**: `note "0 4 7"` works — 0 = c5 = middle C (MIDI 60), negatives descend (`-12` = c4); add/subtract 60 to convert to/from raw MIDI (a separate "Raw MIDI" input mode accepts 60-style numbers directly).
- **Octave naming follows Tidal, not scientific pitch notation**: Tidal calls middle C "c5" (MIDI 60), one octave above the scientific name "C4". Typed note names and graphic-score labels both use Tidal's convention, and the staff draws notes at their true sounding pitch — so `note "c4"` appears one octave below middle C, exactly as it sounds.
- Verovio renders no clef glyph for the percussion staff configuration — this is expected behavior, not a defect (the sibling VexFlow/Verovio reference project has the same characteristic).
- `bd?` degrade is always shown (deterministic score); the grey colour indicates probability. For a performance score, always-visible is more useful than randomly-hiding.

## Troubleshooting

| Symptom | Cause → fix |
|---|---|
| `node: command not found` | Node.js not installed → install from nodejs.org, reopen the terminal |
| `EADDRINUSE: address already in use` | a bridge is already running — that's fine, just open the page. To force a fresh one: `lsof -tnP -iTCP:8766 -sTCP:LISTEN \| xargs kill`, then start again |
| Page doesn't load at 127.0.0.1:8766 | the bridge isn't running → start it (step 1 of the checklist) |
| Page shows "Connection error — bridge running?" right after connecting | often transient — it auto-retries every 2s in the background but the message doesn't clear itself. Wait a couple seconds or click **Connect bridge** again; only investigate further if it doesn't clear |
| Page stuck on "Initialising Verovio…" | you opened `index.html` as a file → always open it through the bridge URL |
| Typing in Pulsar doesn't fill the Live Lines | forwarder not installed or Pulsar not reloaded → redo Install step 1; the file must be a `.tidal` file |
| Cycle ring doesn't pulse with the audio / Graphic Score says "from typed patterns" while playing | Tidal isn't sending its clock → Install step 2 not done, or Tidal wasn't RE-booted after it. Confirm: the page's cycle number should match Tidal's real cycle |
| Events from d13–d16 appear under d1 | Tidal is running an old boot file without their orbit tags → reboot Tidal with this repo's `BootTidal.hs` |
| One-off red `skip: N` at Tidal boot | harmless scheduler catch-up — ignore unless it floods during playback |

## Branches

- `main` — the score system described here (staff + graphic score, stable)
- `performer2` — experimental "city score": patterns pinned to real map locations, connections growing along real streets (needs internet during its setup step for map data)

## Files

- `index.html` — the entire app: parser, MEI generator, Verovio renderer, playback clock, timeline, bridge client, live-lines panel.
- `tidal-score-bridge.js` — local HTTP+WebSocket(+OSC) relay between Pulsar and the browser.
- `pulsar-tidal-score-forwarder/` — Pulsar IDE package that POSTs `.tidal` buffer text to the bridge.
- `BootTidal.hs` — Pulsar `tidalcycles` boot file, extended with the score OSC target and the 1.10.1 REPL helpers (see [Running it live](#running-it-live-from-pulsartidalcycles)).
- `just-verovio.html` — minimal Verovio smoke test, unrelated to the parser.
