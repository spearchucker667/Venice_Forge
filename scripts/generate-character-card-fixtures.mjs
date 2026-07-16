import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { Buffer } from "node:buffer";
import process from "node:process";

const output = path.resolve("tests/fixtures/character-cards/png");
await fs.mkdir(output, { recursive: true });

const table = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  table[n] = c >>> 0;
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}
function card(name) {
  return { spec: "chara_card_v2", spec_version: "2.0", data: { name, description: "Synthetic PNG fixture.", personality: "Calm.", scenario: "A test scene.", first_mes: "Hello.", mes_example: "", creator_notes: "", system_prompt: "", post_history_instructions: "", alternate_greetings: [], tags: ["synthetic"], creator: "Venice Forge Tests", character_version: "1.0.0", extensions: {} } };
}
function png(dto, metadataOverride) {
  const signature = Buffer.from("89504e470d0a1a0a", "hex");
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  const pixel = zlib.deflateSync(Buffer.from([0, 60, 120, 180, 255]));
  const metadata = metadataOverride ?? Buffer.from(`chara\0${Buffer.from(JSON.stringify(dto), "utf8").toString("base64")}`, "latin1");
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("tEXt", metadata), chunk("IDAT", pixel), chunk("IEND", Buffer.alloc(0))]);
}

await fs.writeFile(path.join(output, "basic-v2.png"), png(card("Aster Fixture")));
await fs.writeFile(path.join(output, "non-ascii-v2.png"), png(card("星のミラ")));
const malformed = png(card("Broken CRC")); malformed[malformed.length - 1] ^= 0xff;
await fs.writeFile(path.join(output, "malformed-chunk.png"), malformed);
await fs.writeFile(path.join(output, "oversized-metadata.png"), png(card("Oversized"), Buffer.concat([Buffer.from("chara\0", "latin1"), Buffer.alloc(Math.ceil((8 * 1024 * 1024) * 4 / 3) + 8, 65)])));
process.stdout.write(`Generated synthetic character-card PNG fixtures in ${output}\n`);
