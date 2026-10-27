# Dirección visual del módulo de inventario

La interfaz conserva la identidad Farmacorp con un verde de marca compartido, superficies claras y una jerarquía compacta para la operación diaria. Los colores rojo y ámbar expresan urgencia y advertencia; las etiquetas mantienen el significado sin depender solo del color.

## Sistema compartido

- Los tokens semánticos en `styles.css` definen marca, texto, bordes, fondos, foco y estados; el dashboard los consume mediante sus variables de componente.
- La navegación lateral es única en todas las vistas: mantiene marca, grupos y enlaces visibles; el módulo y la página activos se destacan y la página declara `aria-current`.
- Los iconos de navegación usan SVG de trazo homogéneo, decorativos para lectores de pantalla. En pantallas pequeñas los grupos se desplazan horizontalmente sin duplicar la navegación.
- Se preservan las funciones, datos simulados, etiquetas operativas y avisos existentes. El movimiento se desactiva cuando el sistema solicita movimiento reducido.

## Comprobación

Plan completado: tokens verdes compartidos, navegación lateral única, iconos SVG reutilizables y adaptación responsive. La paleta conserva rojo y ámbar para los estados de atención.

Verificación: `npm run build` y `npm test` (28 pruebas) pasaron. La prueba de navegador pasó con cuatro anchos (360, 768, 1280 y 1920 px), incluidos filtros, foco, diálogo y navegación. Se revisaron visualmente 11 pantallas en esos cuatro anchos, sin desbordamiento horizontal de página ni cambios en la estructura de navegación.
