import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import * as GFX from '../../src/client/vendor/gfx/index.js';

import { ZOOM, createCarol } from '../../src/client/yarn/index.js';
import { createYarn, plyHeights, plyTexels } from '../../src/client/yarn/model.js';
import { ENERGY_GAIN, MOODS, ROLL } from '../../src/client/yarn/moods.js';
import { NUB, buildRoute, catmullRom } from '../../src/client/yarn/path.js';
import { R_TARGET, SEED, YR, windBall } from '../../src/client/yarn/winding.js';

const DT = 1 / 60;
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

/** Winding a ball takes a moment: one, shared by every test that only reads it. */
let ball;
before(() => { ball = windBall(); });

describe('windBall', () => {
  it('winds one long strand, the same one every time for the same seed', () => {
    const again = windBall({ seed: SEED });
    assert.equal(again.N, ball.N);
    assert.equal(again.total, ball.total);
    assert.ok(ball.total > 50 && ball.total < 120, `${ball.total} m of yarn`);
  });

  it('winds a different ball for a different seed', () => {
    assert.notEqual(windBall({ seed: 7 }).total, ball.total);
  });

  it('winds it round, to the size it was aiming for', () => {
    const outer = ball.rBall.slice(-200);
    const mean = outer.reduce((a, b) => a + b, 0) / outer.length;
    assert.ok(Math.abs(mean - R_TARGET) < 0.025, `the surface sits at ${mean} m`);
    for (let i = 0; i < ball.N; i++) {
      const r = Math.hypot(ball.P[3 * i], ball.P[3 * i + 1], ball.P[3 * i + 2]);
      assert.ok(r < R_TARGET * 1.4, `sample ${i} sticks out to ${r} m`);
    }
  });

  it('measures the strand from the core outwards, never backwards', () => {
    for (let i = 1; i < ball.N; i++) assert.ok(ball.cum[i] > ball.cum[i - 1], `the strand doubles back at ${i}`);
    assert.equal(ball.cum[ball.N - 1], ball.total);
  });
});

describe('the route', () => {
  it('passes through the knots it is drawn through', () => {
    const knots = [[0, 0], [1, 2], [3, 1], [4, 4]];
    const at = catmullRom(knots);
    for (let k = 0; k < knots.length; k++) {
      const [x, z] = at(k / (knots.length - 1));
      assert.ok(close(x, knots[k][0], 1e-12) && close(z, knots[k][1], 1e-12), `misses knot ${k}`);
    }
  });

  it('runs about a metre across the floor, smoothly, in unit steps', () => {
    const { length, floorAt } = buildRoute();
    assert.ok(length > 0.9 && length < 1.3, `${length} m long`);
    let last = { ...floorAt(0) };
    for (let s = 0.01; s <= length; s += 0.01) {
      const f = floorAt(s);
      assert.ok(close(Math.hypot(f.dx, f.dz), 1, 1e-6));
      const step = Math.hypot(f.x - last.x, f.z - last.z);
      assert.ok(step < 0.0101 && step > 0.0099, `a jump of ${step} m at ${s}`);
      last = { ...f };
    }
  });

  it('leaves a tail behind the start that curls away from the route', () => {
    const { floorAt } = buildRoute();
    const start = { ...floorAt(0) };
    const ahead = { ...floorAt(0.05) };
    const behind = { ...floorAt(-0.05) };
    const towardAhead = (ahead.x - start.x) * (behind.x - start.x) + (ahead.z - start.z) * (behind.z - start.z);
    assert.ok(towardAhead < 0, 'the tail lies on the route instead of behind it');
    assert.ok(Math.hypot(behind.x - start.x, behind.z - start.z) > 0.045);
  });
});

