:set -XOverloadedStrings
:set prompt ""

import Sound.Tidal.Context

import System.IO (hSetEncoding, stdout, utf8)
hSetEncoding stdout utf8

let editorTarget = Target {oName = "editor", oAddress = "127.0.0.1", oPort = 6013, oLatency = 0.02, oSchedule = Pre BundleStamp, oWindow = Nothing, oHandshake = False, oBusPort = Nothing }
let editorShape = OSCContext "/editor/highlights"

-- Score target: sends a copy of every played event (cps/cycle/delta plus
-- active params like s/note/n/orbit) to tidal-score-bridge.js on udp 6011,
-- which relays them to the score page's Graphic Score + cycle-sync clock.
-- Sound is unaffected — SuperDirt keeps its own target below.
let scoreTarget = Target {oName = "score", oAddress = "127.0.0.1", oPort = 6011, oLatency = 0.02, oSchedule = Live, oWindow = Nothing, oHandshake = False, oBusPort = Nothing }
let scoreShape = OSC "/score/play" $ Named { requiredArgs = [] }

tidal <- startStream (defaultConfig {cFrameTimespan = 1/50}) [(superdirtTarget {oLatency = 0.2}, [superdirtShape]), (editorTarget, [editorShape]), (scoreTarget, [scoreShape])]

:{
let only = (hush >>)
    p = streamReplace tidal
    hush = streamHush tidal
    panic = do hush
               once $ sound "superpanic"
    list = streamList tidal
    mute = streamMute tidal
    unmute = streamUnmute tidal
    unmuteAll = streamUnmuteAll tidal
    unsoloAll = streamUnsoloAll tidal
    solo = streamSolo tidal
    unsolo = streamUnsolo tidal
    once = streamOnce tidal
    first = streamFirst tidal
    asap = once
    nudgeAll = streamNudgeAll tidal
    all = streamAll tidal
    resetCycles = streamResetCycles tidal
    setCycle = streamSetCycle tidal
    setcps = asap . cps
    getcps = streamGetcps tidal
    setbpm = streamSetBPM tidal
    getbpm = streamGetBPM tidal
    getnow = streamGetnow tidal
    enableLink = streamEnableLink tidal
    disableLink = streamDisableLink tidal
    -- Ableton Link phase nudge, measured by ear at these (cps, nudge) points
    -- (sorted by cps; not monotonic, so no single a+b/cps formula fits).
    -- autoNudge piecewise-linearly interpolates between them, extrapolating
    -- using the nearest segment's slope outside the measured range.
    -- Call after every setcps/setbpm change. Add more points here as you
    -- calibrate more tempos.
    nudgeTable = [(0.125, 0.253), (0.5, 0.045), (1.0, 0.18), (1.1, 0.22)]
    interpNudge c = go nudgeTable
      where
        go ((c1,n1):(c2,n2):rest)
          | c <= c2 || null rest = n1 + (n2 - n1) * (c - c1) / (c2 - c1)
          | otherwise = go ((c2,n2):rest)
        go _ = 0
    autoNudge = do
      c <- getcps
      nudgeAll (interpNudge (realToFrac c))
    _p k _ = streamReplace tidal k silence
    p_ = _p
    xfade i = transition tidal True (Sound.Tidal.Transition.xfadeIn 4) i
    xfadeIn i t = transition tidal True (Sound.Tidal.Transition.xfadeIn t) i
    histpan i t = transition tidal True (Sound.Tidal.Transition.histpan t) i
    wait i t = transition tidal True (Sound.Tidal.Transition.wait t) i
    waitT i f t = transition tidal True (Sound.Tidal.Transition.waitT f t) i
    jump i = transition tidal True (Sound.Tidal.Transition.jump) i
    jumpIn i t = transition tidal True (Sound.Tidal.Transition.jumpIn t) i
    jumpIn' i t = transition tidal True (Sound.Tidal.Transition.jumpIn' t) i
    jumpMod i t = transition tidal True (Sound.Tidal.Transition.jumpMod t) i
    jumpMod' i t p = transition tidal True (Sound.Tidal.Transition.jumpMod' t p) i
    mortal i lifespan release = transition tidal True (Sound.Tidal.Transition.mortal lifespan release) i
    interpolate i = transition tidal True (Sound.Tidal.Transition.interpolate) i
    interpolateIn i t = transition tidal True (Sound.Tidal.Transition.interpolateIn t) i
    clutch i = transition tidal True (Sound.Tidal.Transition.clutch) i
    clutchIn i t = transition tidal True (Sound.Tidal.Transition.clutchIn t) i
    anticipate i = transition tidal True (Sound.Tidal.Transition.anticipate) i
    anticipateIn i t = transition tidal True (Sound.Tidal.Transition.anticipateIn t) i
    forId i t = transition tidal False (Sound.Tidal.Transition.mortalOverlay t) i
    d1 = p 1 . (|< orbit 0)
    d2 = p 2 . (|< orbit 1)
    d3 = p 3 . (|< orbit 2)
    d4 = p 4 . (|< orbit 3)
    d5 = p 5 . (|< orbit 4)
    d6 = p 6 . (|< orbit 5)
    d7 = p 7 . (|< orbit 6)
    d8 = p 8 . (|< orbit 7)
    d9 = p 9 . (|< orbit 8)
    d10 = p 10 . (|< orbit 9)
    d11 = p 11 . (|< orbit 10)
    d12 = p 12 . (|< orbit 11)
    d13 = p 13 . (|< orbit 12)
    d14 = p 14 . (|< orbit 13)
    d15 = p 15 . (|< orbit 14)
    d16 = p 16 . (|< orbit 15)
    _d1 = _p 1
    _d2 = _p 2
    _d3 = _p 3
    _d4 = _p 4
    _d5 = _p 5
    _d6 = _p 6
    _d7 = _p 7
    _d8 = _p 8
    _d9 = _p 9
    _d10 = _p 10
    _d11 = _p 11
    _d12 = _p 12
    _d13 = _p 13
    _d14 = _p 14
    _d15 = _p 15
    _d16 = _p 16
:}

:{
let getState = streamGet tidal
    setI = streamSetI tidal
    setF = streamSetF tidal
    setS = streamSetS tidal
    setR = streamSetR tidal
    setB = streamSetB tidal
:}

:set prompt "tidal> "
:set prompt-cont ""

default (Pattern String, Integer, Double)
