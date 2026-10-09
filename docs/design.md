# Design notes

How Carol is put together. The [README](../README.md) covers running it;
[configuration](configuration.md) covers the knobs.

## How the call is wired

The API key stays on the server. The browser gathers an SDP offer and posts it
with model, voice, memories, startup history and disabled tools to `/api/session`.
The proxy creates `/v1/live/sessions`; the browser applies `transport.sdp` and
waits for `session.started`. Audio flows directly over WebRTC, and transcripts
and delegated Responses events use the `oai-events` data channel.

GPT-Live handles full-duplex speech. Its Responses backend reasons and uses tools.
Typed input uses `response.item.create` followed by `response.create`; notes
from the page use `session.commentary.append`. Escape requests a speech
interruption.

Model, voice and tool changes reconnect with recent history. Hangup stops capture
and playback, sends `session.close`, and keeps the transport alive until
`session.closed` or a 15-second timeout. Voice usage is cumulative seconds;
backend usage is separate. Recording is not enabled.

The proxy is connect-style middleware rather than a server, so there's only one
implementation of `/api/*`: `vite.config.js` mounts it in development and
`src/server/app.js` mounts it in front of the static handler in production. No
second process, and the key lives in one place either way.

## Storage

History, memory and tool preferences use `carol.history.v1`, `carol.memory.v1`
and `carol.tools.v1` in browser storage. Relevant memory and resumed history are
sent through the proxy to OpenAI when creating a session; the proxy stores no copy.
Startup history is restricted to user and assistant text, at most 40 messages
and 6,000 UTF-8 bytes, and supplied as `session.input`.

Transcript fragments retain their exact text and timestamps. Each speaker has
independent display groups with stable IDs; later fragments update existing
history rows. A 1.5-second timestamp gap starts a new display group. This is a UI
heuristic, not a semantic turn boundary, and never triggers tool execution.

Nested `response.event` envelopes carry backend work. Completed function items
are collected before the terminal response event, executed once, and all outputs
are submitted through `response.item.create` before one `response.create`
continuation. Late results from disconnected calls are discarded. Backend output
is not spoken-caption text; its URL annotations become clickable sources under
the caption, deduplicated, the oldest giving way past six, and cleared with the
caption they belong to.

## The yarn

Carol is a ball of red wool, and the strand that has come off it lying on the
floor behind. It is one continuous strand — about 78 metres of six-millimetre
wool — wound from the core outwards at startup (`yarn/winding.js`), the way a
hand winds a ball: band after band of turns laid side by side, the ball turned
between bands so they cross, each band put wherever the ball is lowest so it
stays round. A height map over the sphere records the surface as it is laid, and
every new turn rests on whatever is already there, so where turns cross the
newer rides over the older and nothing passes through anything. The last band
runs round the ball in the plane it rolls in, so its outermost end is always at
the contact patch. The same seed winds the same ball every load.

The strand is drawn as two tubes (`yarn/model.js`), built once: the wound part
in the ball's own frame, and the laid part where each bit of it comes to rest on
the floor. Its rings are fixed to the strand, so nothing swims as it rolls. The
wool is a physical material with a sheen; the three plies and their fibres are a
small tiling texture (a shade map and a bump map, `plyTexels` and `plyHeights`)
running diagonally along the strand, so the plies spiral round it once every
three centimetres. Each vertex also carries how deep it sits under the outer
surface, as occlusion — strands under the final band read against the surface
before that band was wound, so they look right once it has rolled off.

Everything about her pose follows from one number: how far along the floor she
has rolled. The bit of strand at the contact patch is fixed by that distance, the
ball is turned so that bit is at the bottom and running back along the path, and
the two tubes are cut where it is. There is no slip — every bit of strand touches
the floor exactly where the ball was when it got there — so rolling out and
rolling back are exact inverses, and the wound part ends where the laid part
begins.

The route (`yarn/path.js`) runs from the back of the room toward the camera's
usual seat: she comes to you to talk and goes back when it is over. It is a
centripetal Catmull-Rom spline with a gentle sway, so the strand behind her is
never hidden by the ball, sampled evenly by arc length. Behind its start a 22 cm
tail always lies on the floor, curling off to one side as it nears its end.

The yarn is from a design asset written for three.js; it runs here on the same
small engine as the other characters. Three things were added to Carol's copy of
`vendor/gfx/` for it: repeat wrapping on textures (the plies tile along a strand
seventy-odd metres long), and an `onFrame` hook on the stage that runs after the
controls and before the shadow pass, so the ball and its shadow are posed in the
same frame. The asset's ply shader, which three let it splice into the standard
material, became the texture above.

Nothing she does is a canned animation: every frame is a spring chasing a spot
on the floor, with a rhythm on top.

## The room

A warm paper floor under a high key light, the stage's own studio. The shadow
sits under the ball, and a soft dark pinch follows it where it meets the floor.
The camera looks in from the front, a little above and to one side, down the
route, and far enough back that the ball at its near end is still a ball and
not the whole view. On a phone held upright it sits further back again, so the
route's sway fits across, and the floor is lifted clear of the caption. It can orbit and zoom, but not go under
the floor.

## States

`idle` · `listening` · `thinking` · `speaking` — each a spot along the route
and a rhythm on top of it (`yarn/moods.js`). She rolls between them on a spring,
and one rhythm fades into the next, so a change of state reads as the same ball
changing its mind rather than a cut. Every bit of it is rolling, so every bit of
it pays strand out or winds it back in.

