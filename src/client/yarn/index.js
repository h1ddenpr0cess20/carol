import { createYarn } from './model.js';
import { ENERGY_GAIN, MOODS, ROLL } from './moods.js';

/** The springs are stepped at no less than this, so they stay stable on a slow frame. */
const STEP = 1 / 120;

/** The middle of the route, at the height of the middle of the ball. */
const TARGET = Object.freeze({ x: 0, y: 0.09, z: 0 });

/**
 * What the camera turns round follows her this much of the way from the middle
 * of the route: nearly all, so a drag orbits Carol rather than a spot on the
 * floor, but not quite, so she still comes toward you when she rolls forward.
 */
const FOLLOW = 0.8;

/** How quickly that point keeps up with her, per second. */
const FOLLOW_RATE = 3;

/**
 * How far up the picture is slid, as a share of its height, so she sits above
 * the caption and the composer: a little on a wide screen, and more for each
 * unit a tall one is narrower than square.
 */
const SHIFT = Object.freeze({ base: 0.06, tall: 0.22 });

/** The way the camera looks in from, before anyone orbits it. */
const SEAT = Object.freeze({ x: 1, y: 0.9, z: 1.25 });

/**
 * How far the view may be zoomed: in, to this many metres from what it looks
 * at — close enough to see the plies — and out, to this many times as far as
 * it is framed.
 */
export const ZOOM = Object.freeze({ in: 0.3, out: 2.5 });

/** How fast a mood's rhythm takes over from the last one's, per second. */
const BLEND = 2.5;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

function approach(value, target, rate, dt) {
  return value + (target - value) * Math.min(1, dt * rate);
}

/** The dark pinch where the ball meets the floor, as a soft round texture. */
function contactTexture(GFX) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.35, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new GFX.CanvasTexture(c);
}

/**
 * Carol: a ball of red wool on the floor, its strand laid out behind it. She
 * rolls out as she talks and winds herself back in when it is over. The
 * conversational state (`setState`) picks where along the floor she heads and
 * the rhythm she keeps there; the level of whoever is talking (`setLevel`,
 * `pulse`) makes that rhythm bigger, and a pulse is a skip forward.
 */