describe('the plies', () => {
  it('paints a tile of grey texels, dark in the grooves and bright on the plies', () => {
    for (const texels of [plyTexels(64, 32), plyHeights(64, 32)]) {
      assert.equal(texels.length, 64 * 32 * 4);
      let lo = 255, hi = 0;
      for (let i = 0; i < texels.length; i += 4) {
        assert.equal(texels[i], texels[i + 1]);
        assert.equal(texels[i], texels[i + 2]);
        assert.equal(texels[i + 3], 255);
        lo = Math.min(lo, texels[i]);
        hi = Math.max(hi, texels[i]);
      }
      assert.ok(hi - lo > 80, `only ${lo}..${hi}: no plies to see`);
    }
  });

  it('tiles without a seam, along the strand and round it', () => {
    const W = 256, H = 128;
    const h = plyHeights(W, H);
    const at = (x, y) => h[(((y + H) % H) * W + ((x + W) % W)) * 4];
    // Across each edge the step is no bigger than the steps inside the tile.
    let inside = 0;
    for (let y = 0; y < H; y++) for (let x = 1; x < W; x++) inside = Math.max(inside, Math.abs(at(x, y) - at(x - 1, y)));
    for (let y = 0; y < H; y++) assert.ok(Math.abs(at(0, y) - at(W - 1, y)) <= inside, `a seam along the strand at row ${y}`);
    let round = 0;
    for (let x = 0; x < W; x++) for (let y = 1; y < H; y++) round = Math.max(round, Math.abs(at(x, y) - at(x, y - 1)));
    for (let x = 0; x < W; x++) assert.ok(Math.abs(at(x, 0) - at(x, H - 1)) <= round, `a seam round the strand at column ${x}`);
  });
});

describe('createYarn', () => {
  let yarn;
  before(() => { yarn = createYarn(GFX); });

  it('builds the ball and the strand behind it as two meshes in one red wool', () => {
    assert.equal(yarn.root.name, 'carol');
    assert.equal(yarn.wound.parent, yarn.ball);
    assert.equal(yarn.laid.parent, yarn.root);
    assert.equal(yarn.wound.material, yarn.laid.material);
    assert.ok(yarn.material.sheen > 0, 'wool without its sheen reads as plastic');
    assert.ok(yarn.material.vertexColors);
    for (const mesh of [yarn.wound, yarn.laid]) {
      for (const name of ['position', 'normal', 'color', 'uv']) assert.ok(mesh.geometry.attributes[name], `${mesh.name} has no ${name}`);
    }
  });

  it('rests the ball on the floor wherever it has rolled to', () => {
    // It rides on its radius averaged over a few centimetres of strand, so a
    // lumpy turn may press into the floor by a yarn's width or so — never more.
    for (let s = 0; s <= yarn.routeLen; s += 0.05) {
      yarn.pose(s);
      yarn.root.updateMatrixWorld(true);
      // The lowest of the vertices still wound, where the ball has them now.
      const position = yarn.wound.geometry.attributes.position;
      const wound = (yarn.wound.geometry.drawRange.count / 48 + 1) * 9;
      const v = new GFX.Vector3();
      let bottom = Infinity;
      for (let i = 0; i < wound; i++) {
        v.fromBufferAttribute(position, i).applyMatrix4(yarn.wound.matrixWorld);
        bottom = Math.min(bottom, v.y);
      }
      assert.ok(bottom > -2.5 * YR && bottom < 0.004, `at ${s} the ball's bottom is at ${bottom}`);
    }
  });

  it('pays strand out as it rolls, without slipping, and takes it back on the way home', () => {
    const laidAt = (s) => { yarn.pose(s); return yarn.laid.geometry.drawRange; };
    const woundAt = (s) => { yarn.pose(s); return yarn.wound.geometry.drawRange.count; };
    assert.ok(laidAt(0.6).start < laidAt(0.1).start, 'rolling out laid nothing down');
    assert.ok(woundAt(0.6) < woundAt(0.1), 'rolling out left the ball as big');
    const out = laidAt(0.1).start;
    laidAt(0.6);
    assert.equal(laidAt(0.1).start, out, 'rolling back is not the way out reversed');
    assert.ok(close(yarn.onFloor(0.5) - yarn.onFloor(0), 0.5, 1e-12));
    assert.ok(close(yarn.onFloor(0.5) + yarn.onBall(0.5), yarn.total, 1e-9));
    assert.ok(close(yarn.onFloor(0), NUB, 1e-12), 'the tail should always be down');
  });

  it('turns the ball as it rolls, a full turn for its own circumference', () => {
    const turned = (a, b) => {
      yarn.pose(a);
      const q = yarn.ball.quaternion.clone();
      yarn.pose(b);
      return 2 * Math.acos(Math.min(1, Math.abs(q.dot(yarn.ball.quaternion))));
    };
    // A short roll turns it by roughly distance over radius; the route bends, so be lenient.
    const angle = turned(0.3, 0.35);
    assert.ok(Math.abs(angle - 0.05 / (R_TARGET + YR)) < 0.2, `turned ${angle} rad over 5 cm`);
  });

  it('clamps a pose to the route', () => {
    assert.equal(yarn.pose(-3), 0);
    assert.equal(yarn.pose(99), yarn.routeLen);
  });
});

