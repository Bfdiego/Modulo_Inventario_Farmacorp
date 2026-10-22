import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const output=mkdtempSync(join(tmpdir(),'farmacorp-domain-'))
execFileSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'src/domain.ts','src/data.ts','src/types.ts','--ignoreConfig','--outDir',output,'--module','commonjs','--target','ES2022','--strict','--skipLibCheck'],{stdio:'pipe'})
const require=createRequire(import.meta.url)
const {execute,available,qty,alerts,abc,loadState,today}=require(join(output,'domain.js'))
const {initialState}=require(join(output,'data.js'))
after(()=>rmSync(output,{recursive:true,force:true}))
const loc='Sucursal Equipetrol',central='CEDIS Central',destination='Sucursal Cala Cala'
const future=()=> {const d=new Date();d.setDate(d.getDate()+200);return d.toISOString().slice(0,10)}
const receipt=(overrides={})=>({type:'receipt',productId:'P01',location:loc,amount:3,lotId:'NEW',expiry:future(),reference:'OC-TEST',...overrides})
const sale=(overrides={})=>({type:'sale',productId:'P01',location:loc,amount:20,saleId:'POS-TEST',...overrides})

test('semillas relativas y tránsito coherente preservan lote y vencimiento',()=>{
 const s=initialState(),t=s.transfers[0],l=s.lots.find(l=>l.id==='L-7001')
 assert.equal(t.allocations[0].expiry,l.expiry);assert.equal(l.quantity,35)
 assert.ok(s.lots.some(l=>l.expiry && l.expiry<today()))
 assert.ok(s.lots.some(l=>l.expiry>today()))
})
test('recepción crea y consolida misma clave compuesta, con auditoría',()=>{
 const before=initialState();let s=execute(before,receipt());s=execute(s,receipt())
 assert.equal(qty(s,'P01',loc),qty(before,'P01',loc)+6)
 assert.equal(s.lots.filter(l=>l.id==='NEW').length,1)
 assert.equal(s.movements[0].reference,'OC-TEST');assert.equal(s.movements[0].lotId,'NEW')
 assert.equal(s.movements[0].user,'Encargado');assert.equal(s.movements[0].after,6)
 assert.equal(qty(before,'P01',loc),58)
})
test('recepción sin trazabilidad no exige lote ni fecha',()=>{
 const s=execute(initialState(),receipt({productId:'P05',lotId:'',expiry:''}))
 const l=s.lots.find(l=>l.productId==='P05');assert.equal(l.id,'SIN-LOTE');assert.equal(l.expiry,'')
 assert.equal(available(s,'P05',loc),3)
})
test('recepción rechaza vencimiento pasado, fecha imposible, cantidad inválida, OC vacía y metadatos ambiguos',()=>{
 const s=initialState()
 for(const override of [{expiry:today()},{expiry:'2027-02-30'},{amount:-1},{amount:NaN},{reference:' '},{lotId:''}]) assert.throws(()=>execute(s,receipt(override)))
 assert.throws(()=>execute(s,receipt({lotId:'L-1001'})),/otro vencimiento/)
 assert.throws(()=>execute({...s,role:'Inventario'},receipt()),/requiere Encargado/)
})
test('venta aplica FEFO sobre varios lotes, excluye vencidos, bloqueos y reservas',()=>{
 const original=initialState();const s=execute(original,sale())
 assert.deepEqual(s.sales[0].allocations.map(a=>[a.lotId,a.quantity]),[['L-1001',18],['L-1002',2]])
 assert.equal(s.lots.find(l=>l.id==='L-VENC').quantity,8)
 assert.equal(s.lots.find(l=>l.id==='L-1002').quantity,30)
 assert.equal(qty(original,'P01',loc)-qty(s,'P01',loc),20)
 assert.equal(s.movements.filter(m=>m.reference==='POS-TEST').length,2)
})
test('ID POS es idempotente, rechaza cambio de payload y no duplica intento rechazado',()=>{
 let s=execute(initialState(),sale());assert.equal(execute(s,sale()),s)
 assert.throws(()=>execute(s,sale({amount:1})),/otros datos/)
 s=execute(s,sale({amount:999,saleId:'FAIL'}));const count=s.sales.length
 assert.equal(s.sales[0].fulfilled,false);const q=qty(s,'P01',loc)
 s=execute(s,sale({amount:999,saleId:'FAIL'}));assert.equal(s.sales.length,count);assert.equal(qty(s,'P01',loc),q)
 s=execute(s,receipt({amount:1000}));assert.equal(execute(s,sale({amount:999,saleId:'FAIL'})),s)
})
test('venta bloqueada jamás consume lote y permite vender artículo no trazable',()=>{
 const s=initialState();assert.equal(available(s,'P03',destination),0)
 const r=execute(s,sale({productId:'P03',location:destination,amount:1}));assert.equal(r.sales[0].fulfilled,false)
 const stocked=execute(s,receipt({productId:'P05',lotId:'',expiry:''}))
 assert.equal(available(execute(stocked,sale({productId:'P05',amount:2})),'P05',loc),1)
})
test('transferencia descuenta varios lotes al despacho y solo suma destino al recibir una vez',()=>{
 const before=initialState();let s=execute(before,{type:'dispatch',productId:'P01',origin:loc,destination,amount:20});const t=s.transfers[0]
 assert.equal(qty(s,'P01',loc),qty(before,'P01',loc)-20);assert.equal(qty(s,'P01',destination),0)
 assert.equal(t.allocations.length,2)
 s=execute(s,{type:'receiveTransfer',id:t.id});assert.equal(qty(s,'P01',destination),20)
 for(const a of t.allocations)assert.equal(s.lots.find(l=>l.location===destination&&l.id===a.lotId).expiry,a.expiry)
 assert.equal(execute(s,{type:'receiveTransfer',id:t.id}),s)
})
test('transferencia rechaza reserva, origen igual a destino y recepción antigua sin lotes',()=>{
 const s=initialState()
 assert.throws(()=>execute(s,{type:'dispatch',productId:'P01',origin:loc,destination,amount:49}),/insuficiente/)
 assert.throws(()=>execute(s,{type:'dispatch',productId:'P01',origin:loc,destination:loc,amount:1}),/diferentes/)
 s.transfers[0].allocations=[];assert.throws(()=>execute(s,{type:'receiveTransfer',id:'TR-001'}),/no se inventará/)
})
test('conteo negativo exige autorización, conserva reservas y registra ajuste',()=>{
 let s=execute(initialState(),{type:'count',productId:'P01',location:loc,physical:53,reason:'Reconteo físico'});const id=s.counts[0].id
 assert.throws(()=>execute(s,{type:'approve',id}),/Solo Inventario/)
 s=execute({...s,role:'Inventario'},{type:'approve',id})
 assert.equal(qty(s,'P01',loc),53);assert.equal(s.counts[0].status,'Aprobado');assert.equal(s.movements[0].reference,id)
 assert.ok(s.lots.every(l=>l.quantity>=l.reserved));assert.throws(()=>execute(s,{type:'approve',id}),/ya fue aprobado/)
})
test('Inventario no aprueba su propio ajuste; Administrador sí opera todos los flujos',()=>{
 const s=execute({...initialState(),role:'Inventario'},{type:'count',productId:'P01',location:loc,physical:58,reason:'Control'})
 assert.throws(()=>execute(s,{type:'approve',id:s.counts[0].id}),/propio ajuste/)
 assert.equal(execute({...s,role:'Administrador'},{type:'approve',id:s.counts[0].id}).counts[0].status,'Aprobado')
})
test('conteo obsoleto rechaza aunque saldo total coincida con un cambio entre lotes',()=>{
 let s=execute(initialState(),{type:'count',productId:'P01',location:loc,physical:58,reason:'Control'})
 s.lots[0].quantity--;s.lots[1].quantity++
 assert.throws(()=>execute({...s,role:'Inventario'},{type:'approve',id:s.counts[0].id}),/cambió/)
})
test('ajuste positivo conserva lote físico y fecha; jamás inventa vencimiento',()=>{
 let s=execute(initialState(),{type:'count',productId:'P01',location:loc,physical:60,reason:'Hallazgo físico'})
 assert.throws(()=>execute({...s,role:'Inventario'},{type:'approve',id:s.counts[0].id}),/lote físico/)
 s=execute(initialState(),{type:'count',productId:'P01',location:loc,physical:60,reason:'Hallazgo físico',lotId:'L-1001'})
 const expiry=s.lots[0].expiry;s=execute({...s,role:'Inventario'},{type:'approve',id:s.counts[0].id})
 assert.equal(qty(s,'P01',loc),60);assert.equal(s.lots[0].expiry,expiry)
})
test('ajuste negativo insuficiente es atómico y nunca crea lotes negativos',()=>{
 const counted=execute(initialState(),{type:'count',productId:'P01',location:loc,physical:0,reason:'Diferencia requiere revisión'})
 const before=JSON.stringify(counted)
 assert.throws(()=>execute({...counted,role:'Inventario'},{type:'approve',id:counted.counts[0].id}),/insuficiente/)
 assert.equal(JSON.stringify(counted),before)
})
test('alertas agregan disponible por producto/ubicación y se recalculan sin ocultar condiciones',()=>{
 let s=initialState();assert.ok(!alerts(s).some(a=>a.kind==='Stock bajo' && a.productId==='P01'&&a.location===loc))
 assert.ok(alerts(s).some(a=>a.kind==='Lote vencido'));assert.ok(alerts(s).some(a=>a.kind==='Lote bloqueado'));assert.ok(alerts(s).some(a=>a.kind==='Próximo a vencer'))
 s=execute(s,sale({amount:23}));assert.ok(alerts(s).some(a=>a.kind==='Stock bajo'&&a.productId==='P01'&&a.location===loc))
 s.alertDays=0;assert.ok(!alerts(s).some(a=>a.kind==='Próximo a vencer'))
 assert.ok(alerts(s).some(a=>a.kind==='Transferencia en tránsito'))
})
test('ABC deriva valor vendido local y clasifica productos sin ventas C',()=>{
 const s=execute(initialState(),sale());const rows=abc(s)
 assert.equal(rows[0].productId,'P01');assert.equal(rows[0].value,360);assert.equal(rows[0].cls,'A')
 assert.ok(rows.filter(x=>!x.value).every(x=>x.cls==='C'))
})
test('migración conserva maestros/movimientos y no inventa lotes para transferencias antiguas',()=>{
 const old=initialState();delete old.version;delete old.locations;delete old.sales;delete old.alertDays;delete old.replenishmentReviews;delete old.products[0].replenishment;delete old.transfers[0].allocations
 old.products[0].name='Maestro editado'
 const s=loadState(JSON.stringify(old));assert.equal(s.version,2);assert.equal(s.products[0].name,'Maestro editado');assert.equal(s.movements.length,old.movements.length)
 assert.equal(s.products[0].replenishment,50);assert.deepEqual(s.transfers[0].allocations,[])
 assert.throws(()=>execute(s,{type:'receiveTransfer',id:'TR-001'}),/antigua/)
})
test('persistencia round trip mantiene operaciones, rol y alertas configuradas',()=>{
 const s=execute({...initialState(),alertDays:12,role:'Administrador'},receipt())
 assert.deepEqual(loadState(JSON.stringify(s)),s)
 assert.equal(loadState(null).version,2);assert.equal(loadState('{corrupto').version,2)
})

