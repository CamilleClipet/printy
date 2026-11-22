// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChooserCancelled } from "../types";
import { printerTransport } from "./bluetooth";
import { RX, SERVICE, SERVICE_ADV, TX } from "../../printer/protocol";

function setupBluetooth(options: { notifyError?: Error; deviceName?: string } = {}) {
  const statusListener: { listener?: EventListener } = {};
  const tx = {
    writeValueWithoutResponse: vi.fn(async (bytes: Uint8Array) => { void bytes; }),
    writeValue: vi.fn(async (bytes: Uint8Array) => { void bytes; }),
  };
  const rx = {
    startNotifications: vi.fn(async () => {
      if (options.notifyError) throw options.notifyError;
      return rx;
    }),
    addEventListener: vi.fn((_event: string, listener: EventListener) => { statusListener.listener = listener; }),
  };
  const service = {
    getCharacteristic: vi.fn(async (uuid: string) => uuid === TX ? tx : uuid === RX ? rx : null),
  };
  const server = { getPrimaryService: vi.fn(async () => service) };
  const device = {
    name: options.deviceName ?? "X6 Test Printer",
    addEventListener: vi.fn(),
    gatt: { connect: vi.fn(async () => server), connected: true, disconnect: vi.fn() },
  };
  const requestDevice = vi.fn(async () => device);
  vi.stubGlobal("navigator", { bluetooth: { requestDevice } });
  return { device, requestDevice, tx, rx, service, server, statusListener };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Web Bluetooth transport", () => {
  it("uses the expected filters and UUIDs and returns the device name", async () => {
    const { device, requestDevice, service, server } = setupBluetooth();
    const hooks = { onDisconnect: vi.fn(), onNotify: vi.fn() };

    expect(printerTransport.supported).toBe(true);
    await expect(printerTransport.connect(hooks)).resolves.toBe("X6 Test Printer");
    expect(requestDevice).toHaveBeenCalledWith({
      filters: [{ namePrefix: "X6" }, { services: [SERVICE_ADV] }],
      optionalServices: [SERVICE, SERVICE_ADV],
    });
    expect(server.getPrimaryService).toHaveBeenCalledWith(SERVICE);
    expect(service.getCharacteristic).toHaveBeenNthCalledWith(1, TX);
    expect(service.getCharacteristic).toHaveBeenNthCalledWith(2, RX);
    expect(device.addEventListener).toHaveBeenCalledWith("gattserverdisconnected", expect.any(Function));
  });

  it("throws ChooserCancelled when the device chooser is cancelled", async () => {
    const { requestDevice } = setupBluetooth();
    requestDevice.mockRejectedValueOnce(Object.assign(new Error("cancelled"), { name: "NotFoundError" }));

    await expect(printerTransport.connect({ onDisconnect: vi.fn(), onNotify: vi.fn() })).rejects.toBeInstanceOf(ChooserCancelled);
  });

  it("keeps connecting when notifications are unavailable", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    setupBluetooth({ notifyError: new Error("notifications unavailable") });

    await expect(printerTransport.connect({ onDisconnect: vi.fn(), onNotify: vi.fn() })).resolves.toBe("X6 Test Printer");
    expect(warning).toHaveBeenCalledWith("Notifications unavailable", expect.any(Error));
  });

  it("writes without response when available and falls back to writeValue", async () => {
    const { tx } = setupBluetooth();
    await printerTransport.connect({ onDisconnect: vi.fn(), onNotify: vi.fn() });
    const original = Uint8Array.from([1, 2, 3]);
    await printerTransport.write(original);
    expect(tx.writeValueWithoutResponse).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect(tx.writeValueWithoutResponse.mock.calls[0][0]).not.toBe(original);

    const txFallback = tx as { writeValueWithoutResponse?: typeof tx.writeValueWithoutResponse; writeValue: typeof tx.writeValue };
    delete txFallback.writeValueWithoutResponse;
    await printerTransport.write(original);
    expect(tx.writeValue).toHaveBeenCalledWith(expect.any(Uint8Array));
  });
});
