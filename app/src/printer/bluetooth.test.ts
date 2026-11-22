import { afterEach, describe, expect, it, vi } from "vitest";
import { ChooserCancelled, type PrinterTransport } from "../platform/types";
import { Printer, type PrinterCallbacks } from "./bluetooth";
import { CMD, ENERGY, MOTOR_SPEED, packRow } from "./protocol";

function setupPrinter(options: { supported?: boolean; deviceName?: string } = {}) {
  const writes: Uint8Array[] = [];
  const hooks: { onDisconnect?: () => void; onNotify?: (bytes: Uint8Array) => void } = {};
  let writeError: Error | null = null;
  const transport: PrinterTransport = {
    supported: options.supported ?? true,
    connect: vi.fn(async (receivedHooks) => {
      hooks.onDisconnect = receivedHooks.onDisconnect;
      hooks.onNotify = receivedHooks.onNotify;
      return options.deviceName ?? "X6 Test Printer";
    }),
    write: vi.fn(async (bytes) => {
      if (writeError) throw writeError;
      writes.push(new Uint8Array(bytes));
    }),
    disconnect: vi.fn(() => hooks.onDisconnect?.()),
  };
  const callbacks: PrinterCallbacks = {
    onStatus: vi.fn(),
    onMessage: vi.fn(),
    onConnectionChange: vi.fn(),
  };
  const printer = new Printer(callbacks, transport);
  return {
    printer,
    callbacks,
    transport,
    hooks,
    writes,
    failWritesWith: (error: Error) => { writeError = error; },
  };
}

function packetCopies(...packets: Uint8Array[]): number[][] {
  return packets.map((bytes) => Array.from(bytes));
}

afterEach(() => vi.useRealTimers());

describe("Printer Bluetooth", () => {
  it("connects to the transport and reports its name", async () => {
    const { printer, callbacks, transport } = setupPrinter();
    await printer.connect();

    expect(printer.connected).toBe(true);
    expect(printer.hasDevice).toBe(true);
    expect(callbacks.onStatus).toHaveBeenCalledWith("on", "X6 Test Printer");
    expect(callbacks.onConnectionChange).toHaveBeenCalledWith(true);
    expect(transport.connect).toHaveBeenCalledOnce();
  });

  it("handles chooser cancellation without showing an error", async () => {
    const { printer, callbacks, transport } = setupPrinter();
    vi.mocked(transport.connect).mockRejectedValueOnce(new ChooserCancelled());

    await printer.connect();

    expect(callbacks.onMessage).toHaveBeenCalledWith("");
    expect(callbacks.onMessage).not.toHaveBeenCalledWith(expect.any(String), true);
  });

  it("reports the Bluefy guidance when Bluetooth is unavailable", async () => {
    const { printer, callbacks } = setupPrinter({ supported: false });
    await printer.connect();

    expect(callbacks.onMessage).toHaveBeenCalledWith(
      "This browser can't use Bluetooth. On iPhone, open this page in the Bluefy app.",
      true,
    );
  });

  it("prints the golden packet stream with a collapsed blank-row feed", async () => {
    const { printer, writes, callbacks } = setupPrinter();
    await printer.connect();

    const height = 4;
    const bits = new Uint8Array(384 * height);
    bits[0] = 1;
    bits[384 * 3 + 8] = 1;
    await printer.print(bits, height, 384, 4, vi.fn());

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
    const { printer, callbacks, failWritesWith } = setupPrinter();
    await printer.connect();
    failWritesWith(new Error("radio failed"));

    await printer.print(new Uint8Array(384), 1, 384, 1, vi.fn());

    expect(callbacks.onMessage).toHaveBeenCalledWith("Printing stopped: radio failed", true);
  });

  it("pauses packet sending until a resume notification arrives", async () => {
    const { printer, callbacks, writes, hooks } = setupPrinter();
    await printer.connect();
    vi.useFakeTimers();

    const notify = (state: number) => hooks.onNotify?.(Uint8Array.from([0x51, 0x78, 0xae, 0, 0, 0, state]));
    const printing = printer.print(new Uint8Array(384), 1, 384, 1, vi.fn());
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

  it("ends a print cleanly when the transport disconnects mid-job", async () => {
    const { printer, callbacks, writes, hooks } = setupPrinter();
    await printer.connect();
    vi.useFakeTimers();
    const printing = printer.print(new Uint8Array(384 * 2), 2, 384, 1, vi.fn());
    await Promise.resolve();
    await Promise.resolve();
    expect(writes).toHaveLength(1);

    hooks.onDisconnect?.();
    await vi.runAllTimersAsync();
    await printing;

    expect(writes).toHaveLength(1);
    expect(printer.connected).toBe(false);
    expect(callbacks.onMessage).not.toHaveBeenCalledWith(expect.stringContaining("Printing stopped"), true);
    expect(callbacks.onStatus).toHaveBeenLastCalledWith("", "Not connected");
  });
});
