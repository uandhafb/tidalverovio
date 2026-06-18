# Tidal Score Forwarder

Local Pulsar package for sending TidalCycles source text to the Tidal VexFlow score bridge.

## Commands

- `Tidal Score Forwarder: Send Active Editor`
- `Tidal Score Forwarder: Send Selection Or Current Line`
- `Tidal Score Forwarder: Sync Score Clock`

Menu:

```txt
Packages > Tidal Score Forwarder
```

Default keybindings on macOS:

```txt
Cmd+Alt+Shift+S  Send active editor
Cmd+Alt+Shift+L  Send selection or current line
Cmd+Alt+Shift+0  Sync score clock to cycle 0 and start playback
```

## Settings

- `tidal-verovio-forwarder.bridgeUrl`: default `http://127.0.0.1:8766`
- `tidal-verovio-forwarder.autoSendOnSave`: default `false`
- `tidal-verovio-forwarder.autoSendOnChange`: default `true`
- `tidal-verovio-forwarder.autoSendDebounceMs`: default `250`
- `tidal-verovio-forwarder.syncOnTidalEvaluation`: default `true`
- `tidal-verovio-forwarder.syncAfterEvaluationDelayMs`: default `80`
- `tidal-verovio-forwarder.tidalEvaluationCommandPattern`: default `tidal|tidalcycles|tidal-cycles|haskell-ghci`

With `autoSendOnChange` enabled, editing a `.tidal` buffer sends the full source to the bridge after a short debounce. This is the mode that makes the browser live input follow Pulsar while you type.

With `syncOnTidalEvaluation` enabled, the package listens for Pulsar commands that look like Tidal evaluation commands. When one is dispatched, it sends the current source, asks the browser to display the selected/current `dN` pattern line when that line contains supported mini-notation, and then sends a simple sync message that resets the browser display to cycle 0 after `syncAfterEvaluationDelayMs`. If the evaluated line is not a supported score pattern, it falls back to the first `-- @score` line.

## Expected Bridge

Start the bridge from the project root:

```bash
node tidal-score-bridge.js
```

Then open the performer page:

```txt
http://127.0.0.1:8766/vexflowD.html
```

Click `Connect bridge`.

## Score Marker

Flag performer lines with:

```haskell
-- @score
d7 $ n "60 <62 64> 67/4"
```

`Send Active Editor` sends the whole file and asks the score display to prefer the first flagged line.

`Send Selection Or Current Line` sends only the selected/current pattern line.

When you evaluate a Tidal line normally in Pulsar, the forwarder prefers that same selected/current line for the performer display. This is the simplest path for live use: put the cursor on `d7 $ n "..."`, evaluate it, and the browser display should switch to `d7` and restart/follow the display clock.

`Sync Score Clock` sends a sync message to the browser display. It resets the displayed cycle to `0` and starts the browser cycle clock. Use it at the moment you want the score phase to align with what Tidal is playing.

Normally you should not need to trigger `Sync Score Clock` manually once `syncOnTidalEvaluation` is working. It is kept as a fallback.
