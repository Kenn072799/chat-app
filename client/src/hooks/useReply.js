import { useState } from "react";

export default function useReply() {
  const [replyTarget, setReplyTarget] = useState(null);
  return { replyTarget, setReplyTarget, cancelReply: () => setReplyTarget(null) };
}
