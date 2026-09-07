export function youtubeVideoId(href) {
  const url = new URL(href);
  const host = url.hostname.toLowerCase();
  let id;
  if (host === "youtu.be") id = url.pathname.split("/")[1];
  else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
    id = url.pathname === "/watch" ? url.searchParams.get("v")
      : /^\/(shorts|embed|live)\//.test(url.pathname) ? url.pathname.split("/")[2] : null;
  }
  return /^[\w-]{11}$/.test(id || "") ? id : null;
}

export function messageLinks(content) {
  const parts = [];
  const pattern = /\b(?:https?:\/\/|www\.)[^\s<>]+/gi;
  let cursor = 0;
  for (const match of content.matchAll(pattern)) {
    let label = match[0].replace(/[.,!?;:'"]+$/, "");
    // Keep balanced parentheses within URLs, but exclude prose punctuation.
    while (/[)\]}]$/.test(label)) {
      const closing = label.at(-1);
      const opening = { ")": "(", "]": "[", "}": "{" }[closing];
      if (label.split(closing).length <= label.split(opening).length) break;
      label = label.slice(0, -1);
    }
    try {
      const url = new URL(/^www\./i.test(label) ? `https://${label}` : label);
      if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) continue;
      if (match.index > cursor) parts.push({ text: content.slice(cursor, match.index) });
      parts.push({ text: label, href: url.href, videoId: youtubeVideoId(url.href) });
      cursor = match.index + label.length;
    } catch { /* Leave malformed links as text. */ }
  }
  if (cursor < content.length) parts.push({ text: content.slice(cursor) });
  return parts;
}
