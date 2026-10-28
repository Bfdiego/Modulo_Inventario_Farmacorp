import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Product, State } from './types'
import type { MutationResult } from './api'

type Props = { state: State; mutation: (path: string, method: string, body: unknown) => Promise<MutationResult | undefined>; notify: (text: string) => void; busy: boolean }
type Draft = { name: string; sku: string; unit: string; category: string; price: string; threshold: string; replenishment: string; lotTracked: boolean }
const emptyDraft = (): Draft => ({ name: '', sku: '', unit: '', category: '', price: '0', threshold: '0', replenishment: '0', lotTracked: true })

export default function MasterData({ state, mutation, notify, busy }: Props) {
  const [productId, setProductId] = useState('')
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [error, setError] = useState('')
  const allowed = () => {
    if (state.role === 'Administrador') return true
    notify('Acceso restringido: solo Administrador puede modificar datos maestros.')
    return false
  }
  const selectProduct = (id: string) => {
    setProductId(id)
    setError('')
    const product = state.products.find(p => p.id === id)
    setDraft(product ? { ...product, price: String(product.price), threshold: String(product.threshold), replenishment: String(product.replenishment) } : emptyDraft())
  }
  const productHasHistory = (id: string) => state.lots.some(l => l.productId === id) || state.movements.some(m => m.productId === id) || state.transfers.some(t => t.productId === id) || state.counts.some(c => c.productId === id) || state.sales.some(s => s.productId === id)
  const locationHasHistory = (location: string) => state.lots.some(l => l.location === location) || state.movements.some(m => m.location === location) || state.transfers.some(t => t.origin === location || t.destination === location) || state.counts.some(c => c.location === location) || state.sales.some(s => s.location === location)
  const reject = (message: string) => { setError(message); notify(message) }
  const saveProduct = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!allowed()) return
    const name = draft.name.trim(), sku = draft.sku.trim(), unit = draft.unit.trim(), category = draft.category.trim()
    if (!name || !sku || !unit || !category) return reject('Complete nombre, SKU, unidad y categoría.')
    if (state.products.some(p => p.id !== productId && p.sku.toLocaleLowerCase() === sku.toLocaleLowerCase())) return reject('Ese SKU ya pertenece a otro producto. Ingrese un SKU único.')
    const values = [draft.price, draft.threshold, draft.replenishment]
    if (values.some(value => value.trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0)) return reject('Precio, punto de reorden y reposición deben ser números finitos iguales o mayores a cero.')
    const existing = state.products.find(p => p.id === productId)
    if (productId && !existing) return reject('El producto ya no existe. Seleccione otro o cree uno nuevo.')
    if (existing && existing.lotTracked !== draft.lotTracked && productHasHistory(existing.id)) return reject('No se puede cambiar la trazabilidad de un producto con lotes u operaciones registradas. Cree un producto con otro SKU.')
    const product: Product = { id: existing?.id ?? '', name, sku, unit, category, lotTracked: draft.lotTracked, price: Number(draft.price), threshold: Number(draft.threshold), replenishment: Number(draft.replenishment) }
    setError('')
    void mutation(existing ? `/products/${encodeURIComponent(existing.id)}` : '/products', existing ? 'PUT' : 'POST', product).then(result => {
      if (result && !existing) { setProductId(''); setDraft(emptyDraft()) }
    })
  }
  const addLocation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!allowed()) return
    const form = event.currentTarget
    const name = String(new FormData(form).get('location') ?? '').trim()
    if (!name) return notify('Ingrese un nombre para la ubicación.')
    if (state.locations.some(l => l.toLocaleLowerCase() === name.toLocaleLowerCase())) return notify('Ya existe una ubicación con ese nombre.')
    void mutation('/locations', 'POST', {name})
  }
  const renameLocation = (event: FormEvent<HTMLFormElement>, location: string) => {
    event.preventDefault()
    if (!allowed()) return
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
    if (name === location) return notify('El nombre de la ubicación no cambió.')
    if (locationHasHistory(location)) return notify('Esta ubicación tiene lotes o historial. Se conserva su nombre para mantener la trazabilidad; puede crear otra ubicación.')
    if (!name) return notify('El nombre de la ubicación es obligatorio.')
    if (state.locations.some(l => l !== location && l.toLocaleLowerCase() === name.toLocaleLowerCase())) return notify('Ya existe una ubicación con ese nombre.')
    void mutation('/locations', 'PUT', {name: location, newName: name})
  }
  const deleteLocation = (location: string) => {
    if (!allowed()) return
    if (locationHasHistory(location)) return notify('No se puede eliminar una ubicación con lotes, movimientos, conteos o transferencias. Su historial debe conservarse.')
    if (state.locations.length <= 1) return notify('Debe conservar al menos una ubicación para operar el inventario.')
    if (!window.confirm(`¿Eliminar la ubicación sin historial «${location}»?`)) return
    void mutation('/locations', 'DELETE', {name: location})
  }
  const saveLot = (event: FormEvent<HTMLFormElement>, productId: string, location: string, id: string) => {
    event.preventDefault()
    if (!allowed()) return
    const matchesLot = (l: State['lots'][number]) => l.productId === productId && l.location === location && l.id === id
    const lot = state.lots.find(matchesLot)
    if (!lot) return notify('El lote ya no está disponible. Actualice la vista.')
    const form = new FormData(event.currentTarget), blocked = form.has('blocked'), note = String(form.get('note') ?? '').trim()
    if (lot.blocked === blocked && (lot.note ?? '') === note) return notify('No hay cambios administrativos para guardar.')
    void mutation('/lots', 'PATCH', {productId, location, id, blocked, note})
  }
  if (state.role !== 'Administrador') return <article className="card"><h2>Datos maestros · Acceso restringido</h2><p>El perfil Administrador puede crear y editar productos, ubicaciones y datos administrativos de lotes.</p><p className="muted">El perfil activo determina los permisos de administración.</p></article>
  const tracingLocked = !!productId && productHasHistory(productId)
  return <div className="stack" aria-busy={busy}>
    <article className="card">
      <div className="card-title"><h2>Productos</h2><span>Catálogo de productos</span></div>
      <div className="filters"><label>Producto para editar<select aria-label="Producto para editar" value={productId} onChange={e => selectProduct(e.target.value)}><option value="">＋ Crear producto</option>{state.products.map(p => <option value={p.id} key={p.id}>{p.sku} · {p.name}</option>)}</select></label><button type="button" onClick={() => selectProduct('')}>Nuevo producto</button></div>
      <form className="form-grid" noValidate onSubmit={saveProduct}>
        <label>Nombre<input required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label>
        <label>SKU único<input required value={draft.sku} onChange={e => setDraft({ ...draft, sku: e.target.value })}/></label>
        <label>Unidad<input required placeholder="Ej. cajas" value={draft.unit} onChange={e => setDraft({ ...draft, unit: e.target.value })}/></label>
        <label>Categoría<input required value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}/></label>
        <label>Precio de referencia (Bs)<input type="number" min="0" step="any" value={draft.price} onChange={e => setDraft({ ...draft, price: e.target.value })}/></label>
        <label>Punto de reorden (unidades por ubicación)<input type="number" min="0" step="any" value={draft.threshold} onChange={e => setDraft({ ...draft, threshold: e.target.value })}/></label>
        <label>Cantidad sugerida de reposición<input type="number" min="0" step="any" value={draft.replenishment} onChange={e => setDraft({ ...draft, replenishment: e.target.value })}/></label>
        <label>Control de lote y vencimiento<select value={draft.lotTracked ? 'yes' : 'no'} disabled={tracingLocked} onChange={e => setDraft({ ...draft, lotTracked: e.target.value === 'yes' })}><option value="yes">Sí · obligatorio en recepción</option><option value="no">No · sin lote ni vencimiento</option></select>{tracingLocked && <small>El historial impide cambiar la trazabilidad.</small>}</label>
        <p className="form-help">El punto de reorden compara el disponible total de cada producto en cada ubicación. La reposición es una recomendación de Compras sujeta a revisión humana; no crea una compra.</p>
        {error && <p className="field-error" role="alert">{error}</p>}
        <button className="primary">{productId ? 'Guardar producto' : 'Crear producto'}</button>
      </form>
    </article>
    <article className="card">
      <div className="card-title"><h2>Ubicaciones</h2><span>Historial protegido</span></div>
      <form className="form-grid" onSubmit={addLocation}><label>Nueva ubicación<input name="location" required placeholder="Nombre de la ubicación"/></label><button className="primary">Crear ubicación</button></form>
      <p className="muted">Solo se pueden renombrar o eliminar ubicaciones sin lotes ni operaciones. Se conservan las referencias históricas incluso cuando el saldo llega a cero.</p>
      {state.locations.map(location => <form key={location} className="transfer" onSubmit={e => renameLocation(e, location)}><div><label>Nombre de ubicación<input aria-label={`Nombre de ${location}`} name="name" defaultValue={location} readOnly={locationHasHistory(location)}/></label><small>{locationHasHistory(location) ? 'Con historial: nombre y eliminación protegidos' : 'Sin historial'}</small></div><div><button disabled={locationHasHistory(location)}>Guardar nombre</button><button type="button" disabled={locationHasHistory(location)} onClick={() => deleteLocation(location)}>Eliminar</button></div></form>)}
    </article>
    <article className="card">
      <div className="card-title"><h2>Administración de lotes</h2><span>Bloqueo y notas · Sin modificación de saldo</span></div>
      <p className="muted">Las cantidades cambian por operaciones y ajustes autorizados. El lote y vencimiento se conservan para mantener la trazabilidad. Cada cambio de bloqueo o nota genera un movimiento administrativo de cantidad cero.</p>
      {!state.lots.length && <p>No hay lotes registrados.</p>}
      {state.lots.map(lot => <form className="form-grid" key={JSON.stringify([lot.productId, lot.location, lot.id, lot.blocked, lot.note])} onSubmit={e => saveLot(e, lot.productId, lot.location, lot.id)}>
        <div className="form-help"><b>{state.products.find(p => p.id === lot.productId)?.name ?? lot.productId}</b><br/>{lot.location} · Lote {lot.id}<br/>Vence: {lot.expiry || 'No aplica'} · Físico: {lot.quantity} · Reservado: {lot.reserved}</div>
        <label>Nota administrativa<input name="note" defaultValue={lot.note ?? ''} aria-label={`Nota del lote ${lot.id}`}/></label>
        <label>Bloqueado<input type="checkbox" name="blocked" defaultChecked={lot.blocked} aria-label={`Bloquear lote ${lot.id}`}/></label>
        <button type="submit">Guardar lote {lot.id}</button>
      </form>)}
    </article>
  </div>
}
