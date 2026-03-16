/**
 * Password hashing utilities using Argon2.
 */

import { hash, verify } from "@node-rs/argon2";

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return verify(hashed, plain);
}