export function createCarol({ stage, GFX, seed }) {
  const yarn = createYarn(GFX, { seed });
  const { routeLen } = yarn;

  let state = 'idle';
  const weights = { idle: 1, listening: 0, thinking: 0, speaking: 0 };

  let sustain = 0;
  let impulse = 0;
  let energy = 0;

  /** Distance along the route, and how fast it is changing. */
  const roll = { p: 0, v: 0 };
  let shown = yarn.pose(0);
  let held = null;

  let t = 0;
  let fitted = null;
  const timer = new GFX.Timer();

  /**
   * Back the camera off, along the way it already looks, far enough that the
   * ball at the near end of the route is still a ball and not the whole view,
   * and that she and the strand nearest her fit across — the camera follows
   * her, so the rest of the route need not. On a phone held upright the width
   * is what decides it — and the caption and the composer take the bottom of a tall
   * screen, so the picture is slid up clear of them.
   */
  function refit(camera) {
    const target = stage._controls?.target;
    const half = Math.tan((camera.fov * Math.PI) / 360);
    const aspect = Math.max(camera.aspect || 1.6, 0.45);
    const distance = Math.max(0.75, 0.2 / (half * aspect));
    const away = camera.position.clone();
    if (target) away.sub(target);
    if (away.lengthSq() === 0) away.set(SEAT.x, SEAT.y, SEAT.z);
    camera.position.copy(target ?? new GFX.Vector3()).add(away.normalize().multiplyScalar(distance));
    camera.near = 0.01;
    camera.far = 50;
    camera.lensShift = SHIFT.base + Math.max(0, 1 - aspect) * SHIFT.tall;
    camera.updateProjectionMatrix();
    if (stage._controls) {
      stage._controls.minDistance = ZOOM.in;
      stage._controls.maxDistance = ZOOM.out * distance;
    }
  }

  function frame(dt) {
    t += dt;

    impulse = Math.max(0, impulse - impulse * Math.min(1, dt * 3.4) - dt * 0.05);
    energy = approach(energy, Math.min(1, sustain + impulse), 6, dt);

    const camera = stage._camera;
    if (camera && camera.aspect !== fitted) {
      fitted = camera.aspect;
      refit(camera);
    }

    if (held !== null) {
      shown = yarn.pose(held);
      return;
    }

    // Sprung toward the mood's spot on the floor, stepped finely so a slow
    // frame can't make it overshoot.
    const target = MOODS[state].base(t, routeLen);
    const W = ROLL.stiffness;
    for (let rem = dt; rem > 1e-6; rem -= STEP) {
      const h = Math.min(rem, STEP);
      roll.v += (W * W * (target - roll.p) - 2 * W * roll.v) * h;
      roll.v = clamp(roll.v, -ROLL.top, ROLL.top);
      roll.p += roll.v * h;
    }

    // Each mood's rhythm fades in as the last one's fades out, and the voice makes it bigger.
    let wob = 0;
    for (const k in weights) {
      weights[k] += ((k === state ? 1 : 0) - weights[k]) * (1 - Math.exp(-dt * BLEND));
      wob += weights[k] * MOODS[k].wob(t, routeLen);
    }
    wob *= ENERGY_GAIN.quiet + ENERGY_GAIN.loud * energy;

    shown = yarn.pose(roll.p + wob);
    roll.p = clamp(roll.p, 0, routeLen);
  }

  stage.setObject(yarn.root);

  // The stage frames by the object's bounds and rests its floor on them; the
  // strand lies on y = 0, and the camera is set from the route instead.
  const camera = stage._camera;
  if (camera && stage._controls) {
    pivot(stage._controls.target);
    camera.position.copy(stage._controls.target).add(new GFX.Vector3(SEAT.x, SEAT.y, SEAT.z));
    stage._controls.maxPolarAngle = Math.PI / 2 - 0.04;
    refit(camera);
    fitted = camera.aspect;
    stage._controls.update?.();
  }
  if (stage._ground) stage._ground.position.y = 0;
  // The stage's studio is lit for a dark character, with the sky wash and the
  // key both from above; on wool that blows the top of the ball out. The wash
  // is turned well down, and the key comes in lower, from the front and to one
  // side, so it models the ball instead of bleaching its crown.
  for (const light of stage._scene?.children ?? []) {
    if (light.isHemisphereLight) light.intensity = 0.45;
  }
  if (stage._fill) stage._fill.intensity = 0.3;
  const key = stage._key;
  if (key) {
    key.intensity = 1.2;
    key.position.set(2.4, 3.4, 3.2);
    key.shadow.radius = 3;
    key.shadow.normalBias = 0.0012;
    key.shadow.camera.left = key.shadow.camera.bottom = -0.9;
    key.shadow.camera.right = key.shadow.camera.top = 0.9;
    key.shadow.camera.updateProjectionMatrix();
  }

  // Added after the framing, so it doesn't count toward it.
  let contact = null;
  const map = contactTexture(GFX);
  if (map && stage._scene?.add) {
    contact = new GFX.Mesh(
      new GFX.PlaneGeometry(1, 1),
      new GFX.MeshBasicMaterial({ map, transparent: true, depthWrite: false }));
    contact.name = 'contact';
    contact.rotation.x = -Math.PI / 2;
    contact.scale.setScalar(yarn.radius * 1.9);
    contact.renderOrder = -1;
    stage._scene.add(contact);
  }

  /** Where the camera should turn round, for where she is now. */
  function pivot(into) {
    const b = yarn.ball.position;
    return into.set(TARGET.x + (b.x - TARGET.x) * FOLLOW, TARGET.y, TARGET.z + (b.z - TARGET.z) * FOLLOW);
  }

  const aim = new GFX.Vector3();
  const shift = new GFX.Vector3();

  /** Carry the pivot after her, and the camera with it, so the view keeps its angle and distance. */
  function follow(dt) {
    const target = stage._controls?.target;
    if (!target) return;
    pivot(aim);
    shift.copy(aim).sub(target).multiplyScalar(Math.min(1, dt * FOLLOW_RATE));
    target.add(shift);
    stage._camera?.position.add(shift);
  }

  function tick(dt) {
    frame(dt);
    follow(dt);
    if (contact) contact.position.set(yarn.ball.position.x, 0.0006, yarn.ball.position.z);
  }

  stage.onFrame = () => {
    timer.update();
    tick(Math.min(timer.getDelta(), 0.05));
  };

  return {
    get state() { return state; },
    /** How far along the floor she is, in metres. */
    get rolled() { return shown; },
    /** The route's length, and how much strand there is in all. */
    routeLen,
    total: yarn.total,
    /** The meshes, for anyone measuring them. */
    yarn,

    setState(next) {
      if (!Object.hasOwn(MOODS, next) || next === state) return;
      state = next;
      if (next === 'idle' || next === 'thinking') sustain = 0;
    },

    setLevel(level) {
      sustain = clamp(level, 0, 1);
    },

    pulse(weight = 0.3) {
      const w = clamp(weight, 0, 1);
      impulse = Math.min(1, impulse + w);
      roll.v += w * 0.25;
    },

    /** Hold her at one spot along the floor — for stills and checks — or let go with `null`. */
    hold(s) {
      held = s === null || s === undefined ? null : clamp(s, 0, routeLen);
      if (held !== null) shown = yarn.pose(held);
    },

    /** Run the rig forward without a renderer: for tests, and nothing else. */
    step(dt) { tick(dt); },

    dispose() {
      if (stage.onFrame) stage.onFrame = null;
    },
  };
}