- **idle** — wound up at the back of the room, breathing a little.
- **listening** — rolled a quarter of the way toward you, rocking as she takes it in.
- **thinking** — back and forth in the middle, turning it over.
- **speaking** — right up to the front, paying out strand: spinning a yarn.
  The voice makes her skip.

Transcript activity drives listening and speaking. Backend work drives thinking
between transcript updates. The display timeout is a visual heuristic, not proof
of audio playback completion.

## Layout

```
Dockerfile              Build the client, then serve it from src/server
index.html              Markup only — Vite's entry
src/
  client/
    main.js             The wiring, and nothing else
    styles.css          The HUD around Carol
    api.js              The server's endpoints, as functions
    history.js          Past conversations in localStorage, and picking one up
    memory.js           What it remembers between calls, in localStorage
    tools.js            Which of the server's tools this browser switched off
    yarn/               Geometry and animation. Knows nothing about transports
      index.js            The controller, the camera, and the per-frame loop
      moods.js            Where along the floor each state goes, and its rhythm
      model.js            The two tubes, the wool and its plies, and the pose
      winding.js          The ball, wound from the core outwards
      path.js             The route across the floor, and the tail behind it
    session/            The call. Emits transport-agnostic events
      index.js            Lifecycle: mic, session, connect, meter, tear down
      webrtc.js           Peer connection, data channel, SDP handshake
      events.js           Live and nested Responses events → this vocabulary
      tools.js            remember/forget, answered in the page
      metering.js         Two analysers → one 0..1 number per frame
      emitter.js
    ui/
      hud.js              Status chip, transcript, caption
      menu.js             The corner menu, and the list of panels it drops
      history.js          The log panel behind `log` in the menu, and its `continue`
      memory.js           The memory panel behind `memory` in the menu
      tools.js            The tool switches behind `tools` in the menu — web search
      controls.js         Mic (tap mutes, hold hangs up), field, send, pickers
      viewport.js         Keeps the composer above the on-screen keyboard
    vendor/
      gfx/                The 3D engine: <three-d-stage>, WebGPU, else WebGL 2
  server/
    index.js            Entry point
    app.js              The middleware chain
    api.js              /api/models + /api/session
    openai.js           The two calls it makes
    persona.js          Who Carol is, and the session config
    origin.js           Who is allowed to ask for a change
    config.js           The environment, resolved once
    static.js           Hosting for dist/ — production only
docs/                   These notes, configuration, policies, screenshots
test/                   node:test, against a stub OpenAI
.github/workflows/      CI (lint, tests, build smoke test), CodeQL, Docker publish
```

`src/client/vendor/gfx/` is the 3D engine, shared with the other characters:
`<three-d-stage>` (studio lighting, ground shadow, orbit controls, framing,
resize), the scene API the rig is built from — handed over as `GFX` — and the
same shading in WGSL for WebGPU and GLSL for WebGL 2. WebGPU is tried first,
WebGL 2 takes over where it is missing or its device is lost, and
`?renderer=webgl` pins the fallback. Its maths follow three.js r186 closely;
`vendor/gfx/LICENSE` says which parts are ported.
The shaders are plain `.glsl` and `.wgsl` files under `vendor/gfx/shaders/`,
put together per draw by `glsl.js` and `wgsl.js`.

## The transport seam

`session/index.js` exposes `on`, `start`, `stop`, `send`, `note`, `cancel`,
`context`, `messages`, `connected`, `busy`, `stale`, `state`, `muted`, `model`,
`voice` — and emits:

```
'state'   connecting | listening | thinking | speaking | idle
'caption' the assistant's spoken row so far, whole — it replaces, not appends
'user'    the person's spoken row so far, whole
'source'  a url_citation the backend attached to what it answered
'tool'    a label while a tool works, or null
'memory'  the result of a remember/forget the model just called
'level'   0..1 sustained amplitude, per frame
'pulse'   0..1 transient, one per discrete event
'message' a row as it stands, { id, role, content, fragments } — what the log stores
'busy'    whether a backend response is in flight
'usage'   cumulative voice usage; `final` on the last one
'backend' a delegated response that settled, with its own usage
'error'   { message }
```

A spoken row grows: `caption`, `user` and `message` are re-emitted with the
whole row each time a fragment lands in it, identified by a stable `id`. The HUD
replaces what it is showing, and the log rewrites that row rather than adding
one. Those rewrites are held briefly before the log is serialised, so a sentence
costs one write instead of one per word; ending a call settles what is held.

Carol takes audio-shaped input:

```js
carol.setState('speaking')  // idle | listening | thinking | speaking
carol.setLevel(0.62)        // sustained amplitude 0..1, sampled per frame
carol.pulse(0.4)            // transient impulse 0..1, one per discrete event
```

Both land on the same internal energy value, which scales the state's rhythm —
quiet, she keeps a little over half of it; loud, half as much again. `setLevel`
carries the voice — two `AnalyserNode`s, one on the mic and one on the model's
track, read per frame and smoothed with a fast attack and a slow release.
`pulse` is for the beats where a turn changes hands: it gives the ball a shove
along the floor as well as the energy, so she skips rather than shudders.

Swapping providers means writing a different `createVoiceSession()` with that
surface. `main.js` and the yarn don't change.
