import { useEffect, useRef, useCallback } from "react";

export type KeyState = Record<string, boolean>;

const PLAYER_KEYS = [
  { up: "w", down: "s", left: "a", right: "d" },
  { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" },
  { up: "t", down: "g", left: "f", right: "h" },
  { up: "8", down: "5", left: "4", right: "6" },
];

export function useLocalInputs(numPlayers: number, enabled = true) {
  const keysRef = useRef<KeyState>({});
  const inputsRef = useRef<{ up: boolean; down: boolean; left: boolean; right: boolean }[]>(
    Array.from({ length: 4 }, () => ({ up: false, down: false, left: false, right: false }))
  );

  useEffect(() => {
    if (!enabled) return;
    const reset = () => { keysRef.current = {}; };
    const handleDown = (e: KeyboardEvent) => {
      keysRef.current[e.key.length === 1 ? e.key.toLowerCase() : e.key] = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }
    };
    const handleUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false;
    };

    window.addEventListener("keydown", handleDown);
    window.addEventListener("blur", reset);
    window.addEventListener("keyup", handleUp);
    return () => {
      reset();
      window.removeEventListener("blur", reset);
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
    };
  }, [enabled]);

  const getInputs = useCallback(() => {
    const keys = keysRef.current;
    const count = Math.min(numPlayers, 4);
    for (let i = 0; i < count; i++) {
      const pk = PLAYER_KEYS[i];
      inputsRef.current[i] = {
        up: !!keys[pk.up] || (i === 0 && numPlayers === 1 && !!keys.ArrowUp),
        down: !!keys[pk.down],
        left: !!keys[pk.left] || (i === 0 && numPlayers === 1 && !!keys.ArrowLeft),
        right: !!keys[pk.right] || (i === 0 && numPlayers === 1 && !!keys.ArrowRight),
      };
    }
    return inputsRef.current;
  }, [numPlayers]);

  return getInputs;
}

export const KEY_BINDINGS = [
  { label: "WASD", keys: "A/D move, W jump" },
  { label: "Arrows", keys: "Left/Right move, Up jump" },
  { label: "TFGH", keys: "F/H move, T jump" },
  { label: "Numpad", keys: "4/6 move, 8 jump" },
];
