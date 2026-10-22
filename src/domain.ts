import type { Allocation, Lot, Movement, State } from './types'
import { initialState } from './data'

export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
export const uid = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
export const qty = (s: State, productId: string, location: string) => s.lots.filter(l => l.productId === productId && l.location === location).reduce((sum,l) => sum+l.quantity,0)
const eligible = (s: State, productId: string, location: string) => s.lots.filter(l => l.productId===productId && l.location===location && !l.blocked && (!l.expiry || l.expiry>today()) && l.quantity>l.reserved).sort((a,b) => (a.expiry || '9999').localeCompare(b.expiry || '9999') || a.id.localeCompare(b.id))
export const available = (s: State, productId: string, location: string) => eligible(s,productId,location).reduce((sum,l)=>sum+l.quantity-l.reserved,0)
const dateValid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value
const daysUntil = (expiry: string) => (Date.parse(`${expiry}T12:00:00Z`)-Date.parse(`${today()}T12:00:00Z`))/86400000
export const lotStatus = (s: State, l: Lot) => l.blocked ? 'Bloqueado' : l.expiry && l.expiry<=today() ? 'Vencido' : l.expiry && daysUntil(l.expiry)<=s.alertDays ? 'Próximo a vencer' : 'Disponible'
export const abc = (s: State) => {
  const ranked = s.products.map(p=>({productId:p.id,value:s.movements.filter(m=>m.productId===p.id && m.type==='Venta POS simulada' && m.quantity<0).reduce((sum,m)=>sum-m.quantity*p.price,0)})).sort((a,b)=>b.value-a.value)
  const total=ranked.reduce((sum,x)=>sum+x.value,0); let accumulated=0
  return ranked.map(x=>{const prior=accumulated; accumulated+=x.value; return {...x,cls:!x.value?'C':prior/total<.8?'A':prior/total<.95?'B':'C',acc:total?accumulated/total*100:0}})
}
export type Alert = { id:string; kind:string; productId:string; location:string; lotId?:string; condition:string; priority:string; target:'Existencias'|'Reposición'|'Operaciones'|'Control' }
export const alerts = (s: State): Alert[] => {
  const result:Alert[]=[]
  for(const p of s.products) for(const location of s.locations) { const balance=available(s,p.id,location); if(balance<=p.threshold)result.push({id:`low:${p.id}:${location}`,kind:'Stock bajo',productId:p.id,location,condition:`Disponible ${balance} ≤ punto de reorden ${p.threshold}`,priority:balance===0?'Alta':'Media',target:'Reposición'}) }
  for(const l of s.lots.filter(l=>l.quantity>0)) {
    const base={productId:l.productId,location:l.location,lotId:l.id,target:'Existencias' as const}
    if(l.blocked)result.push({...base,id:`blocked:${l.productId}:${l.location}:${l.id}`,kind:'Lote bloqueado',condition:'Bloqueado para salidas; requiere revisión de Inventario',priority:'Alta'})
    if(l.expiry && l.expiry<=today())result.push({...base,id:`expired:${l.productId}:${l.location}:${l.id}`,kind:'Lote vencido',condition:`Vencimiento ${l.expiry}; excluido de FEFO`,priority:'Alta'})
    else if(l.expiry && daysUntil(l.expiry)<=s.alertDays)result.push({...base,id:`expiry:${l.productId}:${l.location}:${l.id}`,kind:'Próximo a vencer',condition:`Vence ${l.expiry}, ventana ${s.alertDays} días`,priority:'Media'})
  }
  for(const t of s.transfers.filter(t=>t.status==='En tránsito'))result.push({id:`transfer:${t.id}`,kind:'Transferencia en tránsito',productId:t.productId,location:t.destination,condition:`${t.id}: ${t.quantity} desde ${t.origin}`,priority:'Media',target:'Operaciones'})
  for(const c of s.counts.filter(c=>c.status==='Pendiente' && c.system!==c.physical))result.push({id:`count:${c.id}`,kind:'Conteo pendiente',productId:c.productId,location:c.location,condition:`${c.id}: diferencia ${c.physical-c.system}; requiere aprobación`,priority:'Alta',target:'Control'})
  return result
}

