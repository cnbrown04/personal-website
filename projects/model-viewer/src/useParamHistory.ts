import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from "react";
import type { Params } from "./types";

/** Changes to the same parameters closer together than this become one undo step (slider drags, typing). */
const COALESCE_MS = 600;
const LIMIT = 200;

/**
 * Undo/redo over the whole parameter set. Every user change to `params` is recorded
 * by watching the state; programmatic loads go through `setSilently` instead.
 */
export function useParamHistory(params: Params, setParams: Dispatch<SetStateAction<Params>>) {
  const past = useRef<Params[]>([]);
  const future = useRef<Params[]>([]);
  const current = useRef<Params | null>(null);
  const silent = useRef(false);
  const last = useRef({ at: 0, keys: "" });
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const before = current.current;
    current.current = params;
    if (silent.current || !before || Object.keys(before).length === 0) {
      silent.current = false;
      return;
    }
    const names = new Set([...Object.keys(before), ...Object.keys(params)]);
    const changed = [...names]
      .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(params[k]))
      .sort();
    if (!changed.length) return;
    const keys = changed.join(",");
    const now = performance.now();
    const continuing =
      past.current.length > 0 && now - last.current.at < COALESCE_MS && keys === last.current.keys;
    last.current = { at: now, keys };
    if (!continuing) past.current = [...past.current.slice(-(LIMIT - 1)), before];
    if (future.current.length) future.current = [];
    rerender();
  }, [params]);

  const setSilently = useCallback(
    (next: SetStateAction<Params>) => {
      silent.current = true;
      setParams(next);
    },
    [setParams],
  );

  const undo = useCallback(() => {
    const target = past.current.at(-1);
    if (!target || !current.current) return;
    past.current = past.current.slice(0, -1);
    future.current = [current.current, ...future.current];
    last.current = { at: 0, keys: "" };
    setSilently(target);
    rerender();
  }, [setSilently]);

  const redo = useCallback(() => {
    const target = future.current[0];
    if (!target || !current.current) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, current.current];
    last.current = { at: 0, keys: "" };
    setSilently(target);
    rerender();
  }, [setSilently]);

  return {
    undo,
    redo,
    setSilently,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
