# Módulo de Inventario Farmacorp — Demo académica

Prototipo web local en React + TypeScript. Usa exclusivamente datos ficticios y adaptadores locales simulados; no se conecta con Farmacorp, POS, Compras ni Logística reales.

## Ejecutar

```bash
npm install
npm run dev
```

Abrir la URL que indique Vite. Use **Restablecer datos** para regresar al conjunto inicial.

## Recorrido de demostración

1. En **Existencias**, filtre por sucursal, producto y lote.
2. En **Operaciones**, registre una recepción o procese una venta POS. Reenvíe el mismo ID POS para comprobar idempotencia y FEFO.
3. Despache una transferencia y confirme su recepción.
4. En **Control**, registre un conteo y cambie el rol a Inventario para aprobarlo.
5. Revise alertas, clasificación ABC e indicadores en **Reportes**.

Roles de demostración: Encargado confirma recepciones/transferencias y registra conteos; Inventario aprueba ajustes; Administrador puede operar todos los flujos. Las restricciones son visibles para la demo, no seguridad productiva.
