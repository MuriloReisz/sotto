import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Atkinson Hyperlegible Next: designed for legibility, which is what an overlay floating
// over any background needs. Bundled locally (no web font requests).
import '@fontsource/atkinson-hyperlegible-next/latin-400.css'
import '@fontsource/atkinson-hyperlegible-next/latin-500.css'
import '@fontsource/atkinson-hyperlegible-next/latin-700.css'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
