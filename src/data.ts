import type { State } from './types'

export const initialState = (): State => ({
  role: 'Encargado',
  products: [
    { id:'P01', name:'Paracetamol 500 mg', sku:'FAR-001', unit:'caja', threshold:25, price:18, lotTracked:true, category:'Analgésicos' },
    { id:'P02', name:'Ibuprofeno 400 mg', sku:'FAR-002', unit:'caja', threshold:20, price:31, lotTracked:true, category:'Antiinflamatorios' },
    { id:'P03', name:'Amoxicilina 500 mg', sku:'FAR-003', unit:'caja', threshold:15, price:48, lotTracked:true, category:'Antibióticos' },
    { id:'P04', name:'Vitamina C 1 g', sku:'FAR-004', unit:'tubo', threshold:18, price:27, lotTracked:true, category:'Vitaminas' },
    { id:'P05', name:'Alcohol en gel 500 ml', sku:'FAR-005', unit:'unidad', threshold:30, price:22, lotTracked:false, category:'Higiene' },
    { id:'P06', name:'Omeprazol 20 mg', sku:'FAR-006', unit:'caja', threshold:20, price:35, lotTracked:true, category:'Gastrointestinal' },
    { id:'P07', name:'Loratadina 10 mg', sku:'FAR-007', unit:'caja', threshold:12, price:24, lotTracked:true, category:'Antialérgicos' },
    { id:'P08', name:'Suero fisiológico 500 ml', sku:'FAR-008', unit:'unidad', threshold:25, price:15, lotTracked:false, category:'Insumos' },
    { id:'P09', name:'Protector solar FPS 50', sku:'FAR-009', unit:'unidad', threshold:10, price:68, lotTracked:true, category:'Dermocosmética' },
    { id:'P10', name:'Jeringa 5 ml', sku:'FAR-010', unit:'unidad', threshold:50, price:3, lotTracked:false, category:'Insumos' }
  ],
  lots: [
    {id:'L-1001',productId:'P01',location:'Sucursal Equipetrol',quantity:18,reserved:0,blocked:false,expiry:'2026-11-06'},
    {id:'L-1002',productId:'P01',location:'Sucursal Equipetrol',quantity:32,reserved:2,blocked:false,expiry:'2027-05-22'},
    {id:'L-2001',productId:'P02',location:'Sucursal Equipetrol',quantity:9,reserved:0,blocked:false,expiry:'2027-01-16'},
    {id:'L-2002',productId:'P02',location:'CEDIS Central',quantity:95,reserved:0,blocked:false,expiry:'2027-07-10'},
    {id:'L-3001',productId:'P03',location:'Sucursal Cala Cala',quantity:22,reserved:0,blocked:true,expiry:'2026-11-01'},
    {id:'L-3002',productId:'P03',location:'CEDIS Central',quantity:64,reserved:0,blocked:false,expiry:'2027-03-14'},
    {id:'L-4001',productId:'P04',location:'Sucursal Cala Cala',quantity:14,reserved:0,blocked:false,expiry:'2026-11-12'},
    {id:'L-6001',productId:'P06',location:'Sucursal Equipetrol',quantity:30,reserved:0,blocked:false,expiry:'2027-09-20'},
    {id:'L-7001',productId:'P07',location:'CEDIS Central',quantity:45,reserved:0,blocked:false,expiry:'2028-02-15'},
    {id:'L-9001',productId:'P09',location:'Sucursal Equipetrol',quantity:7,reserved:0,blocked:false,expiry:'2027-01-31'},
    {id:'L-VENC',productId:'P01',location:'Sucursal Equipetrol',quantity:8,reserved:0,blocked:false,expiry:'2026-09-01'}
  ],
  movements: [
    {id:'M-001',type:'Recepción de compra',productId:'P01',location:'Sucursal Equipetrol',quantity:50,date:'2026-10-01',user:'María Encargada',reference:'OC-2026-041',note:'Datos ficticios'},
    {id:'M-002',type:'Venta POS simulada',productId:'P02',location:'Sucursal Equipetrol',quantity:-11,date:'2026-10-14',user:'Adaptador POS',reference:'POS-HIST-001',note:'FEFO aplicado'}
  ],
  transfers:[{id:'TR-001',productId:'P07',quantity:10,origin:'CEDIS Central',destination:'Sucursal Cala Cala',status:'En tránsito',date:'2026-10-17'}],
  counts:[], processedSales:{ }
})
