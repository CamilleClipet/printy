import { CMD, ENERGY, MOTOR_SPEED, packRow, RX, SERVICE, SERVICE_ADV, TX } from "./protocol";

export type PrinterStatus = "busy" | "on" | "";
export type PrinterCallbacks = {
  onStatus: (state: PrinterStatus, label: string) => void;
  onMessage: (message: string, error?: boolean) => void;
  onConnectionChange: (connected: boolean) => void;
};

export class Printer {
  private device: BluetoothDevice | null = null;
  private tx: BluetoothRemoteGATTCharacteristic | null = null;
  private paused = false;
  private pace = 6;

  constructor(private readonly callbacks: PrinterCallbacks) {}

  get connected(): boolean {
    return this.tx !== null;
  }

  get hasDevice(): boolean {
    return this.device !== null;
  }

  disconnect(): void {
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
  }

  private onDisconnect = (): void => {
    this.tx = null;
    this.callbacks.onStatus("", "Not connected");
    this.callbacks.onConnectionChange(false);
  };

  async connect(): Promise<void> {
    if (!navigator.bluetooth) {
      this.callbacks.onMessage("This browser can't use Bluetooth. On iPhone, open this page in the Bluefy app.", true);
      return;
    }
    let step = "choosing the printer";
    try {
      this.callbacks.onStatus("busy", "Connecting…");
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "X6" }, { services: [SERVICE_ADV] }],
        optionalServices: [SERVICE, SERVICE_ADV],
      });
      this.device.addEventListener("gattserverdisconnected", this.onDisconnect);
      step = "connecting";
      const server = await this.device.gatt!.connect();
      step = "finding the print service";
      const svc = await server.getPrimaryService(SERVICE);
      step = "finding the write channel";
      this.tx = await svc.getCharacteristic(TX);
      step = "finding the status channel";
      const rx = await svc.getCharacteristic(RX);
      step = "turning on status updates";
      try {
        await rx.startNotifications();
        rx.addEventListener("characteristicvaluechanged", this.onNotify);
      } catch (e) {
        console.warn("Notifications unavailable", e); // printing still works without them
      }
      this.callbacks.onStatus("on", this.device.name || "Connected");
      this.callbacks.onMessage("");
      this.callbacks.onConnectionChange(true);
    } catch (e) {
      this.tx = null;
      this.callbacks.onStatus("", "Not connected");
      this.callbacks.onConnectionChange(false);
      const error = e as DOMException;
      if (error && error.name === "NotFoundError" && step === "choosing the printer") {
        this.callbacks.onMessage("");
        return;
      }
      const detail = (error && (error.message || error.name)) || String(e);
      this.callbacks.onMessage(`Connection failed while ${step}: ${detail}`, true);
    }
  }

  private onNotify = (event: Event): void => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const v = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    // The printer sends 51 78 AE ... with 0x10 to ask us to pause, 0x00 to resume.
    if (v[0] === 0x51 && v[1] === 0x78 && v[2] === 0xae) this.paused = v[6] === 0x10;
  };

  private async send(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    while (this.paused) await new Promise((resolve) => setTimeout(resolve, 20));
    const tx = this.tx!;
    if (tx.writeValueWithoutResponse) await tx.writeValueWithoutResponse(bytes);
    else await tx.writeValue(bytes);
    if (this.pace > 0) await new Promise((resolve) => setTimeout(resolve, this.pace));
  }

  async print(bits: Uint8Array, height: number, darkness: 1 | 2 | 3 | 4, onProgress: (percent: number) => void): Promise<void> {
    if (!this.tx) return;
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
        const row = packRow(bits, y);
        // Runs of blank rows are sent as paper feeds, which is much faster.
        if (row.every((b) => b === 0)) {
          let n = 1;
          while (y + n < height && packRow(bits, y + n).every((b) => b === 0)) n++;
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
    } catch (e) {
      this.callbacks.onMessage("Printing stopped: " + (e as Error).message, true);
    }
    this.callbacks.onStatus(this.tx ? "on" : "", this.tx ? (this.device?.name || "Connected") : "Not connected");
  }
}
