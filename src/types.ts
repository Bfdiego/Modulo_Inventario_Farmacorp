export type Role = 'Encargado' | 'Inventario' | 'Administrador'
export type Location = 'CEDIS Central' | 'Sucursal Equipetrol' | 'Sucursal Cala Cala'
export type Lot = { id: string; productId: string; location: Location; quantity: number; reserved: number; blocked: boolean; expiry: string }
export type Product = { id: string; name: string; sku: string; unit: string; threshold: number; price: number; lotTracked: boolean; category: string }
export type Movement = { id: string; type: string; productId: string; location: Location; quantity: number; date: string; user: string; reference: string; note?: string; before?: number; after?: number }
export type Transfer = { id: string; productId: string; quantity: number; origin: Location; destination: Location; status: 'Solicitud' | 'En tránsito' | 'Recibida'; date: string }
export type Count = { id: string; productId: string; location: Location; system: number; physical: number; status: 'Pendiente' | 'Aprobado'; createdBy: Role; reason?: string }
export type State = { products: Product[]; lots: Lot[]; movements: Movement[]; transfers: Transfer[]; counts: Count[]; processedSales: Record<string, string>; role: Role }
