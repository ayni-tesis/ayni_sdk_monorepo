# Épica — Página inicial para desarrolladores

La página raíz de Ayni presenta el producto a desarrolladores, explica el flujo entre dashboard y ejecución móvil offline, y ofrece acceso a registro, dashboard y estado de la API. Su objetivo es dar contexto antes de entrar a la aplicación, sin inventar métricas, clientes ni testimonios.

## Estado actual y alcance

La implementación actual vive en `apps/web/src/app/page.tsx` y su hoja `page.module.css`. Incluye navegación principal, una introducción del producto, tres etapas del workflow, verificación de salud de la API y un diálogo de búsqueda con tres destinos. La interfaz está actualmente en inglés. La solicitud de usar español es un requisito pendiente; las historias siguientes describen el comportamiento objetivo y sus textos en español, no una localización ya terminada.

La página debe preservar el carácter técnico del producto: workflows DAG tipados, versiones inmutables, modelos ejecutados localmente en Flutter y capacidad offline. No debe sugerir que el dashboard ejecuta el modelo ni que Ayni envía código arbitrario al dispositivo.

## Historias

| Historia | Resultado |
| --- | --- |
| [US-120](US-120-presentar-ayni-a-desarrolladores.md) | Comprender qué es Ayni y las etapas de su flujo. |
| [US-121](US-121-acceder-a-registro-y-dashboard.md) | Llegar al registro o al dashboard desde la página raíz. |
| [US-122](US-122-buscar-destinos-desde-la-landing.md) | Encontrar uno de los destinos disponibles mediante búsqueda. |
| [US-123](US-123-consultar-estado-de-la-api.md) | Consultar el estado de conectividad de la API. |

## Verificación conocida

- Las pruebas existentes comprueban la introducción, enlaces principales, estado conectado y nombre accesible del diálogo.
- No comprueban todavía el filtrado de destinos ni la limpieza de la consulta al cerrar.
- Se reportó un fallo de Vitest al cargar CSS por la configuración PostCSS; una compilación de producción de Next.js pasó después de corregir selectores CSS Modules.
- Antes de considerar completa la localización, verificar todos los textos visibles, estados, nombres accesibles y mensajes vacíos en español.
