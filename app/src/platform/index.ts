import { printerTransport } from "./web/bluetooth";

export const isNativePlatform = false;
export { printerTransport };
export { saveFile, shareFile, saveOrShareImage } from "./web/files";
export { ChooserCancelled } from "./types";
export type { PrinterTransport, TransportHooks, SaveFile, ShareFile, ShareResult } from "./types";
