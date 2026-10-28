import type { State } from './types'

export type MutationResult = { state: State; message: string }
let csrf: { token: string; headerName: string } | null = null
export class ApiError extends Error { constructor(message: string, public status: number) { super(message) } }
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET') {
    if (!csrf) await refreshCsrf()
    if (csrf) headers[csrf.headerName] = csrf.token
  }
  let response: Response
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 15000)
  try { response = await fetch(`/api${path}`, { method, headers, credentials: 'same-origin', signal: controller.signal, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }) }
  catch { throw new ApiError(controller.signal.aborted ? 'El servidor tardó demasiado en responder. Actualice los datos antes de volver a intentar la operación.' : 'No se pudo conectar con el servidor. Compruebe la conexión e intente nuevamente.', 0) }
  finally { window.clearTimeout(timer) }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) csrf = null
    let message = `Error del servidor (${response.status}).`
    try { const data = await response.json(); message = data.message || message } catch { /* retain status */ }
    throw new ApiError(message, response.status)
  }
  if (response.status === 204 || response.headers.get('content-length') === '0') return undefined as T
  const text = await response.text()
  try { return text ? JSON.parse(text) as T : undefined as T }
  catch { throw new ApiError('El servidor devolvió una respuesta inválida. Actualice los datos e intente nuevamente.', response.status) }
}
export async function refreshCsrf() { csrf = await request<{ token: string; headerName: string }>('/auth/csrf') }
export async function login(username: string, password: string) { await request('/auth/login', 'POST', { username, password }); csrf = null; await refreshCsrf() }
export async function logout() { await request('/auth/logout', 'POST'); csrf = null; await refreshCsrf() }
export const getState = () => request<State>('/state')
export const mutate = (path: string, method: string, body: unknown) => request<MutationResult>(path, method, body)
