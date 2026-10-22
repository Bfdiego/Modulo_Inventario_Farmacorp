import type { State } from './types'

const date = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

export const initialState = (): State => {
  const state: State = {
  version: 2, locations: ['CEDIS Central', 'Sucursal Equipetrol', 'Sucursal Cala Cala'], alertDays: 30, sales: [], replenishmentReviews: {},
  role: 'Encargado',
  products: [
    { id:'P01', name:'Paracetamol 500 mg', sku:'FAR-001', unit:'caja', threshold:25, replenishment:50, price:18, lotTracked:true, category:'Analgésicos' },
    { id:'P02', name:'Ibuprofeno 400 mg', sku:'FAR-002', unit:'caja', threshold:20, replenishment:40, price:31, lotTracked:true, category:'Antiinflamatorios' },
    { id:'P03', name:'Amoxicilina 500 mg', sku:'FAR-003', unit:'caja', threshold:15, replenishment:30, price:48, lotTracked:true, category:'Antibióticos' },
    { id:'P04', name:'Vitamina C 1 g', sku:'FAR-004', unit:'tubo', threshold:18, replenishment:36, price:27, lotTracked:true, category:'Vitaminas' },
    { id:'P05', name:'Alcohol en gel 500 ml', sku:'FAR-005', unit:'unidad', threshold:30, replenishment:60, price:22, lotTracked:false, category:'Higiene' },
    { id:'P06', name:'Omeprazol 20 mg', sku:'FAR-006', unit:'caja', threshold:20, replenishment:40, price:35, lotTracked:true, category:'Gastrointestinal' },
    { id:'P07', name:'Loratadina 10 mg', sku:'FAR-007', unit:'caja', threshold:12, replenishment:24, price:24, lotTracked:true, category:'Antialérgicos' },
    { id:'P08', name:'Suero fisiológico 500 ml', sku:'FAR-008', unit:'unidad', threshold:25, replenishment:50, price:15, lotTracked:false, category:'Insumos' },
    { id:'P09', name:'Protector solar FPS 50', sku:'FAR-009', unit:'unidad', threshold:10, replenishment:20, price:68, lotTracked:true, category:'Dermocosmética' },
    { id:'P10', name:'Jeringa 5 ml', sku:'FAR-010', unit:'unidad', threshold:50, replenishment:100, price:3, lotTracked:false, category:'Insumos' }
  ],
  lots: [
    {id:'L-1001',productId:'P01',location:'Sucursal Equipetrol',quantity:18,reserved:0,blocked:false,expiry:date(15)},
    {id:'L-1002',productId:'P01',location:'Sucursal Equipetrol',quantity:32,reserved:2,blocked:false,expiry:date(212)},
    {id:'L-2001',productId:'P02',location:'Sucursal Equipetrol',quantity:9,reserved:0,blocked:false,expiry:date(86)},
    {id:'L-2002',productId:'P02',location:'CEDIS Central',quantity:95,reserved:0,blocked:false,expiry:date(261)},
    {id:'L-3001',productId:'P03',location:'Sucursal Cala Cala',quantity:22,reserved:0,blocked:true,expiry:date(10)},
    {id:'L-3002',productId:'P03',location:'CEDIS Central',quantity:64,reserved:0,blocked:false,expiry:date(143)},
    {id:'L-4001',productId:'P04',location:'Sucursal Cala Cala',quantity:14,reserved:0,blocked:false,expiry:date(21)},
    {id:'L-6001',productId:'P06',location:'Sucursal Equipetrol',quantity:30,reserved:0,blocked:false,expiry:date(333)},
    {id:'L-7001',productId:'P07',location:'CEDIS Central',quantity:35,reserved:0,blocked:false,expiry:date(481)},
    {id:'L-9001',productId:'P09',location:'Sucursal Equipetrol',quantity:7,reserved:0,blocked:false,expiry:date(101)},
    {id:'L-VENC',productId:'P01',location:'Sucursal Equipetrol',quantity:8,reserved:0,blocked:false,expiry:date(-51)}
  ],
  movements: [
    {id:'M-002',type:'Despacho de transferencia',productId:'P07',location:'CEDIS Central',quantity:-10,date:date(-5),user:'Encargado',reference:'TR-001',note:'Semilla ficticia: L-7001 en tránsito',lotId:'L-7001',expiry:date(481),before:45,after:35}
  ],
  transfers:[{id:'TR-001',productId:'P07',quantity:10,origin:'CEDIS Central',destination:'Sucursal Cala Cala',status:'En tránsito',date:date(-5),allocations:[{lotId:'L-7001',expiry:date(481),quantity:10}]}],
  counts:[], processedSales:{ }
  }
  // Cada saldo de apertura tiene origen auditable; el despacho ya descontó 10 de L-7001.
  const openings = state.lots.map((lot, index) => {
    const quantity = lot.quantity + (lot.id === 'L-7001' ? 10 : 0)
    return {
      id: `APERTURA-${index + 1}`, type: 'Saldo inicial de prueba',
      productId: lot.productId, location: lot.location, lotId: lot.id, expiry: lot.expiry,
      quantity, date: date(-60), user: 'Administrador · datos ficticios',
      reference: 'SEMILLA-LOCAL', note: 'Apertura ficticia restablecible de la demo académica',
      before: 0, after: quantity
    }
  })
  state.movements.push(...openings)
  return state
}
