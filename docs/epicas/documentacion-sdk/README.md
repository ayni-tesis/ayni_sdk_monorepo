# Épica — Documentación del SDK

Un sitio público de documentación reúne lo que un desarrollador necesita para
integrar Ayni: qué es, cómo instalar el SDK, cómo preparar una aplicación en el
dashboard, cómo sincronizar y qué contratos exactos exponen el SDK Dart y la API
HTTP. Toma como referencia la documentación del SDK de Google Cloud y la de
Astro. El sitio se construye con **Astro y Starlight** en `apps/docs` y se
despliega en **Vercel** como sitio estático (decisión del 2026-09-27). La
investigación, la comparación de herramientas y la estructura del sitio están
en `docs/investigacion/documentacion-sdk.md`.

## Estado actual y alcance

- No existe un sitio de documentación. El SDK (`packages/sdk_flutter`) no tiene
  README y el `README.md` de la raíz solo explica cómo levantar el monorepo.
- El servidor publica `/openapi.json` y una referencia Scalar en `/docs`, pero
  la especificación (`packages/api/src/openapi.json`) solo describe `GET /health`.
- US-095 (issue #58) cubre la guía mínima dentro del paquete (README → `Inicio
  rápido`). Esta épica construye el sitio que la amplía y la enlaza; no la
  reemplaza.

Reglas de la épica:

- **Solo se documenta lo que existe.** Cada página describe la versión
  publicada del SDK y de la API. Lo planificado pero no implementado (por
  ejemplo, la ejecución local de US-049 a US-062) no aparece como disponible.
- **Una sola fuente por contrato.** La referencia Dart sale de los comentarios
  `///` del código, la referencia HTTP de `openapi.json` y el glosario de
  `CONTEXT.md`. El sitio no copia esos contratos a mano.
- **Español.** El sitio se escribe en español, como el producto. El selector de
  idioma queda fuera de alcance.
- **Sin secretos.** Los ejemplos usan marcadores como `ayni_sk_…`, nunca
  credenciales reales.

## Historias

| Historia | Resultado |
| --- | --- |
| [US-137](US-137-publicar-sitio-documentacion.md) | Publicar el sitio con su navegación, tema y despliegue. |
| [US-138](US-138-buscar-en-documentacion.md) | Buscar cualquier página o término de la documentación. |
| [US-139](US-139-seguir-inicio-rapido-sdk.md) | Sincronizar el primer workflow siguiendo el inicio rápido. |
| [US-140](US-140-instalar-configurar-sdk.md) | Instalar y configurar el SDK con sus requisitos. |
| [US-141](US-141-comprender-conceptos-ayni.md) | Comprender los conceptos de Ayni. |
| [US-142](US-142-preparar-aplicacion-dashboard.md) | Preparar una aplicación en el dashboard paso a paso. |
| [US-143](US-143-consultar-referencia-api-dart.md) | Consultar la referencia de la API Dart del SDK. |
| [US-144](US-144-consultar-referencia-api-http.md) | Consultar la referencia de la API HTTP del SDK. |
| [US-145](US-145-consultar-esquema-workflow.md) | Consultar el esquema de un workflow publicado. |
| [US-146](US-146-diagnosticar-errores-sincronizacion.md) | Diagnosticar un error de sincronización. |
| [US-147](US-147-consultar-datos-privacidad-sdk.md) | Saber qué datos envía y guarda el SDK. |
| [US-148](US-148-consultar-notas-version-compatibilidad.md) | Consultar las notas de versión y la compatibilidad. |
| [US-149](US-149-acceder-documentacion-desde-producto.md) | Llegar a la documentación desde la landing y el dashboard. |
| [US-150](US-150-verificar-ejemplos-enlaces-documentacion.md) | Mantener verificados los ejemplos y enlaces. |

## Dependencias con otras épicas

- **Empaquetado y distribución del SDK:** US-090 fija la API pública que
  documenta US-143; US-095 aporta el contenido base de US-139; US-096 y US-097
  habilitan la instalación desde pub.dev en US-140 y las notas de versión de
  US-148; US-098 define la compatibilidad que publica US-148.
- **Ejecución local, observabilidad y recolección:** cuando cada una se
  implemente, actualiza las páginas afectadas (inicio rápido, referencia,
  errores y privacidad) en el mismo cambio.
