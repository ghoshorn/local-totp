import './style.css'
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
        <p class="intro-copy">Generate a time-based one-time password directly in your browser.</p>
      </header>

      <form id="totp-form" novalidate>
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
        <p id="secret-help" class="field-help">Spaces and hyphens are ignored. Your secret never leaves this browser.</p>
        <p id="validation-message" class="validation-message" role="alert"></p>
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
        <p>Your secret is used only in this tab to calculate the code. It is not sent to a server, saved, or included in links.</p>
      </aside>
    </section>
  </main>
`

const form = requiredElement<HTMLFormElement>('#totp-form')
const secretInput = requiredElement<HTMLInputElement>('#secret')
const validationMessage = requiredElement<HTMLParagraphElement>('#validation-message')
const codePanel = requiredElement<HTMLElement>('#code-panel')
const codeOutput = requiredElement<HTMLOutputElement>('#code')
const timer = requiredElement<HTMLProgressElement>('#timer')
const countdown = requiredElement<HTMLParagraphElement>('#countdown')
const copyButton = requiredElement<HTMLButtonElement>('#copy')
const copyStatus = requiredElement<HTMLParagraphElement>('#copy-status')

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
  renderCode()
})

copyButton.addEventListener('click', () => {
  void copyCurrentCode()
})

window.setInterval(renderCode, 250)
