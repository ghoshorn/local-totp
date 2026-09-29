import './style.css'
import {
  clearAccounts,
  createSavedAccount,
  loadAccounts,
  saveAccounts,
  type SavedAccount,
  updateSavedAccount,
  validateAccountDetails,
} from './account-store.ts'
import { createTotp, normalizeSecret, TOTP_PERIOD_SECONDS } from './totp.ts'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('Application root was not found.')
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)

  if (!element) {
    throw new Error(`Required element "${selector}" was not found.`)
  }

  return element
}

app.innerHTML = `
  <main class="page-shell">
    <section class="generator" aria-labelledby="page-title">
      <header class="intro">
        <p class="eyebrow">Local TOTP</p>
        <h1 id="page-title">Two-factor code generator</h1>
        <p class="intro-copy">Generate time-based one-time passwords directly in your browser.</p>
      </header>

      <section class="saved-accounts" aria-labelledby="saved-accounts-heading">
        <div class="section-heading">
          <div>
            <h2 id="saved-accounts-heading">Saved accounts</h2>
            <p>Select an account stored in this browser.</p>
          </div>
          <button id="clear-all" class="text-button" type="button">Clear all</button>
        </div>
        <label class="sr-only" for="account-select">Saved account</label>
        <select id="account-select">
          <option value="">Select a saved account</option>
        </select>
        <p id="storage-message" class="storage-message" role="alert"></p>
      </section>

      <form id="totp-form" novalidate>
        <label for="account-name">Account name</label>
        <input
          id="account-name"
          name="account-name"
          type="text"
          maxlength="100"
          autocomplete="off"
          placeholder="For example, GitHub"
        >

        <label for="secret">2FA secret key</label>
        <div class="input-row">
          <input
            id="secret"
            name="secret"
            type="text"
            inputmode="text"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            placeholder="Paste your Base32 secret"
            aria-describedby="secret-help validation-message"
          >
          <button id="generate" type="submit">Generate</button>
        </div>
        <p id="secret-help" class="field-help">Spaces and hyphens are ignored. TOTP codes are calculated in this browser.</p>
        <p id="validation-message" class="validation-message" role="alert"></p>

        <div class="account-actions" aria-label="Saved account actions">
          <button id="save-new" type="button" class="secondary-button">Save as new</button>
          <button id="update-account" type="button" class="secondary-button" disabled>Update saved</button>
          <button id="delete-account" type="button" class="danger-button" disabled>Delete</button>
        </div>
        <p id="account-status" class="account-status" role="status" aria-live="polite"></p>
      </form>

      <section id="code-panel" class="code-panel" hidden aria-labelledby="code-label">
        <p id="code-label" class="code-label">Current verification code</p>
        <output id="code" class="code" aria-label="Current verification code" tabindex="-1"></output>
        <div class="timer-row">
          <progress id="timer" max="${TOTP_PERIOD_SECONDS}" value="${TOTP_PERIOD_SECONDS}"></progress>
          <p id="countdown" class="countdown"></p>
        </div>
        <button id="copy" class="copy-button" type="button" disabled>Copy code</button>
        <p id="copy-status" class="copy-status" role="status" aria-live="polite"></p>
      </section>

      <aside class="privacy-note" aria-label="Privacy notice">
        <h2>Private by design</h2>
        <p>Saved names and secrets stay in this browser's local storage. They are not uploaded or included in links. Anyone with access to this browser profile can use saved accounts.</p>
      </aside>
    </section>
  </main>
`

const form = requiredElement<HTMLFormElement>('#totp-form')
const accountSelect = requiredElement<HTMLSelectElement>('#account-select')
const accountNameInput = requiredElement<HTMLInputElement>('#account-name')
const secretInput = requiredElement<HTMLInputElement>('#secret')
const validationMessage = requiredElement<HTMLParagraphElement>('#validation-message')
const accountStatus = requiredElement<HTMLParagraphElement>('#account-status')
const storageMessage = requiredElement<HTMLParagraphElement>('#storage-message')
const saveNewButton = requiredElement<HTMLButtonElement>('#save-new')
const updateAccountButton = requiredElement<HTMLButtonElement>('#update-account')
const deleteAccountButton = requiredElement<HTMLButtonElement>('#delete-account')
const clearAllButton = requiredElement<HTMLButtonElement>('#clear-all')
const codePanel = requiredElement<HTMLElement>('#code-panel')
const codeOutput = requiredElement<HTMLOutputElement>('#code')
const timer = requiredElement<HTMLProgressElement>('#timer')
const countdown = requiredElement<HTMLParagraphElement>('#countdown')
const copyButton = requiredElement<HTMLButtonElement>('#copy')
const copyStatus = requiredElement<HTMLParagraphElement>('#copy-status')

let accounts: SavedAccount[] = []
let storageReady = true
let activeSecret = ''
let currentCode = ''
let totp = null as ReturnType<typeof createTotp> | null

function clearCode(): void {
  activeSecret = ''
  totp = null
  currentCode = ''
  codePanel.hidden = true
  copyButton.disabled = true
}

function selectedAccount(): SavedAccount | undefined {
  return accounts.find((account) => account.id === accountSelect.value)
}

function updateAccountActionState(): void {
  const hasSelectedAccount = selectedAccount() !== undefined
  saveNewButton.disabled = !storageReady
  updateAccountButton.disabled = !storageReady || !hasSelectedAccount
  deleteAccountButton.disabled = !storageReady || !hasSelectedAccount
}

