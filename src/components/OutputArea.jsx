import { useRef, useState, useEffect } from 'react'
import { useAutoScroll } from '../hooks/useAutoScroll.js'
import styles from './OutputArea.module.css'

const TYPING_SPEED_MS = 6 // ms per character for animated messages

/**
 * Renders a single message, optionally with a typewriter animation.
 * @param {{ message: import('../game/models.js').OutputMessage, animate: boolean, onDone: () => void, scrollRef: React.RefObject<HTMLElement> }} props
 */
function Message({ message, animate, onDone, scrollRef }) {
  const [displayed, setDisplayed] = useState(animate ? '' : message.text)
  const indexRef = useRef(animate ? 0 : message.text.length)

  useEffect(() => {
    if (!animate) return
    if (indexRef.current >= message.text.length) {
      onDone?.()
      return
    }
    const id = setTimeout(() => {
      indexRef.current += 1
      setDisplayed(message.text.slice(0, indexRef.current))
      if (scrollRef?.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
      if (indexRef.current >= message.text.length) {
        onDone?.()
      }
    }, TYPING_SPEED_MS)
    return () => clearTimeout(id)
  })

  const isAnimating = animate && displayed.length < message.text.length

  return (
    <div className={`${styles.message} ${styles[message.type] ?? ''}`}>
      {displayed}
      {isAnimating && <span className={styles.cursor} aria-hidden="true" />}
    </div>
  )
}

/**
 * @param {{ messages: import('../game/models.js').OutputMessage[], isLoading: boolean, onMessageAnimated: (id: string) => void }} props
 */
export default function OutputArea({ messages, isLoading, onMessageAnimated }) {
  const containerRef = useRef(null)
  const [animatedIds, setAnimatedIds] = useState(new Set())

  useAutoScroll(containerRef, [messages.length, animatedIds.size])

  const ANIMATED_TYPES = new Set(['narrative', 'llm'])

  function shouldAnimate(msg) {
    return ANIMATED_TYPES.has(msg.type) && !animatedIds.has(msg.id)
  }

  function handleDone(id) {
    setAnimatedIds(prev => new Set([...prev, id]))
    onMessageAnimated?.(id)
  }

  return (
    <div className={styles.output} ref={containerRef}>
      {messages.map((msg, i) => (
        <Message
          key={msg.id}
          message={msg}
          animate={i === messages.length - 1 && shouldAnimate(msg)}
          onDone={() => handleDone(msg.id)}
          scrollRef={containerRef}
        />
      ))}
      {isLoading && (
        <div className={`${styles.message} ${styles.loading}`}>
          ...
        </div>
      )}
    </div>
  )
}
