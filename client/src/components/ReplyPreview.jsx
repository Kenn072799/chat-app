import { useEffect, useState } from "react";
import { Reply, X } from "lucide-react";
import { contentPreview } from "./sharedContent";

export default function ReplyPreview({ target, userId, onCancel }) {
  const [lastTarget, setLastTarget] = useState(target);
  useEffect(() => { if (target) setLastTarget(target); }, [target]);
  const message = target || lastTarget;
  return <div className="reply-preview" data-open={Boolean(target)} inert={!target ? true : undefined}>
    <div className="reply-preview-clip">
      {message && <div className="reply-preview-body">
        <Reply size={14} className="shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="text-xs font-bold">Replying to {Number(message.sender_id) === Number(userId) ? "yourself" : message.sender_username || "your friend"}</p>
          <p className="mt-1 truncate border-l-2 border-rose-400/60 pl-2 text-sm text-rose-100/60">{contentPreview(message.content)}</p>
        </div>
        <button type="button" onClick={onCancel} aria-label="Cancel reply" className="chat-icon-button"><X size={18} /></button>
      </div>}
    </div>
  </div>;
}
