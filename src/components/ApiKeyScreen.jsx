import { useState, useEffect } from 'react'
import styles from './ApiKeyScreen.module.css'

/**
 * @param {{ onApiKeySet: (key: string) => void }} props
 */
export default function ApiKeyScreen({ onApiKeySet }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = key.trim()
    if (!trimmed) {
      setError('Please enter your Gem Key.')
      return
    }
    if (!trimmed.startsWith('AI')) {
      setError('This does not look like a Gem Key (should start with "AI").')
      return
    }
    setError('')
    onApiKeySet(trimmed)
  }

  return (
    <div className={styles.screen}>
      <div className={styles.box}>
        <pre className={styles.ascii}>{` __    __              _   __    __           _     _
/ / /\\ \\ \\___  _ __ __| | / / /\\ \\ \\___  _ __| | __| |
\\ \\/  \\/ / _ \\| '__/ _\` | \\ \\/  \\/ / _ \\| '__| |/ _\` |
 \\  /\\  / (_) | | | (_| |  \\  /\\  / (_) | |  | | (_| |
  \\/  \\/ \\___/|_|  \\__,_|   \\/  \\/ \\___/|_|  |_|\\__,_|

A text adventure
By Kaius Reese and Leonard Reese
Version ${__APP_VERSION__}`}</pre>
        <p className={styles.narrative}>
          The Librarian stands before you in a chamber of warm amber light,
          holding a small lacquered box. A keyhole glints at its center.
        </p>
        <p className={styles.narrative}>
          "Word World sleeps," they say softly, "until you open this.
          The Gem Key will wake the Elelem — the life force that breathes
          shape into these empty halls. Without it, the world cannot take form."
        </p>
        <p className={styles.narrative}>
          They extend the box toward you.
        </p>

        <hr className={styles.divider} />

        <p className={styles.instructions}>
          Word World uses a free AI key from Google AI Studio to bring the
          world to life. Get your Gem Key at{' '}
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">
            aistudio.google.com
          </a>
          {' '}→ Get API Key. No credit card required.
          Your key is stored only in your browser and never sent anywhere
          except Google's servers.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputRow}>
            <span className={styles.prompt}>&gt;</span>
            <input
              id="apikey"
              type="password"
              className={styles.keyInput}
              value={key}
              onChange={e => { setKey(e.target.value); setError('') }}
              placeholder="Enter Gem Key (AIza...)"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={!key.trim()}
            >
              Open
            </button>
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </form>

      </div>
    </div>
  )
}
