import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { PlayerOverlay } from './features/player/PlayerOverlay'
import './styles/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

// The player overlay is a separate transparent window layered over mpv's video.
const isPlayerOverlay = window.location.hash === '#/player'
if (isPlayerOverlay) document.documentElement.dataset['surface'] = 'overlay'

createRoot(root).render(<StrictMode>{isPlayerOverlay ? <PlayerOverlay /> : <App />}</StrictMode>)
