import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * `promisify(scrypt)` resolves to the no-options overload, so the options
 * argument is wrapped explicitly rather than fought with a cast.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derived) =>
      error ? reject(error) : resolve(derived),
    );
  });
}

// OWASP-recommended scrypt parameters. N=2^17 with r=8 is ~128MB per hash,
// which is deliberate — it is what makes offline cracking expensive.
const N = 1 << 17;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Node's built-in scrypt, chosen over argon2 so there is no native module to
 * compile at install time. Format: `scrypt$N$r$p$salt$hash`, both hex encoded.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = (await scryptAsync(password, salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: 256 * 1024 * 1024,
  })) as Buffer;

  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4] ?? "", "hex");
  const expected = Buffer.from(parts[5] ?? "", "hex");

  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = (await scryptAsync(password, salt, expected.length, {
    N: n,
    r,
    p,
    maxmem: 256 * 1024 * 1024,
  })) as Buffer;

  // Constant-time — a length check first, since timingSafeEqual throws on mismatch.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
