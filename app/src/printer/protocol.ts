// Cat printer family: service AE30, write AE01, notify AE02.
export const WIDTH = 384;

export const uuid = (s: string): string => `0000${s}-0000-1000-8000-00805f9b34fb`;
export const SERVICE_ADV = uuid("af30");
export const SERVICE = uuid("ae30");
export const TX = uuid("ae01");
export const RX = uuid("ae02");

const CRC_TABLE = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 0x80) ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
    t[i] = c;
  }
  return t;
})();

export const crc8 = (data: Iterable<number>): number => {
  let c = 0;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff];
  return c;
};

// Packet: 51 78 CMD 00 LEN_LO LEN_HI DATA... CRC8(DATA) FF
export function packet(cmd: number, input: ArrayLike<number>): Uint8Array<ArrayBuffer> {
  const data = Uint8Array.from(input);
  const p = new Uint8Array(8 + data.length);
  p.set([0x51, 0x78, cmd, 0x00, data.length & 0xff, data.length >> 8]);
  p.set(data, 6);
  p[6 + data.length] = crc8(data);
  p[7 + data.length] = 0xff;
  return p;
}

export const CMD = {
  getState: () => packet(0xa3, [0x00]),
  quality200: () => packet(0xa4, [0x32]),
  energy: (v: number) => packet(0xaf, [v & 0xff, (v >> 8) & 0xff]),
  applyEnergy: () => packet(0xbe, [0x01]),
  update: () => packet(0xa9, [0x00]),
  latticeStart: () => packet(0xa6, [0xaa, 0x55, 0x17, 0x38, 0x44, 0x5f, 0x5f, 0x5f, 0x44, 0x38, 0x2c]),
  latticeEnd: () => packet(0xa6, [0xaa, 0x55, 0x17, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x17]),
  row: (bits: ArrayLike<number>) => packet(0xa2, bits),
  feed: (n: number) => packet(0xa1, [n & 0xff, (n >> 8) & 0xff]),
  speed: (v: number) => packet(0xbd, [v & 0xff]),
};

// Darkness 1–4. The printer slows its motor by itself for higher values.
export const ENERGY: Record<1 | 2 | 3 | 4, number> = { 1: 4000, 2: 6500, 3: 9000, 4: 12000 };
export const MOTOR_SPEED = 4;

// Pack one row of 384 pixels into 48 bytes. These printers read bits LSB-first.
export function packRow(bits: Uint8Array, y: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(WIDTH / 8);
  const off = y * WIDTH;
  for (let x = 0; x < WIDTH; x++) if (bits[off + x]) out[x >> 3] |= 1 << (x & 7);
  return out;
}
