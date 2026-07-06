import { describe, it, expect } from 'vitest'
import { isLoginView, shouldRestoreSession } from './authGate'

// Bug: al restaurar una sesión válida (token en sessionStorage) en una ruta de
// login, App renderiza el <Login/> viejo durante el fetch de verifySession y
// recién después muestra el dashboard → "flash del login viejo". shouldRestoreSession
// decide mostrar el splash de restauración (no el form) mientras se verifica.

describe('authGate — evitar el flash del login viejo al restaurar sesión', () => {
  it('isLoginView reconoce las 3 pantallas de login', () => {
    expect(isLoginView('admin-login')).toBe(true)
    expect(isLoginView('client-login')).toBe(true)
    expect(isLoginView('partner-login')).toBe(true)
  })

  it('isLoginView es false para vistas no-login', () => {
    for (const v of ['public', 'admin-dashboard', 'client-portal', 'depot-dashboard', 'transport-dashboard', 'terms', 'privacy', 'not-found']) {
      expect(isLoginView(v)).toBe(false)
    }
  })

  it('restaura (splash, NO form) cuando hay token en una ruta de login', () => {
    expect(shouldRestoreSession('admin-login', true)).toBe(true)
    expect(shouldRestoreSession('client-login', true)).toBe(true)
    expect(shouldRestoreSession('partner-login', true)).toBe(true)
  })

  it('NO restaura sin token: el visitante directo ve el form al instante', () => {
    expect(shouldRestoreSession('admin-login', false)).toBe(false)
    expect(shouldRestoreSession('client-login', false)).toBe(false)
    expect(shouldRestoreSession('partner-login', false)).toBe(false)
  })

  it('NO restaura en vistas públicas/dashboard aunque exista token', () => {
    expect(shouldRestoreSession('public', true)).toBe(false)
    expect(shouldRestoreSession('admin-dashboard', true)).toBe(false)
    expect(shouldRestoreSession('not-found', true)).toBe(false)
  })
})