describe('MOODS', () => {
  const route = 1;

  it('covers the four conversational states', () => {
    assert.deepEqual(Object.keys(MOODS).sort(), ['idle', 'listening', 'speaking', 'thinking']);
    for (const mood of Object.values(MOODS)) {
      for (const t of [0, 0.7, 3.1]) {
        assert.ok(Number.isFinite(mood.base(t, route)));
        assert.ok(Number.isFinite(mood.wob(t, route)));
      }
    }
  });

  it('rolls further out the more of the conversation is hers', () => {
    const at = (name) => MOODS[name].base(0, route);
    assert.equal(at('idle'), 0);
    assert.ok(at('listening') > at('idle'));
    assert.ok(at('thinking') > at('listening'));
    assert.ok(at('speaking') > at('thinking'));
    assert.ok(at('speaking') < route, 'speaking would run her off the end');
  });

  it('keeps every rhythm small next to the route', () => {
    const loudest = ENERGY_GAIN.quiet + ENERGY_GAIN.loud;
    for (const mood of Object.values(MOODS)) {
      for (let t = 0; t < 10; t += 0.05) assert.ok(Math.abs(mood.wob(t, route)) * loudest < 0.06);
    }
    assert.ok(ROLL.top > 0 && ROLL.stiffness > 0);
  });
});

