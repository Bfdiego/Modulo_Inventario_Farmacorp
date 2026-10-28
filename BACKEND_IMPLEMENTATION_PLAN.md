# Implementación del backend

Contexto verificado: React/TypeScript/Vite; estado v2 en localStorage `farmacorp-demo`; reglas en domain.ts; maestros y parámetros mutados en componentes; roles demostrativos. Sin AGENTS.md en el repositorio. Las pruebas existentes son referencia de comportamiento.

## Alcance y decisiones
- Monolito modular Java 21 / Spring Boot 3.5.7, JDBC, PostgreSQL 17.6, Flyway, Security con sesión y BCrypt. Sin servicios adicionales.
- Entidades: productos (precio decimal), ubicaciones, lotes/reservas, movimientos/auditoría, solicitudes POS, transferencias/asignaciones, conteos, revisiones, parámetros y usuarios.
- PostgreSQL es autoridad. Cada comando se valida y ejecuta en una transacción; bloqueo PostgreSQL advisory transaccional global serializa escritores (también lotes nuevos), suficiente para uso local y sin carreras de sobreventa. Lecturas coherentes. Unicidad de SKU, lote compuesto e ID POS en SQL.
- Fechas de negocio America/La_Paz. Sesión HttpOnly, CSRF por token, Vite proxy /api; CORS origen local explícito. Identidad del principal; nunca del payload.
- Semillas ficticias optativas y una sola vez en PostgreSQL; jamás importar localStorage ni recurrir a mocks. Sin restablecimiento en esta etapa.

## Contrato acordado antes de delegar
Todas las rutas bajo `/api`; JSON; cookie de sesión. Errores `{message:string}` con 400 validación, 401 sin sesión, 403 permisos/CSRF, 404 inexistente, 409 conflictos.
- GET /auth/csrf => `{token,headerName}`; POST /auth/login `{username,password}` => `{username,role}`; GET /auth/me mismo resultado; POST /auth/logout.
- GET /state => State v2 compatible con src/types.ts; role viene de sesión, campos de historia conservados. Consultas y visualizaciones usan esta lectura coherente de PostgreSQL.
- POST /commands => unión Command de domain.ts (receipt/sale/dispatch/receiveTransfer/count/approve), devuelve `{state:State,message:string}`. POS insuficiente es resultado persistido (200 fulfilled=false); mismo ID/contenido devuelve resultado previo, diferente 409.
- POST /products y PUT /products/{id}: Product sin confiar en id de creación; devuelve `{state,message}`.
- POST /locations `{name}`; PUT /locations `{name,newName}`; DELETE /locations JSON `{name}`.
- PATCH /lots `{productId,location,id,blocked,note}`.
- PUT /settings `{alertDays}` (Inventario/Admin); POST /replenishment-reviews `{productId,location}` (Admin).
- Maestros/lotes solo Admin, recepción y transferencias Encargado/Admin, POS/conteos todos, aprobación Inventario (otro perfil)/Admin. Respuestas de mutaciones siempre `{state,message}`.

## Etapas y responsabilidades
1. Terra backend: migración, persistencia, servicios, controladores de inventario y semillas; solo backend excepto seguridad/bootstrap/build.
2. Terra frontend: api.ts, App/MasterData, zona de fechas, proxy y mensajes; sin backend.
3. Terra plataforma: Maven/bootstrap/seguridad/errores, Docker/env y pruebas PostgreSQL; sin servicio de inventario.
4. Principal: integrar, documentar, fijar dependencias, ejecutar pruebas existentes/build, backend con PostgreSQL real y navegador → API → BD; declarar evidencia y límites.

## Verificación
Migración vacía, permisos/CSRF, FEFO y reservas, POS idéntico/conflictivo/rechazado, transferencia recibida dos veces, conteo obsoleto, rollback y concurrencia con PostgreSQL/Testcontainers. Recorrido UI crear producto/recibir/consultar; reinicio y recarga. Fallos de conexión visibles. No commit/push ni nube.

## Resultado

Implementación e integración completadas. Se ejecutaron 28 pruebas TypeScript, build Vite y 10 pruebas PostgreSQL Testcontainers. Docker Compose inicia ambos servicios saludables; recorrido de navegador y consulta SQL verifican creación/recepción/persistencia tras reiniciar, además del error visible con la API detenida. Evidencia y límites en VALIDATION.md. Sin commit, push ni despliegue externo.
