import { describe, expect, it } from 'vitest'
import {
  clearAccounts,
  createSavedAccount,
  loadAccounts,
  saveAccounts,
  updateSavedAccount,
  validateAccountDetails,
} from './account-store.ts'

class MemoryStorage implements Storage {
  #values = new Map<string, string>()

  get length(): number {
    return this.#values.size
  }

  clear(): void {
    this.#values.clear()
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.#values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value)
  }
}

describe('local account storage', () => {
  it('saves, loads, updates, and clears validated accounts', () => {
    const storage = new MemoryStorage()
    const details = validateAccountDetails('Example account', 'jbsw-y3dp ehpk3pxp')

    expect(details.error).toBeNull()
    expect(details.details).not.toBeNull()

    const account = createSavedAccount(details.details!)
    expect(saveAccounts([account], storage).error).toBeNull()
    expect(loadAccounts(storage)).toMatchObject({
      accounts: [{ name: 'Example account', secret: 'JBSWY3DPEHPK3PXP' }],
      error: null,
    })

    const updated = updateSavedAccount(account, {
      name: 'Renamed account',
      secret: account.secret,
    })
    expect(saveAccounts([updated], storage).error).toBeNull()
    expect(loadAccounts(storage).accounts[0]?.name).toBe('Renamed account')

    expect(clearAccounts(storage).error).toBeNull()
    expect(loadAccounts(storage)).toEqual({ accounts: [], error: null })
  })

  it('rejects invalid account details', () => {
    expect(validateAccountDetails('', 'JBSWY3DPEHPK3PXP').error).toBe(
      'Enter a name for this account.',
    )
    expect(validateAccountDetails('Example', 'invalid secret!').error).toBe(
      'Enter a valid Base32 2FA secret key.',
    )
  })

  it('reports invalid stored data without silently replacing it', () => {
    const storage = new MemoryStorage()
    storage.setItem('local-totp.accounts.v1', '{not-json')

    expect(loadAccounts(storage)).toEqual({
      accounts: [],
      error: 'Saved account data is invalid. Clear saved accounts to start again.',
    })
  })
})
