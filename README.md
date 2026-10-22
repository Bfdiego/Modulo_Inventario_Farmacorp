# Módulo de Inventario Farmacorp — demo académica local

React + TypeScript + Vite. Fuente funcional y conceptual: `Informe_Final_Proyecto_2_FinalFinal.docx`, secciones 1–5. Los datos son ficticios y las operaciones se ejecutan dentro del navegador. WMS es el responsable de modificar existencias. El plan previo a la implementación está en `IMPLEMENTATION_PLAN.md`.

## Ejecución y verificación

```bash
npm install
npm run dev
npm test
npm run build
```

`npm test` compila temporalmente el motor TypeScript y ejecuta pruebas con `node:test`, sin backend ni dependencias de pruebas adicionales. Use una versión de Node compatible con la versión de Vite instalada.

## Funciones y cobertura del informe

- **RF-01 / Existencias:** resumen de todas las ubicaciones por producto, físico, reservado, disponible elegible y punto de reorden; detalle con SKU, ubicación exacta, lote, vencimiento y estado. Filtros por ubicación, producto, lote, vencimiento máximo, estado y disponibilidad. Los filtros de fecha/lote afectan el detalle; los totales agregados siguen mostrando todo el producto por ubicación.
- **RF-02 / Recepción:** OC requerida, cantidad positiva, producto y ubicación existentes. Un producto trazable requiere lote y vencimiento futuro; uno no trazable se almacena como `SIN-LOTE`, sin vencimiento. La misma clave producto + ubicación + código consolida cantidades solo con vencimiento compatible; conflictos se rechazan. Cada entrada genera auditoría.
- **RF-02 / Logística local:** despacho FEFO de uno o varios lotes, tránsito y recepción explícita. El destino aumenta únicamente al recibir, conservando códigos y vencimientos originales; recibir otra vez no duplica. Un lote que vence durante el tránsito se recibe con su fecha original y queda no disponible con alerta.
- **RF-03 / POS local:** cada ID identifica una línea solicitada. Se conserva éxito o rechazo por saldo insuficiente. Repetir el mismo ID y datos no descuenta ni aumenta el denominador del KPI; cambiar sus datos se rechaza. Tras un rechazo, reponer y usar un ID nuevo para una nueva solicitud.
- **RF-04 / FEFO:** consume lotes elegibles por vencimiento ascendente; excluye bloqueados, vencidos (incluido el día de vencimiento) y reservas. Los no trazables no necesitan vencimiento. El mensaje POS muestra todos los lotes asignados; cada lote genera un movimiento con cantidad, fecha, responsable, referencia y saldo antes/después.
- **RF-05 / ABC:** valor vendido local = unidades de movimientos POS × precio de referencia actual, orden descendente; A hasta alcanzar 80 %, B hasta 95 %, C restante; sin ventas, C. No son ventas ni clases reales de Farmacorp.
- **RF-06 / Alertas:** stock disponible agregado por producto + ubicación menor o igual al punto; lotes próximos, vencidos y bloqueados; transferencias en tránsito y conteos con diferencias pendientes. Ventana de vencimiento configurable/persistida. Cada alerta identifica condición, prioridad, ubicación y acción. Revisar sugerencias no oculta condiciones vigentes.
- **Reposición:** sugerencia local = máximo de cantidad configurada y punto + 1 − disponible. Administrador representa a Compras/Abastecimiento y registra su revisión humana. Nunca crea una compra automática ni ejecuta un pronóstico.
- **RF-07 / Conteos:** conteo físico total y motivo, diferencia pendiente y aprobación. Una diferencia positiva trazable necesita lote y vencimiento físico, sin inventar fechas. Una negativa consume lotes elegibles sin tocar reservas ni crear cantidades negativas; si no alcanza, se rechaza y exige revisión. Si cambian lotes/saldos desde contar, se exige un nuevo conteo. El historial conserva pendientes y aprobados.
- **RF-08 / Reportes:** exactitud = aprobados sin diferencia / aprobados; disponibilidad = líneas POS únicas atendidas / solicitadas. Aproximación local de merma = unidades de ajustes negativos / entradas registradas, incluidas aperturas y recepciones de transferencia. La aproximación incluye cualquier motivo de ajuste y no mide merma específica por vencimiento. Sin denominador: “Sin datos”. Metas de referencia separadas: exactitud ≥ 95 %, disponibilidad de críticos ≥ 80 %, merma por vencimiento ≤ 1,89 % frente a base académica 2,10 %. La demo no define productos críticos ni presenta sus resultados como medición empresarial.
- **Datos maestros:** crear/editar productos, SKU único sin distinción de mayúsculas, unidad, categoría, precio de referencia, trazabilidad, punto de reorden y cantidad sugerida. No cambia trazabilidad con historial. Crear ubicaciones; renombrar/eliminar solo sin referencias históricas. Bloquear/desbloquear lotes y editar notas conserva cantidades y genera un movimiento administrativo de cantidad cero.

