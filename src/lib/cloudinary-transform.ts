export type CloudinaryTransformMode = "replace" | "stack";
export type CloudinaryTransformResult = { url: string; error: string | null };

const TRANSFORM_SEGMENT = /(?:^|,)(?:w_|h_|c_|g_|e_|q_|f_|r_|ar_|so_|du_|vc_|fl_|t_|dpr_)/;

function validTransformation(value: string) {
  return Boolean(value) && value.length <= 1000 && !/[\s?#]/.test(value) && !value.startsWith(",") && !value.endsWith(",") && !value.includes("//") && /^[A-Za-z0-9_.,:/-]+$/.test(value);
}

export function isCloudinaryDeliveryUrl(inputUrl: string) {
  try {
    const parsed = new URL(inputUrl);
    return parsed.hostname === "res.cloudinary.com" && parsed.pathname.includes("/upload/");
  } catch {
    return false;
  }
}

export function applyCloudinaryTransform(inputUrl: string, transformation: string, mode: CloudinaryTransformMode = "replace"): CloudinaryTransformResult {
  if (!transformation) return { url: inputUrl, error: null };
  if (!validTransformation(transformation)) return { url: inputUrl, error: "Transformation contains invalid characters or format" };
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    return { url: inputUrl, error: "The media URL is not a valid URL" };
  }
  if (parsed.hostname !== "res.cloudinary.com") return { url: inputUrl, error: "URL is not a Cloudinary delivery URL" };
  const uploadMarker = "/upload/";
  const uploadIndex = parsed.pathname.indexOf(uploadMarker);
  if (uploadIndex < 0) return { url: inputUrl, error: "Cloudinary /upload/ segment was not found" };
  const before = parsed.pathname.slice(0, uploadIndex + uploadMarker.length);
  const after = parsed.pathname.slice(uploadIndex + uploadMarker.length);
  const segments = after.split("/");
  const hasExistingTransform = TRANSFORM_SEGMENT.test(segments[0] ?? "");
  const existing = hasExistingTransform ? segments.shift()! : "";
  const nextTransform = mode === "stack" && existing ? `${transformation}/${existing}` : transformation;
  parsed.pathname = `${before}${nextTransform}/${segments.join("/")}`;
  return { url: parsed.toString(), error: null };
}
