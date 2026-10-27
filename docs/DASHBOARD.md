# Dashboard de inventario

Implementación en el proyecto React existente. `DashboardConFiltro.md` se trató como especificación de producto y las tres imágenes como referencia visual. No se utilizó Figma ni se instalaron dependencias.

## Integración y dirección visual

`App.tsx` conserva los módulos existentes y muestra el dashboard en Resumen. `InventoryDashboard.tsx` contiene la pantalla y sus interacciones; `dashboardModel.ts`, las consultas puras; `dashboard.css`, los estilos acotados a la nueva pantalla. Se conservan las cuatro filas: tres indicadores, gráfico horizontal, dos tarjetas de conteos y acciones prioritarias.

La composición usa navegación azul marino, superficies blancas sobre gris claro, tipografía Arial según la apariencia de las referencias, bordes finos y estados rojo, ámbar y verde. Los tokens principales están centralizados en `.inventory-shell`. El panel de filtros es absoluto y no tiene backdrop. Solo la ventana modal de vencimientos oscurece el fondo. A 768 px la navegación se vuelve horizontal; a 360 px las tarjetas se apilan. El gráfico mantiene todos los productos en una región desplazable de altura compacta; la tabla de lotes permite desplazamiento horizontal con teclado.

Se aplicó `frontend-design-workflow`, con `react-best-practices` para revisión de componentes y `verification` para recorrer el flujo. Las skills del catálogo `interface-design`, `design-system` e `impeccable` no estaban disponibles y no se instalaron. Tres subagentes `gpt-6.1-terra` trabajaron en archivos separados: modelo y pruebas, componente, y CSS. El agente principal realizó integración, cambios de trazabilidad, accesibilidad, pruebas y revisión visual.

## Contratos de datos y límites

- Se reutilizan productos, lotes, reservas, ventas y conteos de la demo, sin reemplazar las operaciones guardadas. Todas las cifras siguen siendo simuladas. Por ello las cantidades difieren de las imágenes de referencia.
- Stock disponible: saldo menos reservas de lotes no bloqueados y no vencidos, con las mismas reglas del módulo de existencias. Un vencimiento igual al día actual ya no es elegible, como establece el dominio existente.
- Reordenar: stock disponible ≤ ROP configurado (`Product.threshold`). Próximo a reorden: stock > ROP y `(stock − ROP) / consumo diario ≤ anticipación`. La anticipación puede ajustarse entre 1 y 365 días en Contexto del cálculo.
- Consumo diario: ventas atendidas de la sucursal en el rango inclusivo dividido por los días inclusivos. Sin ventas registradas no se inventa una proyección; se explica en Contexto del cálculo.
- El ROP permanece actual. La fórmula requerida se explica en la interfaz, pero no se recalcula con supuestos: los maestros existentes no tienen lead time ni stock de seguridad.
- Los lotes de vencimientos corresponden al estado actual, dentro de los próximos 90 días, y su detalle reconcilia las unidades elegibles. Cambiar el período no reconstruye saldos ni vencimientos históricos.
- Las nuevas aprobaciones explícitas guardan `Count.approvedAt`. Los conteos antiguos sin fecha no se atribuyen a un período. El dominio registra un producto por conteo y no agrupa sesiones; el dashboard muestra el último registro aprobado fechado como conteo parcial, con denominador visible de un registro. No representa una auditoría completa de sucursal.
- Las fechas con hora se convierten al día de Bolivia (`America/La_Paz`); las fechas sin hora conservan su día.
- Equipetrol se asocia a Santa Cruz/Llanos y Cala Cala a Cochabamba/Valles. La asociación de CEDIS Central a La Paz/Altiplano es una configuración simulada, ya que el maestro original no conserva geografía. Ubicaciones nuevas quedan Sin clasificar hasta completar ese catálogo.
- Aplicar valida fechas, dependencias y sucursal, y confirma contexto/sucursal conjuntamente. Cambiar el contexto no sustituye automáticamente la sucursal. Limpiar restaura rango y contexto iniciales y conserva la sucursal aplicada. Cerrar descarta el borrador.
- Los accesos a reposición, productos/lotes y conteos solo navegan. Compras, transferencias y ajustes mantienen su revisión/autorización explícita en los módulos existentes.
- Las consultas son locales y síncronas: no hay petición remota ni estado artificial de carga. Se muestran errores de validación y vacíos reales; los errores de persistencia conservan el aviso existente.

## Verificación reproducible

`npm test` ejecuta las pruebas de dominio y del modelo del dashboard. `npm run build` comprueba TypeScript y genera el paquete Vite.

`tests/dashboard.browser.mjs` usa Playwright y Chrome ya disponibles en el entorno, con perfil temporal, hora de Bolivia y movimiento reducido. No instala navegadores ni paquetes. Para ejecutarlo, iniciar el servidor local y proporcionar `PLAYWRIGHT_MODULE` si Playwright no está resoluble en el proyecto. `DASHBOARD_URL` permite cambiar la URL; `DASHBOARD_SCREENSHOTS`, la carpeta de capturas.

En esta revisión se utilizó el Playwright incluido en el runtime de Codex y Chrome instalado. Se comprobaron 360, 768, 1280 y 1920 px; en cada ancho se capturaron e inspeccionaron pantalla principal, filtros, sucursal y vencimientos. Las comprobaciones incluyen ausencia de desbordamiento de página, ausencia de desplazamiento al abrir filtros, rango inválido, departamentos dependientes, incompatibilidad de sucursal, aplicación conjunta, limpieza, cierre exterior/Escape, foco y ciclo Tab del diálogo, enlaces a producto/lote/módulos, conteos vacíos y una aprobación explícita con permisos. Se revisaron los estilos de foco y movimiento reducido. El producto no ofrece un tema oscuro.

Las pruebas de navegador utilizan su propio localStorage y no alteran el navegador habitual del usuario. Las capturas se guardan fuera del repositorio, inicialmente en `/tmp/farmacorp-dashboard-review`, y se copian al directorio de artefactos de esta conversación.


Resultado final del 27 de octubre de 2026: 28 pruebas aprobadas, `npm run build` correcto y `git diff --check` sin errores. La prueba completa de Chrome pasó. Además se registró una venta FEFO aislada de 20 cajas de Paracetamol: disponible 48 → 28, próximos a reorden 0 → 1 y lotes próximos a vencer 2 → 1, con el mismo ROP actual 25. Se capturó e inspeccionó ese resultado y el estado del conteo aprobado. No se hizo push ni despliegue.