/** Migra el formato anterior manteniendo maestros y auditoría. JSON ilegible usa semillas. */
export function loadState(raw: string|null): State {
  if(!raw)return initialState()
  let parsed:State
  try {parsed=JSON.parse(raw)} catch {return initialState()}
  if(!parsed || !Array.isArray(parsed.products) || !Array.isArray(parsed.lots) || !Array.isArray(parsed.movements))return initialState()
  const defaults=initialState()
  const s:State={...defaults,...parsed,version:2,
    products:parsed.products.map(p=>({...p,replenishment:Number.isFinite(p.replenishment)?p.replenishment:Math.max(1,p.threshold*2)})),
    locations:[...new Set([...(parsed.locations ?? defaults.locations),...parsed.lots.map(l=>l.location),...(parsed.transfers??[]).flatMap(t=>[t.origin,t.destination]),...parsed.movements.map(m=>m.location),...(parsed.counts??[]).map(c=>c.location)])],
    alertDays:Number.isFinite(parsed.alertDays)&&parsed.alertDays>=0?parsed.alertDays:30,
    sales:parsed.sales??[],replenishmentReviews:parsed.replenishmentReviews??{},processedSales:parsed.processedSales??{},counts:parsed.counts??[],
    transfers:(parsed.transfers??[]).map(t=>({...t,allocations:t.allocations??[]}))
  }
  // El prototipo antiguo duplicaba recepciones del mismo código; solo se consolidan si coinciden metadatos.
  const consolidated:Lot[]=[]
  for(const l of s.lots) {
    const existing=consolidated.find(x=>x.productId===l.productId && x.location===l.location && x.id===l.id && x.expiry===l.expiry && x.blocked===l.blocked)
    if(existing) {existing.quantity+=l.quantity;existing.reserved+=l.reserved}
    else consolidated.push({...l})
  }
  s.lots=consolidated
  return s
}

export type Command =
 | {type:'receipt';productId:string;location:string;amount:number;lotId:string;expiry:string;reference:string}
 | {type:'sale';productId:string;location:string;amount:number;saleId:string}
 | {type:'dispatch';productId:string;origin:string;destination:string;amount:number}
 | {type:'receiveTransfer';id:string}
 | {type:'count';productId:string;location:string;physical:number;reason:string;lotId?:string;expiry?:string}
 | {type:'approve';id:string}
