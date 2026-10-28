# Inventario Farmacorp local

React + TypeScript + Vite, API Java 21 / Spring Boot 3.5.7 y PostgreSQL 17.6. Aplicación académica con persistencia y autenticación reales: las cuentas y los datos se guardan en PostgreSQL; el servidor valida permisos y es el único escritor de existencias. Los productos semilla son ficticios. No hay conexión con Farmacorp ni con un POS externo.

## Arranque local

Requisitos: Docker Desktop/Engine con Compose v2, Node 22.12+ (o 24/26) y npm. No necesita Java ni Maven instalados para ejecutar con Docker.

```bash
cp .env.example .env
docker compose up --build -d
npm ci
npm run dev
```

Abrir **http://localhost:5173**. Vite reenvía `/api` al backend `http://localhost:8080`. Usar `localhost` consistentemente. Esperar a que backend y base estén saludables:

```bash
docker compose ps
curl http://localhost:8080/actuator/health
docker compose logs --tail=100 backend
```

Las credenciales de desarrollo están definidas explícitamente en `.env.example`; son ejemplos públicos locales, no secretos productivos:

| Cuenta | Contraseña inicial del ejemplo | Perfil |
| --- | --- | --- |
| admin | change-admin-password | Administrador |
| inventario | change-inventory-password | Inventario |
| encargado | change-manager-password | Encargado |

Puede cambiarlas en `.env` **antes del primer arranque**. Las cuentas se crean con BCrypt si `SEED_USERS=true`; no se sobrescriben ni se cambian sus contraseñas al reiniciar. No hay registro público ni recuperación de contraseña. La identidad y los permisos provienen de la sesión, nunca del cuerpo del comando.

`SEED_DATA=true` carga el escenario ficticio una sola vez sobre una base vacía. Un marcador y una transacción impiden duplicarlo; tampoco reemplaza maestros existentes. Desactivar las variables de semilla después del primer uso es válido. Con ambas semillas desactivadas, una base vacía no tiene cuentas ni productos: no es un fallo ni activa datos mock.

```bash
docker compose restart
# El volumen postgres_data conserva productos, operaciones y cuentas.
docker compose down
# Volver a iniciar conserva el volumen; no usar down -v para un reinicio normal.
docker compose up -d
```

No se importa ni se migra automáticamente `localStorage` antiguo (`farmacorp-demo`). Puede permanecer en el navegador, pero la aplicación no lo lee ni lo escribe. No existe botón de restablecimiento; las semillas nunca son una alternativa ante errores de conexión. Un error de API se muestra con reintento explícito.

## Procesos y reglas

- Productos, ubicaciones y lotes; SKU único sin distinción de mayúsculas; precio decimal. No se cambia trazabilidad con historial ni se renombra/elimina una ubicación referenciada. Se conserva al menos una ubicación.
- Recepción con referencia OC; trazables necesitan código y vencimiento futuro, los demás usan `SIN-LOTE`. Una clave producto/ubicación/lote consolida únicamente con igual vencimiento.
- POS local mediante API: FEFO, excluye bloqueos, vencidos (también el día de vencimiento) y reservas. ID y contenido repetidos conservan éxito o rechazo; cambiar el contenido genera conflicto. Tras un rechazo se necesita un ID nuevo para intentar de nuevo después de reponer.
- Transferencias: descuento en origen al despachar, tránsito y alta en destino solo al recibir; preservan lote/fecha, incluso si vence en tránsito. Recibir dos veces no duplica stock.
- Conteos: físico total y motivo; aprobación por Inventario de otro perfil, o Administrador. La revisión del saldo por producto/ubicación detecta cambios posteriores al conteo incluso si se recuperó el saldo original. Diferencias negativas solo consumen stock elegible; positivas trazables identifican lote físico y fecha futura.
- Bloquear/desbloquear lotes y editar notas no modifica cantidad; genera movimiento administrativo cero. Cada cambio de stock genera movimientos con responsable, referencia y antes/después en la misma transacción.
- Alertas por stock bajo, bloqueo, vencimiento, tránsito y conteo pendiente. Ventana configurable entre 0 y 3650 días. Reposición = máximo entre cantidad configurada y punto + 1 − disponible, con revisión humana de Administrador; no crea compras.

| Perfil | Permisos |
| --- | --- |
| Encargado | Consultas, POS, recepción OC, despacho/recepción de transferencia, registro de conteos. |
| Inventario | Consultas, POS, conteos, parámetros de alertas y aprobación de conteos de otro perfil. |
| Administrador | Todos los anteriores, maestros, lotes y revisión humana de reposición. Puede aprobar sus conteos. |

Los controles visuales ayudan al usuario; la autorización efectiva se ejecuta en el servidor.

## Indicadores y límites

