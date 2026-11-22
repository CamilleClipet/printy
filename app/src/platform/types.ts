export type TransportHooks = {
  onDisconnect(): void;
  onNotify(bytes: Uint8Array): void;
};

export interface PrinterTransport {
  readonly supported: boolean;
  connect(hooks: TransportHooks): Promise<string>;
  reconnect?(hooks: TransportHooks): Promise<string>;
  lastDeviceName?(): string | null;
  write(bytes: Uint8Array): Promise<void>;
  disconnect(): void;
}

export class ChooserCancelled extends Error {
  constructor() {
    super("Printer chooser cancelled");
    this.name = "ChooserCancelled";
  }
}

export type ShareResult = "shared" | "cancelled" | "unsupported";
export type SaveFile = (blob: Blob, name: string) => Promise<void>;
export type ShareFile = (blob: Blob, name: string) => Promise<ShareResult>;