## Roles de demostración — RNF-02

| Rol | Acciones |
| --- | --- |
| Encargado | Consulta, venta POS local, recepción, despacho/recepción de transferencia y conteos; no aprueba ajustes ni administra maestros. |
| Inventario | Consulta, venta POS local, conteos, parámetros de alertas y aprobación de conteos de otro perfil; no confirma compras/transferencias ni edita maestros. |
| Administrador | Todos los flujos, datos maestros y revisión de sugerencias representando Compras. Puede aprobar conteos propios en el entorno demostrativo. |

La identidad del responsable es el perfil seleccionado; no hay cuentas personales ni autenticación. Los permisos son reglas de interfaz/motor demostrativas, no seguridad productiva.

## Persistencia, integridad y restablecimiento — RNF-01 / RNF-03

Estado versionado (`version: 2`) en `localStorage`, clave `farmacorp-demo`. Persisten maestros, lotes, reservas iniciales, movimientos, ventas únicas, transferencias, conteos, revisión de reposición, ventana y rol. Recargar conserva operaciones; no existe sincronización entre dispositivos o pestañas ni soporte de concurrencia. Un fallo al escribir localStorage produce un mensaje visible.

Se migra el formato anterior manteniendo maestros e historial y agregando parámetros faltantes. Duplicados de lote con metadatos idénticos se consolidan; los ambiguos bloquean nuevas consolidaciones. Transferencias antiguas sin asignaciones de lotes no pueden recibirse: no se reconstruyen vencimientos desconocidos. Los errores históricos no se reescriben como operaciones verificadas. Un JSON ilegible o estructura esencial ausente carga semillas: este navegador no es un sistema de respaldo.

**Acerca del sistema → Restablecer datos de prueba** pide confirmación y sustituye únicamente el estado local por semillas ficticias. Sus vencimientos son relativos al día del restablecimiento, para conservar casos próximos y vencidos. Las aperturas de prueba y el despacho inicial explican los saldos de semillas; las aperturas no son compras reales. Las reservas son datos del escenario, sin flujo independiente de reservas POS en este alcance.

## Recorrido funcional reproducible

