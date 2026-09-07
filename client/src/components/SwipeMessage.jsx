import { useRef } from "react";
import { Reply } from "lucide-react";

export default function SwipeMessage({ children, onReply, onSelect, selected, ...props }) {
  const gesture = useRef(null);
  const surface = useRef(null);
  const suppressClick = useRef(false);

  const reset = () => {
    surface.current?.style.setProperty("--swipe", "0px");
    surface.current?.classList.remove("is-dragging", "reply-ready");
    gesture.current = null;
  };

  return (
    <div {...props} data-selected={selected || undefined}>
      <div
        ref={surface}
        className="swipe-surface"
        onPointerDown={(event) => {
          if (event.pointerType !== "touch" || !event.isPrimary || event.target.closest("button")) return;
          suppressClick.current = false;
          gesture.current = { x: event.clientX, y: event.clientY, distance: 0, locked: false };
        }}
        onPointerMove={(event) => {
          const current = gesture.current;
          if (!current) return;
          const dx = event.clientX - current.x;
          const dy = event.clientY - current.y;
          if (!current.locked) {
            if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { reset(); return; }
            if (Math.abs(dx) < 12) return;
            if (dx < 0) { reset(); return; }
            current.locked = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          current.distance = Math.max(0, Math.min(dx * 0.75, 84));
          surface.current.classList.add("is-dragging");
          surface.current.classList.toggle("reply-ready", current.distance >= 56);
          surface.current.style.setProperty("--swipe", `${current.distance}px`);
        }}
        onPointerUp={() => {
          const current = gesture.current;
          suppressClick.current = Boolean(current?.locked);
          if (current?.distance >= 56) onReply();
          reset();
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
        <span className="swipe-reply-hint" aria-hidden="true"><Reply size={18} /></span>
        {children}
      </div>
    </div>
  );
}
