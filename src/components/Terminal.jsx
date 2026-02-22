import { useState } from 'react'
import OutputArea from './OutputArea.jsx'
import InputLine from './InputLine.jsx'
import SaveMenu from './SaveMenu.jsx'
import styles from './Terminal.module.css'

/**
 * @param {{
 *   messages: import('../game/models.js').OutputMessage[],
 *   isLoading: boolean,
 *   onCommand: (text: string) => void,
 *   saves: import('../persistence/storage.js').SaveMeta[],
 *   onLoad: (name: string) => void,
 *   onDelete: (name: string) => void,
 *   onMessageAnimated: (id: string) => void,
 * }} props
 */
export default function Terminal({ messages, isLoading, onCommand, saves, onLoad, onDelete, onMessageAnimated }) {
  const [showSaveMenu, setShowSaveMenu] = useState(false)

  return (
    <div className={styles.terminal}>
      <button
        className={styles.menuButton}
        onClick={() => setShowSaveMenu(true)}
        aria-label="Open save menu"
      >
        saves
      </button>

      <OutputArea messages={messages} isLoading={isLoading} onMessageAnimated={onMessageAnimated} />
      <InputLine onSubmit={onCommand} disabled={isLoading} />

      {showSaveMenu && (
        <SaveMenu
          saves={saves}
          onLoad={onLoad}
          onDelete={onDelete}
          onClose={() => setShowSaveMenu(false)}
        />
      )}
    </div>
  )
}
