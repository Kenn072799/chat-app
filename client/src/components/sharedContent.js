const PREFIX = "[shared:v1]";

export function parseSharedContent(content) {
  if (!content?.startsWith(PREFIX)) return null;
  try {
    const value = JSON.parse(content.slice(PREFIX.length));
    const url = new URL(value.url);
    if (!["https:", "http:"].includes(url.protocol) || !["image", "file"].includes(value.type) || typeof value.name !== "string") return null;
    return { url: url.href, type: value.type, name: value.name, caption: typeof value.caption === "string" ? value.caption : "" };
  } catch { return null; }
}

export function contentPreview(content) {
  const shared = parseSharedContent(content);
  return shared ? `${shared.type === "image" ? "Photo" : "Attachment"}: ${shared.name}${shared.caption ? ` · ${shared.caption}` : ""}` : content || "Shared a message";
}
