import { Secret, TOTP } from 'otpauth'

export const TOTP_PERIOD_SECONDS = 30

const BASE32_SECRET = /^[A-Z2-7]+={0,6}$/

export function normalizeSecret(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase()
}

export function createTotp(secret: string): TOTP {
  if (!BASE32_SECRET.test(secret)) {
    throw new Error('A TOTP secret must be Base32 encoded.')
  }

  return new TOTP({
    secret: Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: TOTP_PERIOD_SECONDS,
  })
}