1. Elegir Administrador → Administración → Datos maestros → crear producto `DEMO-001`, nombre/unidad/categoría, control de lote sí, punto 12 y sugerencia 20. Editar punto a 15 y guardar.
2. Inventario → Recepciones → recepción de ese producto, CEDIS Central, 8 unidades, lote `DEMO-L1`, fecha futura dentro de 30 días y referencia `OC-DEMO-1`. Repetir 2 unidades con los mismos metadatos: se consolida, saldo 10. Probar también un producto no trazable sin lote/fecha.
3. Existencias → seleccionar producto, mantener todas las ubicaciones. Ver saldo 10 en CEDIS y detalle `DEMO-L1`; comprobar filtros de lote, fecha y disponibilidad.
4. Inventario → Alertas y conteos → verificar alertas de stock bajo y próximo a vencer para el producto. Cambiar ventana con Administrador/Inventario; no elimina alertas vencidas o bloqueadas.
5. Compras → Reposición → revisar recomendación y marcar revisión con Administrador. Ver que no crea compra ni cambia saldo y sigue visible mientras haya stock bajo.
6. Ventas → Ventas POS → venta de Paracetamol en Equipetrol, ID `POS-DEMO-1`, cantidad 20. Semillas asignan L-1001 (18) y L-1002 (2). Repetir exactamente: no duplica. Revisar mensaje y movimientos por lote.
7. Transferir 3 unidades del producto nuevo de CEDIS a Cala Cala. Antes de recibir, origen baja a 7 y destino permanece en 0; confirmar recepción y comprobar destino 3, lote `DEMO-L1`, misma fecha.
8. En Inventario → Alertas y conteos, como Encargado registrar conteo del producto en CEDIS, físico 6 y motivo. Intentar aprobar: bloqueado. Elegir Inventario y aprobar; saldo 6 y movimiento −1 con referencia al conteo. Intentar aprobar de nuevo: rechazado.
9. Recargar: comprobar producto, punto, saldos, transferencia recibida, ajuste aprobado y auditoría. Revisar Reportes con denominadores y metas separados.
10. Restablecer datos de prueba y confirmar: vuelven diez productos y los lotes semilla, sin las operaciones del recorrido; recargar mantiene las semillas restablecidas.

## Arquitectura y límites conscientes

`src/domain.ts` concentra cálculos y operaciones de existencias; `src/types.ts` define entidades; `src/data.ts` genera semillas; `src/App.tsx` contiene navegación y pantallas; `src/MasterData.tsx` administra maestros; `src/styles.css` conserva el lenguaje visual.

Compras solicita recepciones; Ventas/POS solicita salidas; Logística solicita despachos/recepciones; Reportes consume datos. Administración mantiene maestros. Predicción se representa solo mediante reposición reglada con revisión humana; reglas financieras se limitan a precio y valor de referencia para ABC.

Arquitectura objetivo informativa: React web, React Native móvil, Spring Boot, PostgreSQL, RabbitMQ, Redis, Keycloak, FastAPI, AWS; Power BI consumiría consultas gobernadas. Contratos previstos: REST/HTTPS + JSON, JDBC/SQL, outbox/RabbitMQ mediante AMQP y SQL/TLS para BI. **No existe conexión real con Farmacorp, POS, Compras, Logística ni ninguno de estos servicios.** No hay backend, broker, caché, autenticación, pronóstico, contabilidad ni compras productivas simulados como activos.

La merma financiera, criticidad empresarial, integraciones y validación operativa real quedan pendientes para una futura implementación, según el informe. En esta demo, ajustes sobre vencidos/bloqueados o reservas se rechazan si exigen consumir saldo inelegible; requieren revisión del escenario, sin inventar una salida adicional fuera del flujo definido.

## Navegación del ERP

La aplicación inicia en **Inventario → Resumen**, con saldos por ubicación, indicadores operativos, accesos de recepción/venta/transferencia/conteo y cinco alertas prioritarias. La barra lateral agrupa los procesos por módulo: Inventario (existencias, recepciones, movimientos y control), Compras (reposición), Ventas (POS), Logística (transferencias), Reportes (indicadores) y Administración (maestros). Estos grupos organizan los flujos del inventario ya implementados, sin agregar servicios empresariales ni procesos ajenos al informe.

La interfaz operativa utiliza textos de trabajo, sin mensajes académicos permanentes. La etiqueta discreta **Simulación** identifica el entorno. **Acerca del sistema**, al pie de la navegación, concentra contexto académico, fórmulas y límites de indicadores, arquitectura objetivo, integraciones y restablecimiento del escenario. El selector **Perfil activo** conserva los mismos permisos; la persistencia y las reglas de inventario no cambian.
