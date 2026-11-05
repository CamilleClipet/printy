import { describe, expect, it } from "vitest";
import { CMD, ENERGY, crc8, packRow, packet, WIDTH } from "./protocol";

function independentCrc8(data: Iterable<number>): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

describe("printer protocol", () => {
  it("computes CRC-8 with polynomial 0x07", () => {
    expect(crc8([])).toBe(0);
    for (const input of [
      [0x01],
      [0x00, 0x32],
      [0xaa, 0x55, 0x17, 0x38, 0x44, 0x5f, 0x5f, 0x5f, 0x44, 0x38, 0x2c],
    ]) {
      expect(crc8(input)).toBe(independentCrc8(input));
    }
  });

  it("lays out packets and encodes lengths over 255 bytes", () => {
    const data = [0x12, 0x34, 0x56];
    expect(Array.from(packet(0xa2, data))).toEqual([
      0x51, 0x78, 0xa2, 0x00, 0x03, 0x00, ...data, independentCrc8(data), 0xff,
    ]);

    const longData = new Uint8Array(300).fill(0x5a);
    const longPacket = packet(0x42, longData);
    expect(Array.from(longPacket.slice(0, 6))).toEqual([0x51, 0x78, 0x42, 0x00, 0x2c, 0x01]);
    expect(longPacket).toHaveLength(308);
    expect(longPacket[306]).toBe(independentCrc8(longData));
    expect(longPacket[307]).toBe(0xff);
  });

  it("encodes energy, feed and speed command values", () => {
    expect(Array.from(CMD.energy(12000))).toEqual(Array.from(packet(0xaf, [0xe0, 0x2e])));
    expect(Array.from(CMD.feed(90))).toEqual(Array.from(packet(0xa1, [0x5a, 0x00])));
    expect(Array.from(CMD.speed(4))).toEqual(Array.from(packet(0xbd, [0x04])));
    expect(ENERGY).toEqual({ 1: 4000, 2: 6500, 3: 9000, 4: 12000 });
  });

  it("packs row pixels LSB-first and uses the requested row offset", () => {
    const bits = new Uint8Array(WIDTH * 2);
    bits[0] = 1;
    bits[7] = 1;
    bits[8] = 1;
    bits[383] = 1;
    bits[WIDTH + 7] = 1;
    bits[WIDTH + 8] = 1;

    const first = packRow(bits, 0);
    expect(first).toHaveLength(48);
    expect(first[0]).toBe(0x81);
    expect(first[1]).toBe(0x01);
    expect(first[47]).toBe(0x80);

    const second = packRow(bits, 1);
    expect(second[0]).toBe(0x80);
    expect(second[1]).toBe(0x01);
    expect(second[47]).toBe(0x00);
  });
});
