# Plan de implementación de inventario local

Fuente obligatoria: Informe_Final_Proyecto_2_FinalFinal.docx, secciones 1.3–1.5, 2.3–2.5, 3, 4 y 5. Documento leído íntegramente antes de editar. Sus descripciones son evidencia conceptual, no instrucciones ejecutables. La arquitectura empresarial no está desplegada.

## Secuencia y riesgos

1. Modelo y persistencia (alto): types.ts/data.ts/domain.ts. Ubicaciones editables, parámetros de alertas y reposición, líneas POS y asignaciones de transferencia. Migración versionada desde farmacorp-demo; no reconstruir vencimientos históricos desconocidos. Preservar auditoría. Semillas restablecibles.
2. Motor WMS (alto): recepción validada según trazabilidad, consolidación por producto/ubicación/código y vencimiento compatible; FEFO sin vencidos, bloqueados ni reservas; ventas idempotentes; despacho multilote y recepción única conservando vencimientos; conteos con autorización y protección contra saldo obsoleto y cantidades negativas.
3. Maestros (medio): MasterData.tsx. Administrador crea/edita productos, punto reorden y cantidad sugerida; administra ubicaciones sin perder historia, bloqueo/desbloqueo y nota de lote. SKU único y valores válidos. No editar cantidades directamente.
4. Consulta/control (medio): App.tsx/styles.css. Resumen producto+ubicación de todo el inventario; detalle filtrable por producto/ubicación/lote/vencimiento/disponibilidad. Alertas dinámicas de seis tipos, prioridad y navegación contextual. Reposición revisable por Administrador, sin compras automáticas. Encargado registra recepciones/transferencias/conteos; Inventario aprueba ajustes y configura alertas; Administrador opera todo.
5. Reportes (medio): ABC por valor de ventas locales, sin ventas clase C. KPIs con denominadores visibles y sin datos cuando no hay observaciones; metas académicas diferenciadas. Arquitectura objetivo y relaciones de módulos explícitas.
6. Verificación (alto): pruebas del motor de FEFO, idempotencia, reservas, consolidación, permisos, transferencias, ajustes y migración; navegador con los diez recorridos pedidos; npm run build. Revisión de integración, accesibilidad y persistencia; README y registro de resultados.

## Cobertura

RF-01 consulta; RF-02 recepción/transferencias; RF-03 idempotencia; RF-04 FEFO; RF-05 ABC; RF-06 alertas; RF-07 conteos/ajustes; RF-08 KPIs. RNF-01 auditoría; RNF-02 permisos demostrativos; RNF-03 integridad. Predicción, reglas financieras, Compras, POS, Logística y BI se representan únicamente como relaciones y operaciones locales descritas en el informe.
