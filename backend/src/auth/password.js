import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback); const KEYLEN = 64;
export async function hashPassword(password) { const salt = randomBytes(16).toString('hex'); const derived = await scrypt(password, salt, KEYLEN, { N: 16384, r: 8, p: 1 }); return `scrypt$${salt}$${Buffer.from(derived).toString('hex')}`; }
export async function verifyPassword(password, stored) { const [scheme, salt, hash] = String(stored || '').split('$'); if (scheme !== 'scrypt' || !salt || !hash) return false; const derived = await scrypt(password, salt, KEYLEN, { N: 16384, r: 8, p: 1 }); const expected = Buffer.from(hash, 'hex'); const actual = Buffer.from(derived); return expected.length === actual.length && timingSafeEqual(expected, actual); }
