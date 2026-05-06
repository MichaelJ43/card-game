import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './bootstrap'
import './index.css'
import App from './App.tsx'

const googleClient =
  typeof import.meta.env.VITE_GOOGLE_OAUTH_WEB_CLIENT_ID === 'string' &&
  import.meta.env.VITE_GOOGLE_OAUTH_WEB_CLIENT_ID.trim().length > 0
    ? import.meta.env.VITE_GOOGLE_OAUTH_WEB_CLIENT_ID.trim()
    : null

const tree = googleClient ? (
  <GoogleOAuthProvider clientId={googleClient}>
    <App />
  </GoogleOAuthProvider>
) : (
  <App />
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {tree}
  </StrictMode>,
)
