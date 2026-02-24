import styles from './MobileBlock.module.css'

const WORD_ASCII = `
 __    __              _
/ / /\\ \\ \\___  _ __ __| |
\\ \\/  \\/ / _ \\| '__/ _\` |
 \\  /\\  / (_) | | | (_| |
  \\/  \\/ \\___/|_|  \\__,_|`

const WORLD_ASCII = ` __    __           _     _
/ / /\\ \\ \\___  _ __| | __| |
\\ \\/  \\/ / _ \\| '__| |/ _\` |
 \\  /\\  / (_) | |  | | (_| |
  \\/  \\/ \\___/|_|  |_|\\__,_|
`

export default function MobileBlock() {
  return (
    <div className={styles.screen}>
      <div className={styles.box}>
        <pre className={styles.ascii}>{WORD_ASCII}{'\n'}{WORLD_ASCII}</pre>

        <hr className={styles.divider} />

        <p className={styles.message}>
          Word World is a text adventure written for the keyboard and the monitor the way games were made before smartphones existed.
        </p>
        <p className={styles.message}>
          Please open it on your desktop or laptop computer to play.
        </p>
      </div>
    </div>
  )
}