test('código de lote repetido en otro producto o ubicación no altera su saldo',()=>{
 let s=initialState();const source=s.lots[0]
 s=execute(s,receipt({productId:'P02',lotId:source.id,expiry:source.expiry}))
 s=execute(s,receipt({location:central,lotId:source.id,expiry:source.expiry}))
 const before=s.lots.find(l=>l.productId==='P02'&&l.id===source.id).quantity
 s=execute(s,sale({amount:1}))
 assert.equal(s.lots.find(l=>l.productId==='P02'&&l.id===source.id).quantity,before)
 assert.equal(s.lots.find(l=>l.productId==='P01'&&l.id===source.id&&l.location===central).quantity,3)
})
test('ID POS coincide con propiedad de Object sin bloquear venta nueva',()=>{
 const s=execute(initialState(),sale({saleId:'toString',amount:1}))
 assert.equal(s.sales[0].id,'toString');assert.equal(s.sales[0].fulfilled,true)
})

test('saldo semilla se reconcilia con movimientos auditables por producto, ubicación y lote',()=>{
 const s=initialState()
 for(const lot of s.lots) {
  const audit=s.movements.filter(m=>m.productId===lot.productId&&m.location===lot.location&&m.lotId===lot.id)
  assert.equal(audit.reduce((sum,m)=>sum+m.quantity,0),lot.quantity)
  assert.ok(audit.every(m=>m.expiry===lot.expiry&&m.user&&m.reference))
 }
 for(const p of s.products)for(const location of s.locations)assert.equal(s.movements.filter(m=>m.productId===p.id&&m.location===location).reduce((sum,m)=>sum+m.quantity,0),qty(s,p.id,location))
})
