import type { ShareResult } from "../types";

export async function saveFile(blob: Blob, name: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function shareFile(blob: Blob, name: string): Promise<ShareResult> {
  if (typeof navigator === "undefined" || !navigator.share || !navigator.canShare) return "unsupported";
  try {
    const file = new File([blob], name, { type: blob.type });
    if (!navigator.canShare({ files: [file] })) return "unsupported";
    await navigator.share({ files: [file] });
    return "shared";
  } catch (error) {
    if ((error as Error)?.name === "AbortError") return "cancelled";
    return "unsupported";
  }
}

export async function saveOrShareImage(blob: Blob, name: string): Promise<void> {
  if (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) {
    const result = await shareFile(blob, name);
    if (result !== "unsupported") return;
  }
  await saveFile(blob, name);
}