function assert(condition:unknown,message:string):asserts condition { if(!condition)throw new Error(message) }
const positive = (n:number) => Number.isFinite(n) && n>0
const snapshot = (s:State,p:string,loc:string) => JSON.stringify(s.lots.filter(l=>l.productId===p && l.location===loc).map(l=>[l.id,l.expiry,l.quantity,l.reserved,l.blocked]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))
const operator = (s:State) => assert(s.role==='Encargado'||s.role==='Administrador','Acción bloqueada: requiere Encargado o Administrador.')
function productLocation(s:State,p:string,loc:string) {const product=s.products.find(x=>x.id===p);assert(product,'Seleccione un producto existente.');assert(s.locations.includes(loc),'Seleccione una ubicación existente.');return product}
function addMovement(s:State,p:string,loc:string,amount:number,type:string,reference:string,note:string,lot?:Lot,before?:number) {
  const m:Movement={id:uid('MOV'),type,productId:p,location:loc,quantity:amount,date:new Date().toISOString(),user:s.role,reference,note,lotId:lot?.id,expiry:lot?.expiry,before,after:before===undefined?undefined:before+amount}
  s.movements.unshift(m)
}
function addStock(s:State,p:string,loc:string,a:Allocation,type:string,reference:string,note:string) {
  const matches=s.lots.filter(l=>l.productId===p && l.location===loc && l.id===a.lotId)
  assert(matches.length<=1,'El lote tiene registros históricos ambiguos; revise datos antes de consolidar.')
  let l=matches[0]
  assert(!l || l.expiry===a.expiry,'El lote existente tiene otro vencimiento. Revise el código y la fecha; no se duplicó.')
  if(!l) {l={id:a.lotId,productId:p,location:loc,quantity:0,reserved:0,blocked:false,expiry:a.expiry};s.lots.push(l)}
  const before=l.quantity;l.quantity+=a.quantity
  addMovement(s,p,loc,a.quantity,type,reference,`${note}; ${before?'consolidado en lote existente':'entrada en lote'} ${a.lotId}`,l,before)
}
function consume(s:State,p:string,loc:string,n:number,type:string,ref:string,note:string):Allocation[] {
  const lots=eligible(s,p,loc)
  assert(lots.reduce((sum,l)=>sum+l.quantity-l.reserved,0)>=n,'Saldo elegible insuficiente: se excluyen lotes vencidos, bloqueados y unidades reservadas. Revise existencias.')
  let remaining=n;const allocations:Allocation[]=[]
  for(const l of lots) {if(remaining<=0)break;const take=Math.min(remaining,l.quantity-l.reserved); const before=l.quantity;l.quantity-=take;remaining-=take;allocations.push({lotId:l.id,expiry:l.expiry,quantity:take});addMovement(s,p,loc,-take,type,ref,`${note}; FEFO lote ${l.id}`,l,before)}
  return allocations
}

