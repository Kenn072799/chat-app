import { useCallback, useEffect, useRef } from "react";

// Wait for reply navigation to settle, then emphasize only the target bubble.
export default function useMessageHighlight(listRef) {
  const frame = useRef(null);
  const animation = useRef(null);
  useEffect(() => () => {
    cancelAnimationFrame(frame.current);
    animation.current?.cancel();
  }, []);

  return useCallback((element) => {
    const list = listRef.current;
    if (!element || !list) return;
    cancelAnimationFrame(frame.current);
    animation.current?.cancel();
    const bounds = element.getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const outside = bounds.top < viewport.top || bounds.bottom > viewport.bottom;
    if (outside) list.scrollTo({
      top: list.scrollTop + bounds.top - viewport.top - (list.clientHeight - bounds.height) / 2,
      behavior: reducedMotion ? "instant" : "smooth",
    });
    const started = performance.now();
    let lastTop = list.scrollTop;
    let stableFrames = 0;
    const highlight = () => {
      if (!element.isConnected) return;
      const top = list.scrollTop;
      stableFrames = Math.abs(top - lastTop) < 0.5 ? stableFrames + 1 : 0;
      lastTop = top;
      if (outside && performance.now() - started < 1200 && (stableFrames < 3 || performance.now() - started < 100)) {
        frame.current = requestAnimationFrame(highlight);
        return;
      }
      animation.current = element.querySelector(".chat-bubble")?.animate([
        { boxShadow: "0 0 0 2px rgba(253,164,175,0)", offset: 0 },
        { boxShadow: "0 0 0 2px rgba(253,164,175,.85)", offset: 0.15 },
        { boxShadow: "0 0 0 2px rgba(253,164,175,.85)", offset: 0.65 },
        { boxShadow: "0 0 0 2px rgba(253,164,175,0)", offset: 1 },
      ], { duration: reducedMotion ? 1200 : 1600, easing: "ease-out" });
    };
    frame.current = requestAnimationFrame(highlight);
  }, [listRef]);
}
