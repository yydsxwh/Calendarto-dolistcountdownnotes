import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { COLOR_TOKENS } from '@yydsxwh/shared/design/tokens'
import App from './App.tsx'
import { applyNativeChrome } from './lib/native'
import './index.css'

void COLOR_TOKENS.brand

void applyNativeChrome()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
