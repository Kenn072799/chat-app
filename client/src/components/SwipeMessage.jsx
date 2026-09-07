import { useRef } from "react";
import { Reply } from "lucide-react";

const REPLY_DISTANCE = 48;
const DIRECTION_SLOP = 8;

export default function SwipeMessage({ children, onReply, onSelect, selected, ...props }) {
  const gesture = useRef(null);
  const surface = useRef(null);
  const suppressClick = useRef(false);

  const reset = () => {
    surface.current?.style.setProperty("--swipe", "0px");
    surface.current?.classList.remove("is-dragging", "reply-ready", "swiping-left");
    gesture.current = null;
  };

  const updateGesture = (event) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.locked) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DIRECTION_SLOP) return;
      if (Math.abs(dy) > Math.abs(dx)) { reset(); return; }
      current.locked = true;
      suppressClick.current = true;
    }
    current.distance = Math.abs(dx);
    // Follow the finger directly, then add resistance past the reply threshold.
    const offset = Math.sign(dx) * (Math.min(Math.abs(dx), REPLY_DISTANCE)
      + Math.min(Math.max(0, Math.abs(dx) - REPLY_DISTANCE) * 0.2, 24));
    surface.current.classList.add("is-dragging");
    surface.current.classList.toggle("reply-ready", current.distance >= REPLY_DISTANCE);
    surface.current.classList.toggle("swiping-left", dx < 0);
    surface.current.style.setProperty("--swipe", offset + "px");
  };

  return (
    <div
      {...props}
      data-selected={selected || undefined}
      onPointerDown={(event) => {
        suppressClick.current = false;
        if (event.pointerType === "mouse" || !event.isPrimary || event.target.closest("button")) return;
        gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, distance: 0, locked: false };
        // Capture on the stationary wrapper so moving bubbles never lose the finger.
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={updateGesture}
      onPointerUp={(event) => {
        updateGesture(event);
        const shouldReply = gesture.current?.locked && gesture.current.distance >= REPLY_DISTANCE;
        reset();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (shouldReply) onReply();
      }}
      onPointerCancel={reset}
      onLostPointerCapture={reset}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          event.stopPropagation();
          event.preventDefault();
          suppressClick.current = false;
        }
      }}
      onClick={(event) => {
        if (!event.target.closest("button") && !window.getSelection()?.toString()) onSelect();
      }}
    >
      <div ref={surface} className="swipe-surface">
        <span className="swipe-reply-hint" aria-hidden="true"><Reply size={18} /></span>
        {children}
      </div>
    </div>
  );
}
