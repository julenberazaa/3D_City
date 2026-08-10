export interface ControlsState {
  throttle: number;
  steer: number;
  brake: number;
}

const KEY_W = "KeyW";
const KEY_S = "KeyS";
const KEY_A = "KeyA";
const KEY_D = "KeyD";
const KEY_UP = "ArrowUp";
const KEY_DOWN = "ArrowDown";
const KEY_LEFT = "ArrowLeft";
const KEY_RIGHT = "ArrowRight";
const KEY_SPACE = "Space";

export function createControls(target: HTMLElement): ControlsState {
  const state: ControlsState = { throttle: 0, steer: 0, brake: 0 };
  const held = new Set<string>();

  const update = () => {
    let throttle = 0;
    let steer = 0;
    if (held.has(KEY_W) || held.has(KEY_UP)) throttle += 1;
    if (held.has(KEY_S) || held.has(KEY_DOWN)) throttle -= 1;
    if (held.has(KEY_A) || held.has(KEY_LEFT)) steer -= 1;
    if (held.has(KEY_D) || held.has(KEY_RIGHT)) steer += 1;
    state.throttle = throttle;
    state.steer = steer;
    state.brake = held.has(KEY_SPACE) ? 1 : 0;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    held.add(e.code);
    update();
    if (
      e.code === KEY_W ||
      e.code === KEY_S ||
      e.code === KEY_A ||
      e.code === KEY_D ||
      e.code === KEY_SPACE ||
      e.code === KEY_UP ||
      e.code === KEY_DOWN ||
      e.code === KEY_LEFT ||
      e.code === KEY_RIGHT
    ) {
      e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    held.delete(e.code);
    update();
  };
  const onBlur = () => {
    held.clear();
    update();
  };

  target.addEventListener("keydown", onKeyDown);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  return state;
}