Se conservan las fórmulas y la navegación existentes. Exactitud = conteos aprobados sin diferencia / aprobados. Disponibilidad = líneas POS únicas atendidas / solicitadas. Aproximación operativa de merma = unidades de ajustes negativos / entradas registradas (incluye aperturas y recepciones de transferencia); incluye cualquier motivo y **no mide merma exclusiva por vencimiento ni merma financiera**. Sin denominador: “Sin datos”. ABC usa unidades POS × precio de referencia actual; A hasta 80 %, B hasta 95 %, C restante; sin ventas, C.

Las metas académicas separadas son exactitud ≥95 %, disponibilidad de críticos ≥80 % y merma por vencimiento ≤1,89 % frente a base 2,10 %. No se define criticidad empresarial ni se presentan aproximaciones como mediciones reales de Farmacorp. Las proyecciones del dashboard usan consumo del período seleccionado; no son un pronóstico validado.

## Diseño técnico y seguridad local

Plan: [BACKEND_IMPLEMENTATION_PLAN.md](BACKEND_IMPLEMENTATION_PLAN.md). Contratos: [docs/API.md](docs/API.md).

`backend/` organiza controladores, servicios, persistencia, autenticación y configuración. Flyway versiona el esquema; no hay `ddl-auto=update`. Los saldos, claves de negocio, revisiones y parámetros tienen tablas y restricciones PostgreSQL. El historial y los documentos de operación usan JSONB persistido con claves únicas dentro de PostgreSQL; no son respuestas mock ni estado enviado por el cliente. Los precios se validan y almacenan como decimal. `src/api.ts` concentra HTTP; `App` y `MasterData` envían comandos y muestran la instantánea confirmada por la API. Las funciones de consulta calculan vistas sobre esa instantánea. El antiguo motor `domain.ts` se conserva como referencia probada, pero sus mutaciones no se ejecutan en la aplicación.

Cada escritura toma `pg_advisory_xact_lock` global en la misma transacción antes de consultar y modificar datos. También protege lotes todavía inexistentes e IDs POS nuevos; elimina carreras de sobreventa y escrituras parciales entre instancias del backend. Es deliberadamente simple para uso local: serializa todos los escritores y limita rendimiento; escalar requeriría bloqueo más granular manteniendo orden estable. Las lecturas de `/state` usan una instantánea repetible.

Fechas de negocio: `America/La_Paz`; marcas de auditoría como instantes UTC. Sesiones del servidor con cookie HttpOnly/SameSite=Lax; token CSRF obligatorio en mutaciones, incluido login. HTTP y cookie no Secure son configuración exclusiva del entorno local. CORS limita el origen local, nunca `*` con credenciales. Healthcheck consulta aplicación/base; logs facilitan diagnóstico sin registrar contraseñas. Las sesiones pueden expirar al reiniciar backend: los datos de inventario permanecen.

Solo frontend, monolito y PostgreSQL. No se agregaron RabbitMQ, Redis, Keycloak, FastAPI, Power BI, AWS, Kubernetes, microservicios ni sistemas completos de compras, ventas o contabilidad. Las reservas iniciales forman parte del escenario; no se añade un sistema independiente de reservas.

## Pruebas

```bash
npm test
npm run build
# Java 21+ y Maven mediante wrapper; Docker debe estar iniciado:
cd backend
./mvnw test
```

Las pruebas críticas de integración usan PostgreSQL real con Testcontainers y Flyway sobre base vacía. No se sustituyen por H2. Docker sin iniciar es un error de infraestructura visible, no una prueba aprobada. Las pruebas TypeScript conservan reglas de referencia y cálculos del dashboard. Evidencia de esta implementación y límites de verificación: [VALIDATION.md](VALIDATION.md).

Recorrido manual:

1. Entrar como `admin`; Administración → Datos maestros: crear SKU `LOCAL-001`, nombre/unidad/categoría, precio y trazabilidad.
2. Inventario → Recepciones: elegir producto, CEDIS, 8 unidades, `LOCAL-L1`, fecha futura y `OC-LOCAL-1`.
3. Existencias: elegir producto y comprobar cantidad/lote/fecha. Recargar navegador y comprobar permanencia.
4. Reiniciar servicios, entrar otra vez y verificar el mismo saldo. El botón Actualizar datos consulta cambios de otras sesiones.
5. Registrar POS con ID único y repetirlo; verificar igual saldo. Cambiar su cantidad con el mismo ID debe mostrar conflicto.
6. Despachar 3 unidades a otra ubicación; comprobar destino sin alta hasta recibir y alta única al recibir.
7. Entrar como `encargado`, registrar conteo; entrar como `inventario` para aprobar. Un movimiento posterior al conteo obliga a registrar otro.
8. Detener backend y pulsar Actualizar datos: debe aparecer error visible y nunca cargar semillas del navegador.

No se realizó despliegue a nube, commit ni push.
