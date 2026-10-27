import type { ReactNode } from 'react'

const iconPaths: Record<string, ReactNode> = {
  inventory: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/></>,
  purchase: <><path d="M4 5h16v14H4zM8 9h8M8 13h8M8 17h5"/></>,
  sales: <><path d="M4 19h16M6 15l4-4 3 2 5-6M14 7h4v4"/></>,
  transfer: <><path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4"/></>,
  reports: <><path d="M4 20h16M6 17v-5M12 17V5M18 17V9"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19"/><circle cx="12" cy="12" r="8"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
  chevron: <path d="m6 9 6 6 6-6"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <path d="M6 6l12 12M18 6 6 18"/>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  cross: <path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>,
}
export default function Icon({name}: {name: string}) { return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg> }
