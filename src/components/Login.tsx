import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { InstallAppButton, PwaInstallPrompt, PwaUpdatePrompt } from './PwaManager'

export function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await signIn(email, password)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <PwaUpdatePrompt />
      <PwaInstallPrompt />
      <section className="login-panel">
        <div className="brand login-brand">
          <img src="/logo2.jpeg" alt="Logo" style={{ height: '36px', borderRadius: '6px' }} />
          <span>Chicken Kade <small>POS</small></span>
        </div>
        <div className="login-copy">
          <small>SECURE POS ACCESS</small>
          <h1>Welcome back</h1>
          <p>Sign in to continue to your workspace.</p>
        </div>
        <form onSubmit={submit}>
          <label>
            EMAIL
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            PASSWORD
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="validation">{error}</p>}
          <button className="primary login-submit" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div style={{ marginTop: '16px' }}>
          <InstallAppButton />
        </div>
      </section>
    </main>
  )
}