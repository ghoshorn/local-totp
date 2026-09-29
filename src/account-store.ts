import { createTotp, normalizeSecret } from './totp.ts'

const STORAGE_KEY = 'local-totp.accounts.v1'
const MAX_ACCOUNT_NAME_LENGTH = 100

export interface AccountDetails {
  name: string
  secret: string
}

export interface SavedAccount extends AccountDetails {
  id: string
  createdAt: string
  updatedAt: string
}

type AccountDetailsResult =
  | { details: AccountDetails; error: null }
  | { details: null; error: string }

type AccountListResult =
  | { accounts: SavedAccount[]; error: null }
  | { accounts: SavedAccount[]; error: string }

type StorageResult = { error: null } | { error: string }

function storageError(action: string): StorageResult {
  return {
    error: `Browser storage is unavailable, so saved accounts could not be ${action}.`,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

export function validateAccountDetails(name: string, secret: string): AccountDetailsResult {
  const normalizedName = name.trim()
  const normalizedSecret = normalizeSecret(secret)

  if (!normalizedName) {
    return { details: null, error: 'Enter a name for this account.' }
  }

  if (normalizedName.length > MAX_ACCOUNT_NAME_LENGTH) {
    return {
      details: null,
      error: `Account names must be ${MAX_ACCOUNT_NAME_LENGTH} characters or fewer.`,
    }
  }

  if (!normalizedSecret) {
    return { details: null, error: 'Enter a 2FA secret key.' }
  }

  try {
    createTotp(normalizedSecret)
  } catch {
    return { details: null, error: 'Enter a valid Base32 2FA secret key.' }
  }

  return {
    details: { name: normalizedName, secret: normalizedSecret },
    error: null,
  }
}

function isSavedAccount(value: unknown): value is SavedAccount {
  if (!isRecord(value)) {
    return false
  }

  const { id, name, secret, createdAt, updatedAt } = value
  const details = typeof name === 'string' && typeof secret === 'string'
    ? validateAccountDetails(name, secret)
    : { details: null, error: 'Invalid account details.' }

  return (
    typeof id === 'string' &&
    id.length > 0 &&
    details.error === null &&
    details.details?.name === name &&
    details.details?.secret === secret &&
    isValidTimestamp(createdAt) &&
    isValidTimestamp(updatedAt)
  )
}

function getStorage(storage?: Storage): Storage | null {
  try {
    return storage ?? window.localStorage
  } catch {
    return null
  }
}

export function loadAccounts(storage?: Storage): AccountListResult {
  const target = getStorage(storage)

  if (!target) {
    return { accounts: [], error: storageError('read').error }
  }

  let serializedAccounts: string | null

  try {
    serializedAccounts = target.getItem(STORAGE_KEY)
  } catch {
    return { accounts: [], error: storageError('read').error }
  }

  if (serializedAccounts === null) {
    return { accounts: [], error: null }
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(serializedAccounts)
  } catch {
    return {
      accounts: [],
      error: 'Saved account data is invalid. Clear saved accounts to start again.',
    }
  }

  if (!Array.isArray(parsed) || !parsed.every(isSavedAccount)) {
    return {
      accounts: [],
      error: 'Saved account data is invalid. Clear saved accounts to start again.',
    }
  }

  return { accounts: parsed, error: null }
}

export function saveAccounts(accounts: SavedAccount[], storage?: Storage): StorageResult {
  if (!accounts.every(isSavedAccount)) {
    return { error: 'Refusing to save invalid account data.' }
  }

  const target = getStorage(storage)

  if (!target) {
    return storageError('saved')
  }

  try {
    target.setItem(STORAGE_KEY, JSON.stringify(accounts))
  } catch {
    return storageError('saved')
  }

  return { error: null }
}

export function clearAccounts(storage?: Storage): StorageResult {
  const target = getStorage(storage)

  if (!target) {
    return storageError('cleared')
  }

  try {
    target.removeItem(STORAGE_KEY)
  } catch {
    return storageError('cleared')
  }

  return { error: null }
}

export function createSavedAccount(details: AccountDetails): SavedAccount {
  const now = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    name: details.name,
    secret: details.secret,
    createdAt: now,
    updatedAt: now,
  }
}

export function updateSavedAccount(
  account: SavedAccount,
  details: AccountDetails,
): SavedAccount {
  return {
    ...account,
    ...details,
    updatedAt: new Date().toISOString(),
  }
}
