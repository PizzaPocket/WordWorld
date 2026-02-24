import { useState, useEffect } from 'react'
import ApiKeyScreen from './components/ApiKeyScreen.jsx'
import MobileBlock from './components/MobileBlock.jsx'
import Terminal from './components/Terminal.jsx'
import { useGameEngine } from './hooks/useGameEngine.js'
import { saveApiKey, loadApiKey } from './persistence/storage.js'
import { initClient } from './llm/geminiClient.js'

function Game() {
  const { gameState, handleCommand, saves, handleLoad, handleDelete, onMessageAnimated } = useGameEngine()

  return (
    <Terminal
      messages={gameState.history}
      isLoading={gameState.llmStatus === 'loading'}
      onCommand={handleCommand}
      saves={saves}
      onLoad={handleLoad}
      onDelete={handleDelete}
      onMessageAnimated={onMessageAnimated}
    />
  )
}

export default function App() {
  const [apiKey, setApiKey] = useState(() => loadApiKey())
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = e => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (apiKey) {
      initClient(apiKey)
    }
  }, [apiKey])

  function handleApiKeySet(key) {
    saveApiKey(key)
    initClient(key)
    setApiKey(key)
  }

  if (isMobile) {
    return <MobileBlock />
  }

  if (!apiKey) {
    return <ApiKeyScreen onApiKeySet={handleApiKeySet} />
  }

  return <Game />
}
