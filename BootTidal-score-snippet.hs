-- HOW TO CONNECT TIDAL TO THE SCORE
--
-- Easiest way: use the ready-made BootTidal.hs in this folder — it is a
-- copy of the Pulsar tidalcycles package's own BootTidal.hs with the score
-- target already added. In Pulsar: Settings → Packages → tidalcycles →
-- "Boot Tidal Path" → set to:
--
--     /Users/uandha/Tidal_Verovio_Teste/tidalverovio/BootTidal.hs
--
-- Then reboot Tidal. Sound is unaffected; Tidal just also sends a copy of
-- every played event to tidal-score-bridge.js on udp://127.0.0.1:6011.
--
-- ─────────────────────────────────────────────────────────────────────────
-- If you prefer to edit your own BootTidal.hs instead, add these two lines
-- next to the existing editorTarget/editorShape lines:

let scoreTarget = Target {oName = "score", oAddress = "127.0.0.1", oPort = 6011, oLatency = 0.02, oSchedule = Live, oWindow = Nothing, oHandshake = False, oBusPort = Nothing }
let scoreShape = OSC "/score/play" $ Named { requiredArgs = [] }

-- ...and append (scoreTarget, [scoreShape]) to the startStream target list:
--
-- tidal <- startStream (defaultConfig {cFrameTimespan = 1/50})
--   [ (superdirtTarget {oLatency = 0.2}, [superdirtShape])
--   , (editorTarget, [editorShape])
--   , (scoreTarget, [scoreShape])
--   ]
--
-- Tidal automatically fills in `cps`, `cycle` (event onset in fractional
-- cycles) and `delta` (event duration) on every message, plus the active
-- control params (`s`, `note`, `n`, `orbit`, `gain`...). The score page
-- groups events by orbit: d1 = orbit 0 → lane "d1", d2 = orbit 1 → "d2"...
