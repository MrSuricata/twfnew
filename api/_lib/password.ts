import bcrypt from 'bcryptjs'

const COST = 12

/** Hash a plaintext password with bcrypt (cost 12). */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST)
}

/** Verify a plaintext password against a bcrypt hash. Returns false for empty hashes. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash || !plain) return false
  try {
    return await bcrypt.compare(plain, hash)
  } catch {
    return false
  }
}