function renderAccountOptions(selectedId = accountSelect.value): void {
  const placeholder = new Option('Select a saved account', '')
  accountSelect.replaceChildren(placeholder)

  for (const account of accounts) {
    accountSelect.append(new Option(account.name, account.id))
  }

  accountSelect.value = accounts.some((account) => account.id === selectedId)
    ? selectedId
    : ''
  updateAccountActionState()
}

function showStorageFailure(message: string): void {
  storageReady = false
  storageMessage.textContent = message
  updateAccountActionState()
}

function persistAccounts(
  nextAccounts: SavedAccount[],
  selectedId: string,
  successMessage: string,
): boolean {
  const result = saveAccounts(nextAccounts)

  if (result.error) {
    showStorageFailure(result.error)
    return false
  }

  accounts = nextAccounts
  storageReady = true
  storageMessage.textContent = ''
  renderAccountOptions(selectedId)
  accountStatus.textContent = successMessage
  return true
}

function renderCode(): boolean {
  const secret = normalizeSecret(secretInput.value)

  if (!secret) {
    validationMessage.textContent = ''
    clearCode()
    return false
  }

  try {
    if (secret !== activeSecret || !totp) {
      totp = createTotp(secret)
      activeSecret = secret
    }
  } catch {
    validationMessage.textContent = 'Enter a valid Base32 2FA secret key.'
    clearCode()
    return false
  }

  const now = Date.now()
  currentCode = totp.generate({ timestamp: now })
  const secondsRemaining = Math.ceil(totp.remaining({ timestamp: now }) / 1_000)

  validationMessage.textContent = ''
  codeOutput.value = currentCode
  timer.value = secondsRemaining
  timer.setAttribute('aria-valuetext', `${secondsRemaining} seconds remaining`)
  countdown.textContent = `${secondsRemaining} second${secondsRemaining === 1 ? '' : 's'} remaining`
  codePanel.hidden = false
  copyButton.disabled = false
  return true
}

function currentAccountDetails(): { name: string; secret: string } | null {
  const result = validateAccountDetails(accountNameInput.value, secretInput.value)

  if (result.error) {
    accountStatus.textContent = result.error
    return null
  }

  return result.details
}

function hasDuplicateName(name: string, exceptAccountId?: string): boolean {
  return accounts.some(
    (account) =>
      account.id !== exceptAccountId && account.name.localeCompare(name, undefined, {
        sensitivity: 'accent',
      }) === 0,
  )
}

async function copyCurrentCode(): Promise<void> {
  if (!currentCode) {
    return
  }

  try {
    await navigator.clipboard.writeText(currentCode)
    copyStatus.textContent = 'Code copied.'
  } catch {
    copyStatus.textContent = 'Could not copy the code. Select it and copy manually.'
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault()

  if (renderCode()) {
    codeOutput.focus()
  }
})

secretInput.addEventListener('input', () => {
  copyStatus.textContent = ''
  accountStatus.textContent = ''
  renderCode()
})

accountNameInput.addEventListener('input', () => {
  accountStatus.textContent = ''
})

accountSelect.addEventListener('change', () => {
  const account = selectedAccount()
  accountStatus.textContent = ''
  copyStatus.textContent = ''

  if (!account) {
    accountNameInput.value = ''
    secretInput.value = ''
    clearCode()
    updateAccountActionState()
    return
  }

  accountNameInput.value = account.name
  secretInput.value = account.secret
  renderCode()
  updateAccountActionState()
})

saveNewButton.addEventListener('click', () => {
  const details = currentAccountDetails()

  if (!details) {
    return
  }

  if (hasDuplicateName(details.name)) {
    accountStatus.textContent = 'Choose a unique account name.'
    return
  }

  const account = createSavedAccount(details)
  secretInput.value = details.secret
  persistAccounts([...accounts, account], account.id, 'Account saved in this browser.')
})

updateAccountButton.addEventListener('click', () => {
  const account = selectedAccount()
  const details = currentAccountDetails()

  if (!account || !details) {
    return
  }

  if (hasDuplicateName(details.name, account.id)) {
    accountStatus.textContent = 'Choose a unique account name.'
    return
  }

  const updatedAccount = updateSavedAccount(account, details)
  secretInput.value = details.secret
  persistAccounts(
    accounts.map((savedAccount) =>
      savedAccount.id === updatedAccount.id ? updatedAccount : savedAccount,
    ),
    updatedAccount.id,
    'Saved account updated.',
  )
})

deleteAccountButton.addEventListener('click', () => {
  const account = selectedAccount()

  if (!account) {
    return
  }

  if (!window.confirm(`Delete "${account.name}" from this browser?`)) {
    return
  }

  if (persistAccounts(
    accounts.filter((savedAccount) => savedAccount.id !== account.id),
    '',
    'Saved account deleted.',
  )) {
    accountNameInput.value = ''
    secretInput.value = ''
    clearCode()
  }
})

clearAllButton.addEventListener('click', () => {
  if (!window.confirm('Delete all saved accounts from this browser?')) {
    return
  }

  const result = clearAccounts()

  if (result.error) {
    showStorageFailure(result.error)
    return
  }

  accounts = []
  storageReady = true
  storageMessage.textContent = ''
  accountNameInput.value = ''
  secretInput.value = ''
  accountStatus.textContent = 'All saved accounts were deleted.'
  copyStatus.textContent = ''
  clearCode()
  renderAccountOptions()
})

copyButton.addEventListener('click', () => {
  void copyCurrentCode()
})

const initialAccounts = loadAccounts()
accounts = initialAccounts.accounts

if (initialAccounts.error) {
  showStorageFailure(initialAccounts.error)
}

renderAccountOptions()
window.setInterval(renderCode, 250)
