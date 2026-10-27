import { useEffect, useMemo, useRef, useState } from 'react'
import type { State } from './types'
import Icon from './Icon'
import { branches, compatibleBranches, defaultFilters, departments, queryDashboard, regions, validateFilters } from './dashboardModel'
import type { DashboardFilters } from './dashboardModel'

type Props = { state: State; day: string; onNavigate: (view: string) => void; onProduct: (productId: string, location: string, lotId?: string) => void }
const formatDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })

export default function InventoryDashboard({ state, day, onNavigate, onProduct }: Props) {
  const allBranches = branches(state)
  const [filters, setFilters] = useState<DashboardFilters>(() => defaultFilters(day))
  const [draft, setDraft] = useState<DashboardFilters>(() => defaultFilters(day))
  const [branch, setBranch] = useState(() => allBranches.find(item => item.id === 'Sucursal Equipetrol')?.id ?? allBranches[0]?.id ?? '')
  const [pendingBranch, setPendingBranch] = useState(branch)
  const [filterOpen, setFilterOpen] = useState(false)
  const [branchOpen, setBranchOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [anticipation, setAnticipation] = useState(7)
  const filterRef = useRef<HTMLDivElement>(null)
  const branchRef = useRef<HTMLDivElement>(null)
  const filterButtonRef = useRef<HTMLButtonElement>(null)
  const branchButtonRef = useRef<HTMLButtonElement>(null)
  const fromRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const allowedBranches = compatibleBranches(state, filterOpen ? draft : filters)
  const selectedBranch = filterOpen ? pendingBranch : branch
  const selectedLabel = allBranches.find(item => item.id === selectedBranch)?.label ?? 'Seleccionar sucursal'
  const result = useMemo(() => queryDashboard(state, branch, filters, day, anticipation), [state, branch, filters, day, anticipation])
  const maxValue = Math.max(1, ...result.products.flatMap(product => [product.stock, product.rop]))
  const urgent = result.products.find(product => product.status === 'reorder')
  const expiry = result.expiring[0]
  const countDays = result.count ? Math.floor((Date.parse(`${day}T12:00:00`) - Date.parse(`${result.count.date}T12:00:00`)) / 86400000) : null

  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Node
      if (filterOpen && !filterRef.current?.contains(target) && !branchRef.current?.contains(target)) { setFilterOpen(false); setError(null) }
      if (branchOpen && !branchRef.current?.contains(target)) setBranchOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && filterOpen) { setFilterOpen(false); setBranchOpen(false); setError(null); filterButtonRef.current?.focus() }
      else if (event.key === 'Escape' && branchOpen) { setBranchOpen(false); branchButtonRef.current?.focus() }
    }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) }
  }, [filterOpen, branchOpen])

  useEffect(() => { if (filterOpen) fromRef.current?.focus() }, [filterOpen])

  const openFilters = () => {
    setBranchOpen(false)
    if (filterOpen) { setFilterOpen(false); setError(null); filterButtonRef.current?.focus(); return }
    setDraft(filters); setPendingBranch(branch); setError(null); setFilterOpen(true)
  }
  const apply = () => {
    const validation = validateFilters(draft)
    if (validation) { setError(validation); return }
    if (!compatibleBranches(state, draft).some(item => item.id === pendingBranch)) { setError('La sucursal seleccionada no corresponde al contexto. Elige una sucursal compatible antes de aplicar.'); return }
    setFilters(draft); setBranch(pendingBranch); setFilterOpen(false); setBranchOpen(false); setError(null); filterButtonRef.current?.focus()
  }
  const clear = () => { const defaults = defaultFilters(day); setDraft(defaults); setFilters(defaults); setPendingBranch(branch); setFilterOpen(false); setBranchOpen(false); setError(null); filterButtonRef.current?.focus() }
  const openExpiry = () => dialogRef.current?.showModal()

  return <div className="inv-dashboard">
    <header className="inv-header">
      <div className="inv-heading"><div className="inv-breadcrumb">Inventario / Resumen</div><h1>Dashboard de inventario</h1><p className="inv-subtitle">Identifica qué reponer y qué revisar primero</p><span className="inv-badge">DATOS SIMULADOS</span></div>
      <div className="inv-controls">
        <div className="inv-branch-wrap" ref={branchRef}>
          <button ref={branchButtonRef} type="button" className="inv-branch-button" aria-expanded={branchOpen} aria-controls="inv-branches" onClick={() => setBranchOpen(!branchOpen)}><small>SUCURSAL</small><strong>{selectedLabel} <Icon name="chevron"/></strong></button>
          {branchOpen && <div id="inv-branches" className="inv-branch-menu"><strong>Cambiar sucursal</strong>{allowedBranches.length ? allowedBranches.map(item => <button type="button" key={item.id} aria-pressed={selectedBranch === item.id} onClick={() => { if (filterOpen) setPendingBranch(item.id); else setBranch(item.id); setBranchOpen(false); setError(null); branchButtonRef.current?.focus() }}>{selectedBranch === item.id && <Icon name="check"/>}{item.label}</button>) : <p className="inv-empty">No hay sucursales para este contexto.</p>}</div>}
        </div>
        <p className="inv-update">Actualización: {formatDate(day)}{filterOpen && pendingBranch !== branch ? ' · Sucursal pendiente de aplicar' : ''}</p>
        <div className="inv-filter-wrap" ref={filterRef}>
          <button ref={filterButtonRef} type="button" className="inv-filter-button" aria-label="Filtros globales y contexto" aria-expanded={filterOpen} aria-controls="inv-filters" onClick={openFilters}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 4h18l-7 8v6l-4 2v-8z"/></svg></button>
          {filterOpen && <form id="inv-filters" className="inv-filter-panel" aria-label="Filtros globales y contexto" noValidate onSubmit={event => { event.preventDefault(); apply() }}><h2>Filtros globales + contexto</h2><div className="inv-filter-grid">
            <label>Fecha desde<input ref={fromRef} type="date" value={draft.from} aria-invalid={!!error && (!draft.from || !draft.to || draft.from > draft.to)} aria-describedby={error ? "inv-filter-error" : undefined} onChange={e => setDraft({ ...draft, from: e.target.value })}/></label>
            <label>Fecha hasta<input type="date" value={draft.to} aria-invalid={!!error && (!draft.from || !draft.to || draft.from > draft.to)} aria-describedby={error ? "inv-filter-error" : undefined} onChange={e => setDraft({ ...draft, to: e.target.value })}/></label>
            <label>Región<select aria-label="Región" value={draft.region} onChange={e => { setDraft({ ...draft, region: e.target.value, department: '' }); setError(null) }}><option value="">Todas las regiones</option>{regions.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
            <label>Departamento<select aria-label="Departamento" value={draft.department} onChange={e => { setDraft({ ...draft, department: e.target.value }); setError(null) }}><option value="">Todos los departamentos</option>{departments(draft.region).map(item => <option key={item} value={item}>{item}</option>)}</select></label>
          </div>{!allowedBranches.some(item => item.id === pendingBranch) && <p className="inv-error">Selecciona una sucursal compatible en el selector de sucursal.</p>}{error && <p id="inv-filter-error" className="inv-error" role="alert">{error}</p>}<div className="inv-filter-actions"><button type="button" onClick={clear}>Limpiar filtros</button><button type="submit">Aplicar filtros</button></div></form>}
        </div>
      </div>
    </header>
    <p className="inv-summary" aria-live="polite">Período: {formatDate(filters.from)} – {formatDate(filters.to)} · {filters.region || 'Todas las regiones'} · {filters.department || 'Todos los departamentos'}. El consumo y los conteos corresponden al período; stock, ROP y vencimientos muestran el estado actual.</p>
    <section className="inv-kpis" aria-label="Indicadores principales">
      <button type="button" className="inv-card inv-kpi inv-danger" onClick={() => onNavigate('Reposición')}><span>Productos para reordenar</span><strong className="inv-kpi-value">{result.reorder}</strong><span className="inv-pill inv-danger">Reordenar</span></button>
      <button type="button" className="inv-card inv-kpi inv-warning" onClick={() => onNavigate('Reposición')}><span>Próximos a reorden</span><strong className="inv-kpi-value">{result.soon}</strong><span className="inv-pill inv-warning">Atención</span></button>
      <button type="button" className="inv-card inv-kpi inv-warning" onClick={openExpiry}><span>Lotes próximos a vencer</span><strong className="inv-kpi-value">{result.expiring.length}</strong><span className="inv-pill inv-warning">90 días</span></button>
    </section>
    <section className="inv-card inv-chart"><h2>¿Qué productos necesitan reposición?</h2><p>Stock disponible (barra) · Punto de reorden ROP configurado (marca vertical) · unidades</p><details className="inv-calculation"><summary>Contexto del cálculo · {result.products.length} productos</summary><p>ROP = (consumo diario promedio × lead time) + stock de seguridad. Esta demo conserva el ROP actual configurado porque no dispone de lead time ni stock de seguridad.</p><p>{result.consumptionUnits ? `${result.consumptionUnits} unidades de venta registradas en ${result.periodDays} días (ambas fechas incluidas).` : 'Sin ventas registradas en el período: la proyección de próximos a reorden no está disponible.'}</p><label className="inv-anticipation">Anticipación: <input type="number" min="1" max="365" value={anticipation} onChange={e => setAnticipation(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}/> días</label></details>
      {result.products.length ? <div className="inv-chart-rows" tabIndex={0} role="region" aria-label="Productos ordenados por urgencia. Desplaza para ver todos los productos">{result.products.map(product => <button type="button" className="inv-chart-row" key={product.id} onClick={() => onProduct(product.id, branch)} aria-label={`${product.name}: stock ${product.stock} ${product.unit}, ROP ${product.rop} ${product.unit}. Abrir producto`}><span className="inv-chart-name">{product.name}</span><span className="inv-track"><span className={`inv-bar ${product.status === 'reorder' ? 'inv-danger' : ''}`} style={{ width: `${product.stock / maxValue * 100}%` }}/><span className="inv-marker" style={{ left: `${product.rop / maxValue * 100}%` }}/></span><span className={`inv-chart-value ${product.status === 'reorder' ? 'inv-danger' : ''}`}>{product.stock} / ROP {product.rop} {product.unit}</span></button>)}</div> : <p className="inv-empty">No hay productos disponibles para esta sucursal.</p>}
      <div className="inv-axis"><span>0</span><span>{maxValue} unidades</span></div>
    </section>
    <section className="inv-counts" aria-label="Control de inventario">
      <button type="button" className="inv-card inv-count-card" onClick={() => onNavigate('Control')}><h2>Exactitud del último conteo</h2>{result.count ? <><strong className={`inv-count-value ${result.count.accuracy < 95 ? 'inv-danger' : 'inv-success'}`}>{result.count.accuracy.toLocaleString('es-BO', { maximumFractionDigits: 1 })} %</strong><p>Meta académica ≥ 95 % · {(result.count.accuracy - 95).toLocaleString('es-BO', {minimumFractionDigits:1, maximumFractionDigits:1})} puntos · {result.count.exact} de {result.count.total} registros sin diferencias</p><span className={`inv-pill ${result.count.accuracy < 95 ? 'inv-danger' : 'inv-success'}`}>{result.count.accuracy < 95 ? 'Revisión necesaria' : 'Satisfactorio'}</span></> : <p className="inv-empty">Sin conteos aprobados con fecha en el período.</p>}</button>
      <button type="button" className="inv-card inv-count-card" onClick={() => onNavigate('Control')}><h2>Fecha del último conteo físico</h2>{result.count ? <><strong className="inv-count-value">{formatDate(result.count.date)}</strong><p>Hace {countDays} días · Conteo {result.count.complete ? 'completo' : 'parcial'}</p><span className={`inv-pill ${(countDays ?? 0) > 30 ? 'inv-danger' : (countDays ?? 0) > 7 ? 'inv-warning' : 'inv-success'}`}>{(countDays ?? 0) > 30 ? 'Revisión necesaria' : (countDays ?? 0) > 7 ? 'Próxima revisión' : 'Al día'}</span></> : <p className="inv-empty">Sin conteos aprobados con fecha en el período.</p>}</button>
    </section>
    <section className="inv-actions"><h2>Acciones recomendadas</h2><div className="inv-action-grid">
      {urgent && <button type="button" className="inv-action inv-danger" onClick={() => onNavigate('Reposición')}><strong>Reordenar</strong><span>{urgent.name} · Stock {urgent.stock} / ROP {urgent.rop}</span></button>}
      {expiry && <button type="button" className="inv-action inv-warning" onClick={openExpiry}><strong>Revisar vencimiento</strong><span>Lote {expiry.id} · Vence en {expiry.days} días</span></button>}
      {(!result.count || result.count.accuracy < 95) && <button type="button" className="inv-action inv-warning" onClick={() => onNavigate('Control')}><strong>Realizar conteo</strong><span>{result.count ? 'Exactitud del último conteo bajo 95 %' : 'No hay conteos fechados en el período'}</span></button>}
      {!urgent && !expiry && result.count && result.count.accuracy >= 95 && <p className="inv-empty">No hay acciones prioritarias identificadas.</p>}
    </div></section>
    <dialog className="inv-dialog" onKeyDown={event => {
      if (event.key !== 'Tab') return
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]'))
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }} ref={dialogRef} aria-labelledby="inv-dialog-title"><div className="inv-dialog-head"><div><h2 id="inv-dialog-title">Lotes próximos a vencer</h2><p>{result.expiring.length} lotes con vencimiento en los próximos 90 días</p></div><button type="button" onClick={() => dialogRef.current?.close()}>CERRAR <Icon name="close"/></button></div><p className="inv-table-hint">Desliza la tabla para consultar todas las columnas.</p><div className="inv-table-wrap" tabIndex={0} role="region" aria-label="Detalle de lotes próximos a vencer"><table><thead><tr><th>PRODUCTO</th><th>LOTE</th><th>VENCIMIENTO</th><th>DÍAS</th><th>UNIDADES</th></tr></thead><tbody>{result.expiring.map(lot => <tr key={`${lot.productId}:${lot.id}:${lot.expiry}`}><td><button type="button" onClick={() => { dialogRef.current?.close(); onProduct(lot.productId, branch, lot.id) }}>{lot.name}</button></td><td>{lot.id}</td><td>{formatDate(lot.expiry)}</td><td>{lot.days}</td><td>{lot.units} {lot.unit}</td></tr>)}</tbody></table>{!result.expiring.length && <p className="inv-empty">No hay lotes próximos a vencer.</p>}</div><p>Revisar lotes y evaluar salida FEFO o traslado. Las decisiones requieren autorización.</p></dialog>
  </div>
}
