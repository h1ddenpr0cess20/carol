/**
 * What each conversational state does to the ball. `base` is where along the
 * route she heads, in metres (sprung, so she eases there); `wob` is a rhythm
 * on top of it. Every bit of either is rolling, so every bit of it pays strand
 * out or winds it back in. `route` is the route's length.
 *
 * - idle — wound up at the back of the room, breathing a little.
 * - listening — rolled a quarter of the way toward you, rocking as she takes it in.
 * - thinking — back and forth in the middle, turning it over.
 * - speaking — up to the front: spinning a yarn, and skipping with the voice.
 */
export const MOODS = {
  idle: {
    base: () => 0,
    wob: (t) => 0.012 * (0.5 - 0.5 * Math.cos(t * 1.05)),
  },
  listening: {
    base: () => 0.24,
    wob: (t) => 0.012 * Math.sin(t * 2.4),
  },
  thinking: {
    base: (t) => 0.4 + 0.2 * (0.5 - 0.5 * Math.cos(t * 1.3)),
    wob: () => 0,
  },
  speaking: {
    base: (t, route) => route - 0.12,
    wob: (t) => 0.028 * Math.sin(t * 8.5) * (0.5 + 0.5 * Math.sin(t * 2.1)),
  },
};

/**
 * How much a loud moment adds to the rhythm. At zero level the state's own
 * rhythm plays at `quiet` of its size; at full level, at `quiet + loud`.
 */
export const ENERGY_GAIN = { quiet: 0.6, loud: 0.9 };

/** How hard the base is sprung, and the fastest she rolls toward it, in metres a second. */
export const ROLL = { stiffness: 3.0, top: 0.55 };