/** Único escritor de existencias. Devuelve una copia; errores no modifican el estado original. */
export function execute(state:State,c:Command):State {
  const s:State=structuredClone(state)
  if(c.type==='receipt') {
    operator(s);const p=productLocation(s,c.productId,c.location)
    assert(positive(c.amount),'Ingrese una cantidad mayor que cero.');assert(c.reference.trim(),'Ingrese la referencia de orden de compra.')
    if(p.lotTracked) {assert(c.lotId.trim(),'El producto controla lote: ingrese su código.');assert(dateValid(c.expiry)&&c.expiry>today(),'Indique un vencimiento válido posterior a hoy.')}
    const a={lotId:p.lotTracked?c.lotId.trim():'SIN-LOTE',expiry:p.lotTracked?c.expiry:'',quantity:c.amount}
    addStock(s,p.id,c.location,a,'Recepción de compra',c.reference.trim(),'Compras local simulada')
  } else if(c.type==='sale') {
    productLocation(s,c.productId,c.location);assert(positive(c.amount),'Ingrese una cantidad mayor que cero.');const id=c.saleId.trim();assert(id,'Ingrese el ID único de venta POS.')
    const previous=s.sales.find(x=>x.id===id)
    if(previous) {assert(previous.productId===c.productId&&previous.location===c.location&&previous.quantity===c.amount,'ID POS ya utilizado con otros datos. Use un ID nuevo.');return state}
    if(Object.prototype.hasOwnProperty.call(s.processedSales,id))return state
    const fulfilled=available(s,c.productId,c.location)>=c.amount
    const allocations=fulfilled?consume(s,c.productId,c.location,c.amount,'Venta POS simulada',id,'POS local simulado'):[]
    s.sales.unshift({id,productId:c.productId,location:c.location,quantity:c.amount,date:new Date().toISOString(),fulfilled,allocations,...(!fulfilled?{reason:'Stock elegible insuficiente. Reintentos del mismo ID conservan este rechazo; use un nuevo ID tras reponer.'}:{})})
    s.processedSales[id]=fulfilled?'confirmada':'rechazada por stock insuficiente'
  } else if(c.type==='dispatch') {
    operator(s);productLocation(s,c.productId,c.origin);assert(s.locations.includes(c.destination),'Seleccione una ubicación de destino existente.');assert(c.origin!==c.destination,'Origen y destino deben ser diferentes.');assert(positive(c.amount),'Ingrese una cantidad mayor que cero.')
    const id=uid('TR'); const allocations=consume(s,c.productId,c.origin,c.amount,'Despacho de transferencia',id,`En tránsito hacia ${c.destination}`)
    s.transfers.unshift({id,productId:c.productId,origin:c.origin,destination:c.destination,quantity:c.amount,status:'En tránsito',date:new Date().toISOString(),allocations})
  } else if(c.type==='receiveTransfer') {
    operator(s);const tr=s.transfers.find(t=>t.id===c.id);assert(tr,'Transferencia inexistente.');if(tr.status==='Recibida')return state
    assert(tr.status==='En tránsito','Solo puede recibirse una transferencia despachada y en tránsito.')
    assert(tr.allocations?.length && tr.allocations.every(a=>positive(a.quantity)) && tr.allocations.reduce((sum,a)=>sum+a.quantity,0)===tr.quantity,'Transferencia antigua sin detalle válido de lotes. No se puede recibir sin revisar su trazabilidad; no se inventará un vencimiento.')
    const p=productLocation(s,tr.productId,tr.destination)
    for(const a of tr.allocations) {assert(!p.lotTracked || !!a.lotId && dateValid(a.expiry),'La transferencia no conserva lote y vencimiento válidos.');addStock(s,tr.productId,tr.destination,a,'Recepción de transferencia',tr.id,`Desde ${tr.origin}; vencimiento original conservado`)}
    tr.status='Recibida'
  } else if(c.type==='count') {
    const p=productLocation(s,c.productId,c.location)
    assert(Number.isFinite(c.physical)&&c.physical>=0,'El conteo físico debe ser un número no negativo.');const system=qty(s,p.id,c.location)
    assert(c.reason.trim(),'Indique el motivo del conteo o diferencia.')
    const id=uid('CNT')
    s.counts.unshift({id,productId:p.id,location:c.location,physical:c.physical,system,status:'Pendiente',createdBy:s.role,reason:c.reason.trim(),lotId:c.lotId?.trim(),expiry:c.expiry,snapshot:snapshot(s,p.id,c.location)})
  } else {
    assert(s.role==='Inventario'||s.role==='Administrador','Solo Inventario o Administrador puede aprobar ajustes.')
    const count=s.counts.find(x=>x.id===c.id);assert(count,'Conteo inexistente.');assert(count.status==='Pendiente','El conteo ya fue aprobado.');assert(s.role==='Administrador'||count.createdBy!==s.role,'No puede aprobar su propio ajuste.')
    assert(count.system===qty(s,count.productId,count.location) && (!count.snapshot || count.snapshot===snapshot(s,count.productId,count.location)),'El inventario cambió desde el conteo. Registre un nuevo conteo antes de aprobar.')
    assert(count.reason?.trim(),'El conteo requiere motivo antes de aprobar.')
    const delta=count.physical-count.system
    if(delta<0)consume(s,count.productId,count.location,-delta,'Ajuste autorizado',count.id,`Conteo ${count.system} → ${count.physical}; ${count.reason}`)
    else if(delta>0) {
      const p=productLocation(s,count.productId,count.location);const lot=s.lots.find(l=>l.productId===p.id && l.location===count.location && l.id===count.lotId)
      const lotId=p.lotTracked?(count.lotId??''):'SIN-LOTE';const expiry=p.lotTracked?(count.expiry || lot?.expiry || ''):''
      if(p.lotTracked) {assert(lotId,'Ajuste positivo: seleccione o indique el lote físico.');assert(dateValid(expiry)&&expiry>today(),'Ajuste positivo: indique el vencimiento futuro del lote físico; no se asigna una fecha ficticia.')}
      addStock(s,p.id,count.location,{lotId,expiry,quantity:delta},'Ajuste autorizado',count.id,`Conteo ${count.system} → ${count.physical}; ${count.reason}`)
    } else addMovement(s,count.productId,count.location,0,'Ajuste autorizado',count.id,`Conteo sin diferencia; ${count.reason}`)
    count.status='Aprobado';count.approvedBy=s.role
  }
  return s
}
