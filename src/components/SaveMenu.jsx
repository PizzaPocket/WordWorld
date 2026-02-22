import styles from './SaveMenu.module.css'

/**
 * @param {{
 *   saves: import('../persistence/storage.js').SaveMeta[],
 *   onLoad: (name: string) => void,
 *   onDelete: (name: string) => void,
 *   onClose: () => void
 * }} props
 */
export default function SaveMenu({ saves, onLoad, onDelete, onClose }) {
  function formatDate(ts) {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  function handleDelete(name) {
    if (window.confirm(`Delete save "${name}"?`)) {
      onDelete(name)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Saves</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {saves.length === 0 ? (
          <p className={styles.empty}>No saves yet. Type "save &lt;name&gt;" to save.</p>
        ) : (
          saves.map(s => (
            <div key={s.name} className={styles.saveItem}>
              <div className={styles.saveMeta}>
                <span className={styles.saveName}>{s.name}</span>
                <span className={styles.saveDate}>{formatDate(s.savedAt)}</span>
              </div>
              <div className={styles.actions}>
                <button className={styles.loadBtn} onClick={() => { onLoad(s.name); onClose() }}>
                  Load
                </button>
                <button className={styles.deleteBtn} onClick={() => handleDelete(s.name)}>
                  Del
                </button>
              </div>
            </div>
          ))
        )}

        <div className={styles.footer}>
          <p className={styles.hint}>
            Commands: save &lt;name&gt; · load &lt;name&gt; · saves
          </p>
        </div>
      </div>
    </div>
  )
}
