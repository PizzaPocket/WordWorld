import { useRef, useEffect } from 'react'
import styles from './InputLine.module.css'

/**
 * @param {{ onSubmit: (text: string) => void, disabled: boolean }} props
 */
export default function InputLine({ onSubmit, disabled }) {
  const inputRef = useRef(null)

  // Keep focus on the input whenever it's not disabled
  useEffect(() => {
    if (!disabled) {
      inputRef.current?.focus()
    }
  }, [disabled])

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      const value = e.target.value.trim()
      if (value) {
        onSubmit(value)
        e.target.value = ''
      }
    }
  }

  // Clicking anywhere in the terminal refocuses the input
  function handleTerminalClick() {
    inputRef.current?.focus()
  }

  return (
    <div className={styles.inputLine} onClick={handleTerminalClick}>
      <span className={styles.prompt}>&gt;</span>
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={disabled ? 'waiting...' : ''}
        aria-label="Command input"
      />
    </div>
  )
}
