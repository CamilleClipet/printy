import { afterEach, describe, expect, it, vi } from "vitest";
import { Printer, type PrinterCallbacks } from "./bluetooth";
import { CMD, ENERGY, MOTOR_SPEED, packRow, SERVICE, TX, RX } from "./protocol";

type FakeCharacteristic = {
  writeValueWithoutResponse: (value: Uint8Array) => Promise<void>;
  startNotifications: () => Promise<FakeCharacteristic>;
  addEventListener: (type: string, listener: EventListener) => void;
  value?: DataView;
};

function setupPrinter(options: { bluetooth?: boolean; deviceName?: string } = {}) {
  const writes: Uint8Array[] = [];
  const listenerState: { listener?: EventListener } = {};
  const tx: FakeCharacteristic = {
    writeValueWithoutResponse: async (value) => { writes.push(new Uint8Array(value)); },
    startNotifications: async () => rx,
    addEventListener: () => {},
  };
  const rx: FakeCharacteristic = {
    writeValueWithoutResponse: async () => {},
    startNotifications: async () => rx,
    addEventListener: (_type, listener) => { listenerState.listener = listener; },
  };
  const device = {
    name: options.deviceName ?? "X6 Test Printer",
    addEventListener: vi.fn(),
    gatt: {
      connect: vi.fn(async () => ({
        getPrimaryService: vi.fn(async (service: string) => {
          expect(service).toBe(SERVICE);
          return {
            getCharacteristic: vi.fn(async (characteristic: string) => {
              if (characteristic === TX) return tx;
              if (characteristic === RX) return rx;
              throw new Error(`Unexpected characteristic ${characteristic}`);
            }),
          };
        }),
      })),
      connected: true,
      disconnect: vi.fn(),
    },
  };
  const requestDevice = vi.fn(async () => device);
  vi.stubGlobal("navigator", options.bluetooth === false ? {} : { bluetooth: { requestDevice } });

  const callbacks: PrinterCallbacks = {
    onStatus: vi.fn(),
    onMessage: vi.fn(),
    onConnectionChange: vi.fn(),
  };
  const printer = new Printer(callbacks);
  return { printer, callbacks, device, requestDevice, writes, tx, rx, listenerState };
}

function packetCopies(...packets: Uint8Array[]): number[][] {
  return packets.map((bytes) => Array.from(bytes));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Printer Bluetooth", () => {
  it("connects to the device and reports its name", async () => {
    const { printer, callbacks, device } = setupPrinter();
    await printer.connect();

    expect(printer.connected).toBe(true);
    expect(printer.hasDevice).toBe(true);
    expect(callbacks.onStatus).toHaveBeenCalledWith("on", "X6 Test Printer");
    expect(callbacks.onConnectionChange).toHaveBeenCalledWith(true);
    expect(device.gatt.connect).toHaveBeenCalledOnce();
  });

  it("handles picker cancellation without showing an error", async () => {
    const { printer, callbacks, requestDevice } = setupPrinter();
    const cancelled = Object.assign(new Error("No device selected"), { name: "NotFoundError" });
    requestDevice.mockRejectedValueOnce(cancelled);

    await printer.connect();

    expect(callbacks.onMessage).toHaveBeenCalledWith("");
    expect(callbacks.onMessage).not.toHaveBeenCalledWith(expect.any(String), true);
  });

  it("reports the Bluefy guidance when Bluetooth is unavailable", async () => {
    const { printer, callbacks } = setupPrinter({ bluetooth: false });
    await printer.connect();

    expect(callbacks.onMessage).toHaveBeenCalledWith(
      "This browser can't use Bluetooth. On iPhone, open this page in the Bluefy app.",
      true,
    );
  });

  it("prints setup commands, rows, collapsed blank rows and completion commands", async () => {
    const { printer, writes, callbacks } = setupPrinter();
    await printer.connect();

    const height = 4;
    const bits = new Uint8Array(384 * height);
    bits[0] = 1;
    bits[384 * 3 + 8] = 1;
    await printer.print(bits, height, 4, vi.fn());

    const expected = [
      CMD.getState(),
      CMD.quality200(),
      CMD.energy(ENERGY[4]),
      CMD.applyEnergy(),
      CMD.speed(MOTOR_SPEED),
      CMD.update(),
      CMD.latticeStart(),
      CMD.row(packRow(bits, 0)),
      CMD.feed(2),
      CMD.row(packRow(bits, 3)),
      CMD.feed(90),
      CMD.latticeEnd(),
      CMD.getState(),
    ];
    expect(packetCopies(...writes)).toEqual(packetCopies(...expected));
    expect(callbacks.onMessage).toHaveBeenCalledWith("Printed.");
  });

  it("reports a failed write as a stopped print", async () => {
    const { printer, callbacks, tx } = setupPrinter();
    await printer.connect();
    tx.writeValueWithoutResponse = vi.fn(async () => { throw new Error("radio failed"); });

    await printer.print(new Uint8Array(384), 1, 1, vi.fn());

    expect(callbacks.onMessage).toHaveBeenCalledWith("Printing stopped: radio failed", true);
  });

  it("pauses packet sending until a resume notification arrives", async () => {
    const { printer, callbacks, writes, rx, listenerState } = setupPrinter();
    await printer.connect();
    vi.useFakeTimers();

    const notify = (state: number) => {
      rx.value = new DataView(Uint8Array.from([0x51, 0x78, 0xae, 0, 0, 0, state]).buffer);
      listenerState.listener?.({ target: rx } as unknown as Event);
    };

    const printing = printer.print(new Uint8Array(384), 1, 1, vi.fn());
    await Promise.resolve();
    await Promise.resolve();
    expect(writes).toHaveLength(1);

    notify(0x10);
    await vi.advanceTimersByTimeAsync(6);
    expect(writes).toHaveLength(1);

    notify(0x00);
    await vi.runAllTimersAsync();
    await printing;

    expect(callbacks.onMessage).toHaveBeenCalledWith("Printed.");
  });
});
