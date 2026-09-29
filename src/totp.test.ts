import { describe, expect, it } from 'vitest'
import { createTotp, normalizeSecret } from './totp.ts'

describe('normalizeSecret', () => {
  it('removes separators and normalizes case', () => {
    expect(normalizeSecret(' jbsw-y3dp ehpk3pxp ')).toBe('JBSWY3DPEHPK3PXP')
  })
})

describe('createTotp', () => {
  it('generates the RFC 6238 SHA-1 test token with six digits', () => {
    const totp = createTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')

    expect(totp.generate({ timestamp: 59_000 })).toBe('287082')
  })

  it('rejects non-Base32 secrets', () => {
    expect(() => createTotp('not-a-valid-secret!')).toThrow('Base32')
  })
})
