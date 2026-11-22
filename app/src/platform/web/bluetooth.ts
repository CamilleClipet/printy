import { ChooserCancelled, type PrinterTransport } from "../types";
import { RX, SERVICE, SERVICE_ADV, TX } from "../../printer/protocol";

let device: BluetoothDevice | null = null;
let tx: BluetoothRemoteGATTCharacteristic | null = null;

export const printerTransport: PrinterTransport = {
  get supported() {
    return typeof navigator !== "undefined" && !!navigator.bluetooth;
  },

  async connect({ onDisconnect, onNotify }) {
    let step = "choosing the printer";
    try {
      const selectedDevice = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "X6" }, { services: [SERVICE_ADV] }],
        optionalServices: [SERVICE, SERVICE_ADV],
      });
      selectedDevice.addEventListener("gattserverdisconnected", () => {
        device = null;
        tx = null;
        onDisconnect();
      });
      step = "connecting";
      if (!selectedDevice.gatt) throw new Error("no GATT server");
      const server = await selectedDevice.gatt.connect();
      step = "finding the print service";
      const service = await server.getPrimaryService(SERVICE);
      step = "finding the write channel";
      const write = await service.getCharacteristic(TX);
      step = "finding the status channel";
      const status = await service.getCharacteristic(RX);
      step = "turning on status updates";
      try {
        await status.startNotifications();
        status.addEventListener("characteristicvaluechanged", (event) => {
          const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
          if (!value) return;
          const bytes = new Uint8Array(value.byteLength);
          bytes.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
          onNotify(bytes);
        });
      } catch (error) {
        console.warn("Notifications unavailable", error);
      }
      device = selectedDevice;
      tx = write;
      return selectedDevice.name || "Connected";
    } catch (error) {
      tx = null;
      device = null;
      if ((error as { name?: string } | null)?.name === "NotFoundError" && step === "choosing the printer") {
        throw new ChooserCancelled();
      }
      const detail = error instanceof Error ? error.message || error.name : String(error);
      throw new Error(`Connection failed while ${step}: ${detail}`, { cause: error });
    }
  },

  async write(bytes) {
    const characteristic = tx;
    if (!characteristic) throw new Error("printer disconnected");
    const copy = new Uint8Array(bytes);
    if (characteristic.writeValueWithoutResponse) await characteristic.writeValueWithoutResponse(copy);
    else await characteristic.writeValue(copy);
  },

  disconnect() {
    if (device?.gatt?.connected) device.gatt.disconnect();
  },
};
