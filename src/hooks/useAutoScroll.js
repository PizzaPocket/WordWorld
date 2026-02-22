import { useEffect } from 'react'

/**
 * Scrolls the referenced element to the bottom whenever `deps` changes.
 * @param {React.RefObject<HTMLElement>} ref
 * @param {any[]} deps
 */
export function useAutoScroll(ref, deps) {
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
