import { memo, useMemo, useState } from "react";
import { Play, ExternalLink } from "lucide-react";
import { messageLinks } from "./messageLinks";

function VideoPreview({ href, videoId }) {
  const [failed, setFailed] = useState(false);
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      aria-label="Open video on YouTube"
      className="mt-3 block w-72 max-w-full overflow-hidden rounded-xl border border-white/15 bg-black/20 no-underline transition hover:bg-black/30">
      <div className="relative aspect-video bg-black/30">
        {!failed && <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
          alt="YouTube video thumbnail" loading="lazy" decoding="async"
          referrerPolicy="no-referrer" onError={() => setFailed(true)}
          className="h-full w-full object-cover" />}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/65 p-3 text-white"><Play size={24} fill="currentColor" /></span>
        </span>
      </div>
      <span className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-rose-50">
        {failed ? "Watch on YouTube" : "YouTube"}<ExternalLink size={14} />
      </span>
    </a>
  );
}

export default memo(function MessageContent({ content }) {
  const parts = useMemo(() => messageLinks(content), [content]);
  const previews = [...new Map(parts.filter((part) => part.videoId).map((part) => [part.videoId, part])).values()].slice(0, 3);
  return <>
    <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      {parts.map((part, index) => part.href
        ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer"
            className="underline decoration-white/50 underline-offset-2 hover:decoration-white">{part.text}</a>
        : <span key={index}>{part.text}</span>)}
    </div>
    {previews.map((part) => <VideoPreview key={part.videoId} {...part} />)}
  </>;
});