describe('createCarol', () => {
  function fakeStage({ aspect = 4 / 3 } = {}) {
    const scene = new GFX.Scene();
    const camera = new GFX.PerspectiveCamera(45, aspect, 0.01, 500);
    const ground = new GFX.Mesh(new GFX.PlaneGeometry(10, 10), new GFX.ShadowMaterial());
    const key = new GFX.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 7, 5);
    return {
      _scene: scene,
      _camera: camera,
      _ground: ground,
      _key: key,
      _controls: { target: new GFX.Vector3(), minDistance: 0, maxDistance: Infinity, maxPolarAngle: Math.PI },
      object: null,
      onFrame: null,
      setObject(o) {
        this.object = o;
        scene.add(o);
        ground.position.y = -0.2;
      },
    };
  }

  let stage;
  let carol;
  before(() => {
    stage = fakeStage();
    carol = createCarol({ stage, GFX });
  });

  const run = (seconds) => { for (let t = 0; t < seconds; t += DT) carol.step(DT); };

  it('puts herself on the stage, the floor under her, and the camera on the route', () => {
    assert.equal(stage.object.name, 'carol');
    assert.equal(stage._ground.position.y, 0);
    assert.equal(typeof stage.onFrame, 'function');
    assert.ok(stage._controls.maxPolarAngle < Math.PI / 2, 'the camera may go under the floor');
    assert.equal(stage._controls.minDistance, ZOOM.in);
    assert.ok(stage._controls.maxDistance > stage._camera.position.distanceTo(stage._controls.target));
  });

  it('turns the studio down for a pale floor', () => {
    assert.ok(stage._key.intensity < 2.2, 'the key is still at the stage default');
  });

  it('starts wound up at the start of the route', () => {
    assert.equal(carol.state, 'idle');
    assert.equal(carol.rolled, 0);
  });

  it('rolls out to speak and winds herself back in when it is over', () => {
    carol.setState('speaking');
    run(6);
    assert.ok(carol.rolled > carol.routeLen * 0.7, `only ${carol.rolled} m out`);
    carol.setState('idle');
    run(8);
    assert.ok(carol.rolled < 0.03, `still ${carol.rolled} m out`);
  });

  it('turns it over in the middle while thinking', () => {
    carol.setState('thinking');
    run(5);
    assert.ok(carol.rolled > 0.3 && carol.rolled < 0.7, `${carol.rolled} m out`);
    carol.setState('idle');
    run(8);
  });

  it('ignores a state it has no mood for', () => {
    carol.setState('connecting');
    assert.equal(carol.state, 'idle');
  });

  it('keeps a bigger rhythm the louder the voice is', () => {
    const spread = (level) => {
      carol.setState('speaking');
      carol.setLevel(level);
      run(5);
      let lo = Infinity, hi = -Infinity;
      for (let t = 0; t < 3; t += DT) {
        carol.setLevel(level);
        carol.step(DT);
        lo = Math.min(lo, carol.rolled);
        hi = Math.max(hi, carol.rolled);
      }
      return hi - lo;
    };
    const quiet = spread(0);
    const loud = spread(1);
    assert.ok(loud > quiet * 1.5, `${quiet} m quiet, ${loud} m loud`);
    carol.setLevel(0);
    carol.setState('idle');
    run(8);
  });

  it('skips forward on a pulse', () => {
    carol.setState('listening');
    run(6);
    const before = carol.rolled;
    carol.pulse(1);
    let furthest = before;
    for (let t = 0; t < 0.4; t += DT) { carol.step(DT); furthest = Math.max(furthest, carol.rolled); }
    assert.ok(furthest > before + 0.01, `${before} → ${furthest}`);
    carol.setState('idle');
    run(8);
  });

  it('can be held at one spot for a still, and let go', () => {
    carol.hold(0.5);
    run(1);
    assert.equal(carol.rolled, 0.5);
    carol.hold(null);
    run(8);
    assert.ok(carol.rolled < 0.03);
  });

  it('follows the ball with the pinch of shadow under it', () => {
    // No canvas in node, so there is no texture to draw it with — and no mesh.
    assert.equal(stage._scene.getObjectByName('contact'), undefined);
  });

  it('frames a phone held upright from further back than a wide screen', () => {
    const wide = fakeStage({ aspect: 16 / 9 });
    const tall = fakeStage({ aspect: 9 / 19.5 });
    createCarol({ stage: wide, GFX }).step(DT);
    createCarol({ stage: tall, GFX }).step(DT);
    const away = (s) => s._camera.position.distanceTo(s._controls.target);
    assert.ok(away(tall) > away(wide) * 1.1, `${away(tall)} against ${away(wide)}`);
  });

  it('turns the camera round her, not round a spot on the floor, and keeps its distance as she rolls', () => {
    const target = stage._controls.target;
    const away = () => stage._camera.position.distanceTo(target);
    const from = away();
    const start = target.clone();
    carol.setState('speaking');
    run(6);
    const ball = carol.yarn.ball.position;
    assert.ok(target.distanceTo(start) > 0.1, 'the pivot stayed put while she rolled');
    assert.ok(Math.abs(target.y - 0.09) < 1e-9, 'the pivot left the height of the ball');
    // Most of the way from the middle of the route to her, on the floor plane.
    assert.ok(Math.hypot(target.x - ball.x * 0.8, target.z - ball.z * 0.8) < 0.02);
    assert.ok(Math.abs(away() - from) < 1e-6, 'following her moved the camera nearer or further');
    carol.setState('idle');
    run(8);
  });

  it('slides the picture up clear of the caption, more on a tall screen, without turning the camera', () => {
    const wide = fakeStage({ aspect: 16 / 9 });
    const tall = fakeStage({ aspect: 9 / 19.5 });
    createCarol({ stage: wide, GFX });
    createCarol({ stage: tall, GFX });
    assert.ok(wide._camera.lensShift > 0);
    assert.ok(tall._camera.lensShift > wide._camera.lensShift);
    assert.ok(tall._controls.target.y > 0, 'the camera turns round a point under the floor');
  });

  it('lets go of the stage when disposed', () => {
    carol.dispose();
    assert.equal(stage.onFrame, null);
  });
});
