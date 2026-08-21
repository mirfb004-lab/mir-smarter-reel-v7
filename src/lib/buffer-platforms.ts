export type BufferPlatform = "instagram" | "tiktok" | "facebook" | "pinterest" | "youtube" | "linkedin" | "threads" | "x" | "bluesky" | "mastodon" | "googlebusiness" | "unknown";

export interface BufferPlatformCapabilities {
  platform: BufferPlatform;
  label: string;
  supportedPostTypes: string[];
  supportsVideo: boolean;
  supportsImage: boolean;
  supportsNestedThumbnailOffset: boolean;
  metadataSupport: "documented" | "limited" | "generic";
  notes: string;
}

const PLATFORM_CAPABILITIES: Record<BufferPlatform, BufferPlatformCapabilities> = {
  instagram: { platform: "instagram", label: "Instagram", supportedPostTypes: ["post", "story", "reel"], supportsVideo: true, supportsImage: true, supportsNestedThumbnailOffset: true, metadataSupport: "documented", notes: "Use Instagram metadata.type and shouldShareToFeed." },
  tiktok: { platform: "tiktok", label: "TikTok", supportedPostTypes: ["video"], supportsVideo: true, supportsImage: false, supportsNestedThumbnailOffset: true, metadataSupport: "limited", notes: "Use a public video URL; the public reference documents thumbnailOffset but not a public post-metadata input for privacy controls." },
  facebook: { platform: "facebook", label: "Facebook", supportedPostTypes: ["post", "reel", "story"], supportsVideo: true, supportsImage: true, supportsNestedThumbnailOffset: false, metadataSupport: "documented", notes: "Use Facebook metadata only for documented channel-specific fields." },
  pinterest: { platform: "pinterest", label: "Pinterest", supportedPostTypes: ["pin"], supportsVideo: true, supportsImage: true, supportsNestedThumbnailOffset: true, metadataSupport: "documented", notes: "Board metadata is required when targeting a specific board." },
  youtube: { platform: "youtube", label: "YouTube", supportedPostTypes: ["video", "short"], supportsVideo: true, supportsImage: false, supportsNestedThumbnailOffset: false, metadataSupport: "documented", notes: "YouTube metadata is channel-specific; do not send Instagram or TikTok fields." },
  linkedin: { platform: "linkedin", label: "LinkedIn", supportedPostTypes: ["post"], supportsVideo: true, supportsImage: true, supportsNestedThumbnailOffset: false, metadataSupport: "documented", notes: "Use only LinkedIn metadata fields documented by Buffer." },
  threads: { platform: "threads", label: "Threads", supportedPostTypes: ["post"], supportsVideo: true, supportsImage: true, supportsNestedThumbnailOffset: false, metadataSupport: "documented", notes: "Threads-specific metadata is separate from Instagram metadata." },
  x: { platform: "x", label: "X", supportedPostTypes: ["post"], supportsVideo: true, supportsImage: true, supportsNestedThumbnailOffset: false, metadataSupport: "documented", notes: "Use threaded-post inputs only when creating a thread." },
  bluesky: { platform: "bluesky", label: "Bluesky", supportedPostTypes: ["post"], supportsVideo: false, supportsImage: true, supportsNestedThumbnailOffset: false, metadataSupport: "documented", notes: "Bluesky server metadata is channel-level, not a generic post field." },
  mastodon: { platform: "mastodon", label: "Mastodon", supportedPostTypes: ["post"], supportsVideo: true, supportsImage: true, supportsNestedThumbnailOffset: false, metadataSupport: "documented", notes: "Mastodon server metadata is channel-level." },
  googlebusiness: { platform: "googlebusiness", label: "Google Business Profile", supportedPostTypes: ["post"], supportsVideo: false, supportsImage: true, supportsNestedThumbnailOffset: false, metadataSupport: "documented", notes: "Use Google Business metadata only for location-specific fields." },
  unknown: { platform: "unknown", label: "Unknown", supportedPostTypes: ["post"], supportsVideo: true, supportsImage: true, supportsNestedThumbnailOffset: false, metadataSupport: "generic", notes: "No platform-specific metadata is sent until the channel service is identified." },
};

export function normalizeBufferPlatform(platform: string | null | undefined): BufferPlatform {
  const p = String(platform ?? "").toLowerCase().replace(/[ _-]/g, "");
  if (p.includes("instagram")) return "instagram";
  if (p.includes("tiktok")) return "tiktok";
  if (p.includes("facebook")) return "facebook";
  if (p.includes("pinterest")) return "pinterest";
  if (p.includes("youtube")) return "youtube";
  if (p.includes("linkedin")) return "linkedin";
  if (p.includes("threads")) return "threads";
  if (p === "x" || p.includes("twitter")) return "x";
  if (p.includes("bluesky")) return "bluesky";
  if (p.includes("mastodon")) return "mastodon";
  if (p.includes("googlebusiness") || p.includes("googlemybusiness")) return "googlebusiness";
  return "unknown";
}

export function getBufferPlatformCapabilities(platform: string | null | undefined): BufferPlatformCapabilities {
  return PLATFORM_CAPABILITIES[normalizeBufferPlatform(platform)];
}
