import type { State } from './types'

export type DashboardFilters = { from: string; to: string; region: string; department: string }
const msDay = 86400000
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const businessDate = (value: string): string => {
  if (validDate(value)) return value
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !validDate(value.slice(0, 10))) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
const timestamp = (date: string) => Date.parse(`${date}T00:00:00Z`)
export function defaultFilters(day: string): DashboardFilters {
  if (!validDate(day)) throw new Error('Fecha inválida')
  return { from: new Date(timestamp(day) - 29 * msDay).toISOString().slice(0, 10), to: day, region: '', department: '' }
}
// La ubicación geográfica de CEDIS es una asociación asumida para esta demo.
const geography: Record<string, {label: string; region: string; department: string}> = {
  'Sucursal Equipetrol': {label: 'Santa Cruz · Equipetrol', region: 'Llanos', department: 'Santa Cruz'},
  'Sucursal Cala Cala': {label: 'Cochabamba · Cala Cala', region: 'Valles', department: 'Cochabamba'},
  'CEDIS Central': {label: 'La Paz · CEDIS Central', region: 'Altiplano', department: 'La Paz'},
}
export const regions = ['Altiplano', 'Valles', 'Llanos', 'Sin clasificar']
export function departments(region: string): string[] {
  const values = Object.values(geography).filter(x => !region || x.region === region).map(x => x.department)
  if (!region || region === 'Sin clasificar') values.push('Sin clasificar')
  return [...new Set(values)]
}
export function branches(state: State) {
  return state.locations.map(id => ({ id, ...(geography[id] ?? { label: id, region: 'Sin clasificar', department: 'Sin clasificar' }) }))
}
export function compatibleBranches(state: State, filters: DashboardFilters) {
  return branches(state).filter(b => (!filters.region || b.region === filters.region) && (!filters.department || b.department === filters.department))
}
export function validateFilters(filters: DashboardFilters): string | null {
  if (!validDate(filters.from) || !validDate(filters.to)) return 'Ingrese fechas válidas.'
  if (filters.from > filters.to) return 'La fecha desde no puede ser posterior a la fecha hasta.'
  if (filters.region && !regions.includes(filters.region)) return 'Seleccione una región válida.'
  if (filters.department && !departments(filters.region).includes(filters.department)) return 'El departamento no corresponde a la región seleccionada.'
  return null
}
export function queryDashboard(state: State, branch: string, filters: DashboardFilters, day: string, anticipation = 7) {
  const error = validateFilters(filters)
  if (error) throw new Error(error)
  if (!validDate(day)) throw new Error('Fecha actual inválida.')
  if (!compatibleBranches(state, filters).some(b => b.id === branch)) throw new Error('La sucursal no corresponde al contexto seleccionado.')
  const periodDays = (timestamp(filters.to) - timestamp(filters.from)) / msDay + 1
  const sales = state.sales.filter(s => s.fulfilled && s.location === branch && businessDate(s.date) >= filters.from && businessDate(s.date) <= filters.to)
  const products = state.products.map(p => {
    const stock = state.lots.filter(l => l.productId === p.id && l.location === branch && !l.blocked && (!l.expiry || l.expiry > day) && l.quantity > l.reserved).reduce((sum, l) => sum + l.quantity - l.reserved, 0)
    const productSales = sales.filter(s => s.productId === p.id)
    const dailyConsumption = productSales.length ? productSales.reduce((sum, s) => sum + s.quantity, 0) / periodDays : null
    const daysToRop = stock <= p.threshold ? 0 : dailyConsumption ? (stock - p.threshold) / dailyConsumption : null
    const status: 'reorder' | 'soon' | 'normal' = stock <= p.threshold ? 'reorder' : daysToRop !== null && daysToRop <= anticipation ? 'soon' : 'normal'
    return { id: p.id, name: p.name, unit: p.unit, stock, rop: p.threshold, dailyConsumption, status, daysToRop }
  }).sort((a, b) => ({reorder: 0, soon: 1, normal: 2}[a.status] - {reorder: 0, soon: 1, normal: 2}[b.status]) || (a.status === 'reorder' && b.status === 'reorder' ? (a.rop ? a.stock / a.rop : Infinity) - (b.rop ? b.stock / b.rop : Infinity) : 0) || (a.daysToRop ?? Infinity) - (b.daysToRop ?? Infinity) || a.name.localeCompare(b.name))
  const expiring = state.lots.filter(l => l.location === branch && !l.blocked && l.expiry && validDate(l.expiry) && l.expiry > day && (timestamp(l.expiry) - timestamp(day)) / msDay <= 90 && l.quantity > l.reserved).map(l => ({ id: l.id, productId: l.productId, name: state.products.find(p => p.id === l.productId)?.name ?? l.productId, unit: state.products.find(p => p.id === l.productId)?.unit ?? '', expiry: l.expiry, days: (timestamp(l.expiry) - timestamp(day)) / msDay, units: l.quantity - l.reserved })).sort((a, b) => a.days - b.days || a.id.localeCompare(b.id))
  // Counts currently have neither a date nor a grouping identifier. A dated record is
  // therefore reported as one partial count, never as a fabricated full inventory.
  const datedCounts = state.counts.flatMap(c => {
    const extended = c as typeof c & { approvedAt?: string; date?: string }
    const date = businessDate(extended.approvedAt ?? extended.date ?? '')
    return c.status === 'Aprobado' && c.location === branch && validDate(date) && date >= filters.from && date <= filters.to ? [{c, date, recordedAt: extended.approvedAt ?? extended.date ?? date}] : []
  }).sort((a, b) => b.date.localeCompare(a.date) || (Date.parse(b.recordedAt) || 0) - (Date.parse(a.recordedAt) || 0))
  const latest = datedCounts[0]
  const count = latest ? { date: latest.date, accuracy: latest.c.system === latest.c.physical ? 100 : 0, total: 1, exact: latest.c.system === latest.c.physical ? 1 : 0, complete: false } : null
  return { products, reorder: products.filter(p => p.status === 'reorder').length, soon: products.filter(p => p.status === 'soon').length, expiring, count, consumptionUnits: sales.reduce((sum, s) => sum + s.quantity, 0), periodDays }
}
