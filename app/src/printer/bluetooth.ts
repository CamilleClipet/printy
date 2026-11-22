import { ChooserCancelled, printerTransport, type PrinterTransport } from "../platform";
import { CMD, ENERGY, MOTOR_SPEED, packRow } from "./protocol";

export type PrinterStatus = "busy" | "on" | "";
export type PrinterCallbacks = {
  onStatus: (state: PrinterStatus, label: string) => void;
  onMessage: (message: string, error?: boolean) => void;
  onConnectionChange: (connected: boolean) => void;
};

export class Printer {
  private hasConnectedDevice = false;
  private deviceName = "Connected";
  private paused = false;
  private pace = 6;

  constructor(private readonly callbacks: PrinterCallbacks, private readonly transport: PrinterTransport = printerTransport) {}

  get connected(): boolean {
    return this.hasConnectedDevice;
  }

  get hasDevice(): boolean {
    return this.hasConnectedDevice;
  }

  disconnect(): void {
    this.transport.disconnect();
  }

  private onDisconnect = (): void => {
    this.hasConnectedDevice = false;
    this.callbacks.onStatus("", "Not connected");
    this.callbacks.onConnectionChange(false);
  };

  async connect(): Promise<void> {
    if (!this.transport.supported) {
      this.callbacks.onMessage("This browser can't use Bluetooth. On iPhone, open this page in the Bluefy app.", true);
      return;
    }
    try {
      this.callbacks.onStatus("busy", "Connecting…");
      this.deviceName = await this.transport.connect({ onDisconnect: this.onDisconnect, onNotify: this.onNotify });
      this.hasConnectedDevice = true;
      this.callbacks.onStatus("on", this.deviceName || "Connected");
      this.callbacks.onMessage("");
      this.callbacks.onConnectionChange(true);
    } catch (error) {
      this.hasConnectedDevice = false;
      this.callbacks.onStatus("", "Not connected");
      this.callbacks.onConnectionChange(false);
      if (error instanceof ChooserCancelled) {
        this.callbacks.onMessage("");
        return;
      }
      this.callbacks.onMessage(error instanceof Error ? error.message : String(error), true);
    }
  }

  private onNotify = (bytes: Uint8Array): void => {
    // The printer sends 51 78 AE ... with 0x10 to ask us to pause, 0x00 to resume.
    if (bytes[0] === 0x51 && bytes[1] === 0x78 && bytes[2] === 0xae) this.paused = bytes[6] === 0x10;
  };

  private async send(bytes: Uint8Array): Promise<void> {
    while (this.paused && this.hasConnectedDevice) await new Promise((resolve) => setTimeout(resolve, 20));
    if (!this.hasConnectedDevice) throw new Error("printer disconnected");
    await this.transport.write(bytes);
    if (this.pace > 0) await new Promise((resolve) => setTimeout(resolve, this.pace));
  }

  async print(bits: Uint8Array, height: number, width: number, darkness: 1 | 2 | 3 | 4, onProgress: (percent: number) => void): Promise<void> {
    if (!this.hasConnectedDevice) return;
    this.callbacks.onStatus("busy", "Printing…");
    this.pace = 6;
    try {
      await this.send(CMD.getState());
      await this.send(CMD.quality200());
      await this.send(CMD.energy(ENERGY[darkness]));
      await this.send(CMD.applyEnergy());
      await this.send(CMD.speed(MOTOR_SPEED));
      await this.send(CMD.update());
      await this.send(CMD.latticeStart());
      this.pace = 6; // steady pacing; faster floods the printer
      for (let y = 0; y < height; y++) {
        const row = packRow(bits, y, width);
        // Runs of blank rows are sent as paper feeds, which is much faster.
        if (row.every((b) => b === 0)) {
          let n = 1;
          while (y + n < height && packRow(bits, y + n, width).every((b) => b === 0)) n++;
          await this.send(CMD.feed(n));
          y += n - 1;
        } else {
          await this.send(CMD.row(row));
        }
        if (y % 40 === 0) onProgress(Math.round((y / height) * 100));
      }
      await this.send(CMD.feed(90)); // push the print past the tear bar
      await this.send(CMD.latticeEnd());
      await this.send(CMD.getState());
      this.callbacks.onMessage("Printed.");
    } catch (error) {
      if (this.hasConnectedDevice) this.callbacks.onMessage("Printing stopped: " + (error as Error).message, true);
    }
    this.callbacks.onStatus(this.hasConnectedDevice ? "on" : "", this.hasConnectedDevice ? (this.deviceName || "Connected") : "Not connected");
  }
}
