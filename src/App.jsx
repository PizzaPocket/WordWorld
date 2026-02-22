import { useState, useEffect } from 'react'
import ApiKeyScreen from './components/ApiKeyScreen.jsx'
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

  if (!apiKey) {
    return <ApiKeyScreen onApiKeySet={handleApiKeySet} />
  }

  return <Game />
}
