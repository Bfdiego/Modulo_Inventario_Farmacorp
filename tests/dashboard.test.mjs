import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const output = mkdtempSync(join(tmpdir(), 'farmacorp-dashboard-'))
execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), 'src/dashboardModel.ts', 'src/types.ts', '--ignoreConfig', '--outDir', output, '--module', 'commonjs', '--target', 'ES2022', '--strict', '--skipLibCheck'], {stdio:'pipe'})
const { defaultFilters, branches, departments, compatibleBranches, validateFilters, queryDashboard } = createRequire(import.meta.url)(join(output, 'dashboardModel.js'))
after(() => rmSync(output, {recursive:true, force:true}))
const branch = 'Sucursal Equipetrol'
const filters = {from:'2026-01-01', to:'2026-01-10', region:'Llanos', department:'Santa Cruz'}
const state = () => ({ locations:[branch,'CEDIS Central','Otra'], products:[{id:'P',name:'Producto',threshold:10},{id:'Q',name:'Sin ventas',threshold:1}], lots:[{id:'L',productId:'P',location:branch,quantity:25,reserved:5,blocked:false,expiry:'2026-02-01'},{id:'B',productId:'P',location:branch,quantity:100,reserved:0,blocked:true,expiry:'2026-02-01'},{id:'E',productId:'P',location:branch,quantity:100,reserved:0,blocked:false,expiry:'2026-01-15'}], sales:[{id:'1',productId:'P',location:branch,quantity:5,date:'2026-01-01T10:00:00Z',fulfilled:true},{id:'2',productId:'P',location:branch,quantity:5,date:'2026-01-10',fulfilled:true},{id:'3',productId:'P',location:branch,quantity:99,date:'2026-01-11',fulfilled:true},{id:'4',productId:'P',location:branch,quantity:99,date:'2026-01-03',fulfilled:false}], counts:[] })
test('default period is 30 inclusive days and rejects impossible dates', () => {
 assert.deepEqual(defaultFilters('2026-03-01'), {from:'2026-01-31',to:'2026-03-01',region:'',department:''})
 assert.ok(validateFilters({...filters,from:'2026-02-30'})); assert.ok(validateFilters({...filters,from:'2026-01-11'}))
})
test('geographic context uses existing branch ids and validates dependencies', () => {
 const s=state(); assert.equal(branches(s)[1].label,'La Paz · CEDIS Central'); assert.equal(branches(s)[2].region,'Sin clasificar')
 assert.deepEqual(departments('Llanos'),['Santa Cruz']); assert.deepEqual(compatibleBranches(s,filters).map(b=>b.id),[branch])
 assert.ok(validateFilters({...filters,department:'La Paz'}))
})
test('inclusive sales affect projection, while current eligible stock and expiry do not depend on period', () => {
 const s=state(), before=structuredClone(s), result=queryDashboard(s,branch,filters,'2026-01-20',10)
 const p=result.products.find(x=>x.id==='P'), q=result.products.find(x=>x.id==='Q')
 assert.equal(result.periodDays,10); assert.equal(result.consumptionUnits,10); assert.equal(p.stock,20); assert.equal(p.dailyConsumption,1); assert.equal(p.daysToRop,10); assert.equal(p.status,'soon')
 assert.equal(q.dailyConsumption,null); assert.equal(q.status,'reorder'); assert.deepEqual(result.expiring.map(x=>[x.id,x.units,x.days]),[['L',20,12]])
 const second=queryDashboard(s,branch,{...filters,from:'2026-01-02'},'2026-01-20',10)
 assert.equal(second.products.find(x=>x.id==='P').stock,20); assert.equal(second.consumptionUnits,5); assert.deepEqual(s,before)
})
test('undated counts are not invented and dated approved records are partial', () => {
 const s=state(); s.counts=[{id:'C',location:branch,status:'Aprobado',system:3,physical:3}]
 assert.equal(queryDashboard(s,branch,filters,'2026-01-20').count,null)
 s.counts[0].approvedAt='2026-01-10T12:00:00Z'
 assert.deepEqual(queryDashboard(s,branch,filters,'2026-01-20').count,{date:'2026-01-10',accuracy:100,total:1,exact:1,complete:false})
})

test('latest dated approved record within inclusive boundaries is selected; pending and undated records are excluded', () => {
 const s=state(); s.counts=[
  {id:'first',location:branch,status:'Aprobado',system:2,physical:2,approvedAt:'2026-01-01'},
  {id:'last',location:branch,status:'Aprobado',system:3,physical:2,approvedAt:'2026-01-10T08:00:00Z'},
  {id:'pending',location:branch,status:'Pendiente',system:3,physical:3,approvedAt:'2026-01-10'},
  {id:'undated',location:branch,status:'Aprobado',system:3,physical:3},
  {id:'outside',location:branch,status:'Aprobado',system:3,physical:3,approvedAt:'2026-01-11'}
 ]
 assert.deepEqual(queryDashboard(s,branch,filters,'2026-01-20').count,{date:'2026-01-10',accuracy:0,total:1,exact:0,complete:false})
})
test('timestamps use the Bolivia business date and latest approval instant', () => {
 const s=state(); s.sales=[{productId:'P',location:branch,quantity:4,date:'2026-10-28T02:00:00Z',fulfilled:true}]
 s.counts=[{id:'older',location:branch,status:'Aprobado',system:1,physical:1,approvedAt:'2026-10-28T01:00:00Z'},{id:'newer',location:branch,status:'Aprobado',system:1,physical:0,approvedAt:'2026-10-28T02:00:00Z'}]
 const f={...filters,from:'2026-10-27',to:'2026-10-27'}; const r=queryDashboard(s,branch,f,'2026-10-27')
 assert.equal(r.consumptionUnits,4); assert.equal(r.count.date,'2026-10-27'); assert.equal(r.count.accuracy,0)
})
test('threshold equality and 90-day expiry boundary respect eligible stock', () => {
 const s=state(); s.sales=[]; s.products[0].unit='caja'; s.lots=[
  {id:'90',productId:'P',location:branch,quantity:12,reserved:2,blocked:false,expiry:'2026-04-01'},
  {id:'91',productId:'P',location:branch,quantity:1,reserved:1,blocked:false,expiry:'2026-04-02'},
  {id:'blocked',productId:'P',location:branch,quantity:99,reserved:0,blocked:true,expiry:'2026-02-01'},
  {id:'expired',productId:'P',location:branch,quantity:99,reserved:0,blocked:false,expiry:'2026-01-01'}]
 const r=queryDashboard(s,branch,filters,'2026-01-01'); const p=r.products.find(x=>x.id==='P')
 assert.equal(p.stock,10); assert.equal(p.status,'reorder'); assert.equal(p.dailyConsumption,null)
 assert.deepEqual(r.expiring.map(x=>[x.id,x.days,x.units,x.unit]),[['90',90,10,'caja']])
 s.lots[1].reserved=0; assert.deepEqual(queryDashboard(s,branch,filters,'2026-01-01').expiring.map(x=>x.id),['90'])
})
