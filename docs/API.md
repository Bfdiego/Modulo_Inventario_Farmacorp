# API local de inventario

Base: `http://localhost:8080/api` (el navegador usa `/api` a través del proxy Vite). JSON UTF-8. Las rutas de inventario requieren sesión. La API acepta comandos de inventario, nunca un estado completo ni un rol elegido por el cliente.

## Sesión y CSRF

1. `GET /auth/csrf` devuelve `{token,headerName}` y establece cookie.
2. `POST /auth/login` con `{username,password}` y cabecera indicada por CSRF. Guarda la cookie de sesión; devuelve `{username,role}`.
3. Volver a obtener CSRF después de login/logout. Cada POST/PUT/PATCH/DELETE lleva dicha cabecera y cookie. `GET /auth/me` consulta identidad; `POST /auth/logout` cierra sesión.

La aplicación usa cookies HttpOnly, SameSite=Lax y HTTP local. Mantener `localhost` en ambos orígenes. CORS permite únicamente el origen configurado y credenciales; no utilizar `*`. No hay registro público.

## Lectura

`GET /state` devuelve una instantánea de PostgreSQL compatible con `src/types.ts`: productos, ubicaciones, lotes, movimientos, transferencias con asignaciones, conteos, solicitudes POS, revisiones y parámetros. El rol viene de la sesión. El dashboard calcula vistas sobre esta instantánea; sus cifras conservan las fórmulas documentadas, sin atribuirles calidad de métricas empresariales reales. No hay endpoint para sobrescribir la instantánea.

## Comandos

`POST /commands` recibe una de las siguientes estructuras (números JSON, fechas `YYYY-MM-DD`):

```json
{"type":"receipt","productId":"P01","location":"CEDIS Central","amount":8,"lotId":"PRUEBA-1","expiry":"2028-01-01","reference":"OC-LOCAL-1"}
```

| type | Otros campos |
| --- | --- |
| receipt | productId, location, amount, lotId, expiry, reference (OC obligatoria) |
| sale | productId, location, amount, saleId |
| dispatch | productId, origin, destination, amount |
| receiveTransfer | id |
| count | productId, location, physical, reason; lotId y expiry para ajuste positivo trazable |
| approve | id del conteo |

Todos devuelven `{state,message}`. Un POS sin stock es una solicitud registrada con `fulfilled:false`, sin movimientos ni descuento. Su reintento conserva el rechazo. ID y contenido idénticos recuperan el resultado; un contenido distinto genera 409. Una recepción de transferencia repetida no vuelve a sumar stock. Las salidas asignan lotes por FEFO y excluyen vencimiento del día actual, bloqueo y reservas.

## Maestros y parámetros

| Método/ruta | Cuerpo |
| --- | --- |
| POST /products | name, sku, unit, category, price, threshold, replenishment, lotTracked |
| PUT /products/{id} | Los mismos campos |
| POST /locations | `{ "name": "Almacén nuevo" }` |
| PUT /locations | `{ "name": "Almacén nuevo", "newName": "Almacén norte" }` |
| DELETE /locations | `{ "name": "Almacén norte" }` |
| PATCH /lots | productId, location, id (código lote), blocked, note |
| PUT /settings | `{ "alertDays": 30 }` |
| POST /replenishment-reviews | productId, location |

Las mutaciones devuelven `{state,message}`. Maestros y administración de lotes: Administrador. Parámetros: Inventario/Administrador. Revisión de reposición: Administrador, sin generar compra. Las ubicaciones con historial no se renombran ni eliminan; la trazabilidad de productos con historial no se cambia.

## Permisos operativos

| Acción | Encargado | Inventario | Administrador |
| --- | --- | --- | --- |
| Consulta, POS, registro de conteo | Sí | Sí | Sí |
| Recepción OC, despacho y recepción de transferencia | Sí | No | Sí |
| Aprobación de conteo | No | De otro perfil | Sí |

La identidad de auditoría es la cuenta autenticada. El servidor resuelve todos los permisos; las restricciones visuales son solo ayudas.

## Errores y observabilidad

Respuesta de error `{message:string}`: 400 entrada inválida, 401 sesión ausente, 403 permiso o CSRF, 404 recurso inexistente, 409 conflicto de negocio/integridad. Una operación fallida revierte cambios y movimientos de su transacción. El rechazo POS por insuficiencia es un resultado de negocio persistido.

`GET /actuator/health` informa disponibilidad de la aplicación y PostgreSQL. Logs de operaciones y rechazos ayudan al diagnóstico; no contienen contraseñas ni tokens.
