# Verificación de inventario local

Realizada el 22 de octubre de 2026. Fuente conceptual: informe suministrado, leído antes de modificar el proyecto. Plan previo: IMPLEMENTATION_PLAN.md. La sesión principal revisó tipos, motor, semillas, pruebas y MasterData aportados por los subagentes e integró las pantallas.

## Controles técnicos

- `npm run build`: aprobado (TypeScript + Vite).
- `npm test`: 21 pruebas aprobadas, ninguna fallida.
- `git diff --check`: aprobado.
- Revisión React: estado derivado para alertas/ABC/saldos; efectos limitados a persistencia y reloj con limpieza; claves compuestas para lotes; etiquetas de formularios, estado accesible y foco; sin nuevas dependencias.
- Corregido durante revisión: administración de lote identificaba solo código; ahora usa producto + ubicación + código y no afecta homónimos.
- Corregido durante revisión: las aperturas semilla ahora explican todos los saldos mediante movimientos; prueba de conciliación por lote y ubicación.
- Corregido durante prueba: recepción de mercadería y recepción de transferencia ahora tienen nombres de acción distintos.

## Casos ejecutados mediante navegador

| Caso | Evidencia observada |
| --- | --- |
| 1. Producto y punto de reorden | Administrador creó QA-LOCAL y editó punto de 10 a 12; guardado y visible. |
| 2. Recepción | 8 unidades de QA-LOCAL, CEDIS, QA-LOTE, OC-QA y fecha futura; saldo físico/disponible 8. También recepción de Alcohol no trazable sin pedir lote/fecha. |
| 3. Stock ubicado | Resumen de tres ubicaciones y detalle de QA-LOTE; después de transferencia conservó filas separadas en CEDIS y Cala Cala. |
| 4. Alertas | QA-LOCAL con 8 disponibles / punto 12 y vencimiento a 10 días produjo stock bajo y próxima caducidad; semillas muestran bloqueado/vencido/tránsito. |
| 5. Reposición | Sugerencia 20, revisión Administrador, mensaje explícito sin crear compra; condición permaneció. |
| 6. POS FEFO | Venta de Paracetamol, mismo ID repetido sin descuento adicional. Tras restablecer, venta de 20 mostró L-1001 (18) y L-1002 (2), con fechas originales. |
| 7. Transferencia | QA-LOCAL: despacho 3 dejó CEDIS 5 y destino 0; recepción dejó Cala Cala 3, mismo QA-LOTE y 2026-11-01. |
| 8. Conteo y ajuste | Encargado registró físico 4 frente a 5; aprobación bloqueada. Inventario aprobó −1; movimiento con lote, motivo, responsable y referencia al conteo. |
| 9. Recarga | Tras recargar, persistieron QA-LOCAL, punto 12, saldo CEDIS 4, Cala Cala 3, transferencia y auditoría. |
| 10. Restablecer | Acción de restablecimiento restauró diez productos, rol Encargado, semillas y tránsito original; recarga confirmó que QA-LOCAL ya no aparecía. |

Se inspeccionó visualmente la pantalla de existencias. El navegador quedó con semillas restablecidas, filtro Paracetamol y todas las ubicaciones. Las pruebas de dominio cubren además conflictos de lotes, reserva, fechas inválidas, idempotencia de rechazos, repetición de recepción de transferencias, conteo obsoleto, ajustes positivos/negativos atómicos, migración y persistencia.

## Contraste con el informe

RF-01 a RF-08 y RNF-01 a RNF-03 tienen cobertura local detallada en README. El proceso TO-BE conserva validaciones, actualización WMS, FEFO, alertas, apoyo a reposición/transferencias y trazabilidad. Los tres perfiles son los simplificados de la sección 2.5. Compras se representa mediante revisión por Administrador sin agregar un sistema de compras.

Pendientes de una futura implementación empresarial: integración con servicios reales, autenticación/identidad personal, concurrencia, pronóstico FastAPI, criticidad empresarial y medición financiera de merma. No se desplegaron ni simularon como activos. Transferencias del formato antiguo sin lotes verificables y ajustes negativos que necesitarían consumir vencidos/bloqueados/reservas quedan bloqueados con explicación. No se inventa trazabilidad faltante ni se borra su historia.

## Reorganización del frontend como ERP

Se verificó en navegador la navegación modular y el panel operativo, la separación de recepciones, Ventas POS y transferencias en pantallas propias, acceso a reposición, indicadores y maestros, y la ubicación de arquitectura/documentación/restablecimiento en Acerca del sistema. La etiqueta Simulación permanece visible; no se añadieron integraciones ni funcionalidades empresariales ficticias. El estado de inventario se conserva. Build y 21 pruebas del motor siguen aprobados.
