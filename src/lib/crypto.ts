import { createHash, randomBytes, randomInt } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** Kode pairing 8 karakter tanpa karakter ambigu. */
export function pairingCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

const WEAK = new Set(["1234", "12345", "123456", "2580", "1212", "123123", "4321", "54321", "654321", "1122", "0123", "1010", "2000", "1004", "6969", "112233"]);

/** Mengembalikan pesan error, atau null jika PIN valid. */
export function validatePin(pin: unknown): string | null {
  if (typeof pin !== "string" || !/^\d{4,6}$/.test(pin)) return "PIN harus 4–6 angka.";
  if (/^(\d)\1+$/.test(pin)) return "PIN terlalu mudah ditebak (angka sama semua).";
  const d = [...pin].map(Number);
  if (d.every((x, i) => i === 0 || x === d[i - 1] + 1) || d.every((x, i) => i === 0 || x === d[i - 1] - 1)) {
    return "PIN terlalu mudah ditebak (urutan angka).";
  }
  for (let per = 2; per <= pin.length / 2; per++) {
    if (pin.length % per === 0 && pin === pin.slice(0, per).repeat(pin.length / per)) return "PIN terlalu mudah ditebak (pola berulang).";
  }
  if (WEAK.has(pin)) return "PIN terlalu umum dipakai.";
  return null;
}

/** Argon2id (default @node-rs/argon2) dengan salt unik acak per hash. */
export const hashPin = (pin: string) => hash(pin, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const verifyPin = async (hashed: string, pin: string) => {
  try {
    return await verify(hashed, pin);
  } catch {
    return false;
  }
};
