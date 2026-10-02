# Observabilidad del SDK para validación técnica — diseño

**Estado:** Propuesta aprobada en conversación; pendiente de revisión del documento por el usuario antes del plan de implementación.

## Objetivo

Completar la épica `observabilidad-telemetria-diagnostico` para que el SDK pueda aportar evidencia técnica reproducible a la validación descrita en el plan de pruebas de tesis. La épica cubre el SDK, la API y el panel de Ayni necesarios para captar, transportar, consultar y exportar esa evidencia.

La aplicación Android de pruebas queda fuera de esta épica. El usuario la construirá después, cuando estén disponibles las capacidades del SDK. La aplicación de pruebas será responsable de ejecutar las condiciones de control y tratamiento, suministrar el contexto experimental que el SDK no conoce y entregar mediciones/artifacts externos.

## Alcance de validación

La evidencia debe permitir comparar control y tratamiento en el mismo dispositivo y bajo las mismas condiciones, conservar los valores y archivos fuente, y analizar compatibilidad, rendimiento, consumo y operación offline. El protocolo contempla clasificación y detección, distintas etapas y latencias, memoria, energía o un proxy declarado, tamaño del paquete, sincronización, pérdidas/duplicados/reintentos, compatibilidad, aprovisionamiento y esfuerzo de integración.

Cada repetición debe poder relacionarse con el protocolo y conservar, cuando estén disponibles: identificador de corrida/repetición, fecha, condición (`control` o `tratamiento`), caso/escenario, commit y versión SDK, workflow y versiones/hash de modelos, dataset/partición/hash, dispositivo/SoC/RAM, Android/API, backend efectivo, red, batería/temperatura, mediciones y referencias a archivos, validez e incidencias. Los campos que el plan todavía deja pendientes —por ejemplo dataset definitivo, umbrales, instrumentos o especificaciones por dispositivo— permanecen configurables o ausentes; el software no los inventa ni presenta como resultados concluyentes.

El alcance de privacidad de la captura mantiene estas fronteras: nunca se transmite la imagen; se puede transmitir el resultado de inferencia ya decodificado por el contrato público del SDK (clasificaciones, detecciones con cajas y confianza, o booleanos), pero no tensores/binarios arbitrarios del runtime. Se permiten hashes de imagen/dataset para correlación, no los bytes originales. Se excluyen identificadores directos de hardware, ubicación no declarada, credenciales y datos de personas. El plan limita la validación a imágenes sin personas.

## Diseño

### Un registro versionado por ejecución

Cada ejecución elegible produce un registro estructurado versionado, con `traceId` estable e idempotente. El payload agrupa:

- Identidad operacional: `traceSchemaVersion`, `traceId`, `runId`, repetición, `installationId`, fecha, condición, caso y escenario.
- Procedencia declarada: commit y versión de la app, versión del SDK, aplicación, workflow y versión; cada modelo usado con versión y SHA-256; dataset, partición y SHA-256 del input/dataset cuando aplique.
- Perfil técnico: modelo de dispositivo, plataforma/SO/API, rango de RAM y SoC si está disponible. Backend efectivo, red y condiciones de batería/temperatura se declaran en el contexto de traza. Campos no expuestos por el sistema se omiten o se declaran desconocidos; las versiones de app/SDK pertenecen solo a procedencia y no se duplican en el perfil.
- Ejecución del SDK: resultado/status, timestamps y duración total, fases/nodos y sus estados/duraciones, modelos realmente ejecutados, resultado estructurado decodificado, y error tipado/sanitizado si corresponde.
- Medición externa: valores reportados por la app/herramientas de benchmark (por ejemplo PSS/RSS, energía/proxy, startup, throughput, tamaño del paquete y contadores de sincronización), con unidad, método, fuente, fase y referencia a artifact cuando corresponda.
- Calidad de evidencia: campos faltantes, incidencias, validez declarada por el cliente, y estado de captura/entrega. El servidor marca cada valor de origen cliente como `clientReported`/no verificado; autenticación identifica la aplicación, no certifica el dispositivo, condición, instrumento o veracidad experimental.

La estructura admite versiones de esquema explícitas. Valores y unidades se conservan sin convertirlos silenciosamente; los agregados estadísticos (p50/p90/p95/p99, medias y tasas) deben indicar población, cantidad de muestras y método, o se calculan fuera del panel a partir de JSONL. Una sola corrida no se interpreta como conclusión de tesis.

### Control y tratamiento

Ambas condiciones producen el mismo esquema y usan la misma ruta de ingesta autenticada y exportación. En tratamiento, el SDK aporta automáticamente sus datos de ejecución; la app de pruebas completa contexto experimental y mediciones externas. En control, la app reporta también el registro al mismo endpoint.

El endpoint deriva `applicationId` de la credencial SDK y no confía en un ID de aplicación enviado en el cuerpo. El cliente declara condición, caso, backend, dispositivo y demás contexto; la API conserva el valor, lo marca como no verificado y no afirma haber comprobado que control y tratamiento sean equivalentes.

### Captura, política y consentimiento

La captura técnica permanece deshabilitada por defecto. La política de telemetría existente por aplicación (activación y retención permitida) es el control administrativo y el servidor vuelve a comprobarla en la ingesta. El SDK obtiene/cachea su configuración durante `sync()` para decidir la captura, y la refresca antes de cada intento de transmisión; si está deshabilitada o no puede obtenerse una política vigente, no transmite y conserva lo encolado. Las solicitudes que usan una credencial SDK rechazan redirecciones a otro origen y nunca reenvían esa credencial. El comportamiento ante una política revocada se aplica también a elementos ya encolados.

El consentimiento opcional existente `sdkImprovement` es distinto de la política operativa de telemetría y no se reutiliza ni se interpreta como consentimiento para recolectar automáticamente datos de la validación. La captura/retención/exportación se documenta en `Recursos` → `Datos y privacidad` (US-147), indicando clases de datos, propósito, controles, destinatarios, si existe consentimiento aplicable, retención y canal de derechos. No se hace afirmación automática de cumplimiento legal; el texto legal requiere la revisión ya indicada por el repositorio.

### Persistencia y entrega offline

El SDK escribe la traza versionada en una outbox durable dentro del directorio de almacenamiento local antes de devolver la ejecución. La inferencia y el resultado del workflow no esperan a la red ni al servidor. El SDK reintenta durante `sync()` (o el punto de entrega ya existente); elimina una entrada solo después del ACK del servidor.

La API aplica unicidad por `(applicationId, traceId)`: reintentar el mismo contenido confirma idempotentemente; reutilizar el ID con contenido distinto se rechaza sin sobrescribir el original. Si la outbox se queda sin espacio, la ejecución sigue siendo exitosa y el resultado declara que la evidencia está incompleta/no persistida. El problema no debe ocultarse ni transformarse en una traza enviada.

### Artefactos fuente

Perfetto, Macrobenchmark y otros artefactos binarios grandes se suben a almacenamiento R2 siguiendo el patrón ya usado por el repositorio para artefactos de versiones de modelos. El flujo entrega una carga directa/firmada en lugar de transportar binarios por el API JSON. La traza almacena nombre/tipo, tamaño, SHA-256, referencia privada y metadatos de herramienta/versión; el servidor verifica la carga y la vinculación con la aplicación/traza. No se publican claves de almacenamiento. El tamaño máximo y los formatos aceptados se fijarán desde las restricciones reales de API y R2 durante la especificación de implementación, sin inventar un límite aquí.

Los archivos se sirven solo a miembros autorizados de la aplicación y se eliminan cuando vence la traza asociada. Los formatos admitidos se limitan a una allowlist de binarios no ejecutables, que excluye HTML, SVG y JavaScript. El servidor determina el formato por el contenido, no por el nombre o headers del cliente. Las descargas se sirven como `application/octet-stream`, como adjunto y con `X-Content-Type-Options: nosniff`; cualquier vista previa futura usa un origen aislado sin credenciales de la aplicación. El cliente rechaza redirecciones a otro origen al usar URLs firmadas de R2 y no reenvía la URL firmada ni sus parámetros. Los artifacts originales quedan disponibles para su análisis antes de vencimiento; por ello la exportación/copia de evidencia necesaria para la tesis forma parte del procedimiento experimental del cliente.

### Consulta, exportación y retención

El panel existente permite listar trazas con paginación, consultar detalle y filtrar por corrida/repetición, condición, caso, workflow/modelo/versión, resultado, fecha, dispositivo y backend. La exportación produce JSONL del mismo esquema versionado, incluye valores declarados y marcas de procedencia/no verificación, y conserva las referencias y hashes de los artefactos. La descarga binaria requiere autorización de miembro de la aplicación.

Los administradores mantienen los periodos permitidos actualmente por política (7, 30 o 90 días). El vencimiento se calcula a partir de recepción del servidor; un proceso elimina trazas y objetos R2 vinculados. La retención no extiende el plazo por consulta. Las exportaciones externas y evidencias que el investigador decida conservar se administran fuera del servicio según el protocolo de tesis.

## Cambios propuestos a la épica

Se mantienen las historias existentes US-100–US-113 y sus responsabilidades, afinando criterios para este diseño. No se añade una historia de app Android. Se incorpora US-114 al final de la secuencia de la épica para ingestión/adjuntos de artefactos (GitHub #327; la issue GitHub #114 corresponde a US-103).

| Historia actual | Ajuste propuesto para cubrir el plan |
| --- | --- |
| US-100 Política (GitHub #109, cerrada) | Se conserva su alcance implementado de configuración por aplicación. Los checks de captura/ingesta se fijan en US-103/107 y la expiración de datos y artifacts en US-112, sin reabrir retroactivamente esta issue. |
| US-101 Identificador (GitHub #111) | UUID local persistente por instalación, ámbito por aplicación en backend, regeneración y privacidad existentes; se usa para agrupar trazas, cuya deduplicación usa `traceId`. |
| US-102 Perfil técnico (GitHub #113) | Exponer `AyniSdk.getDeviceProfile()` como tipo público tipado y sin red/persistencia para que la app reutilice el perfil en control; US-103 lo adjunta a la traza. Incluir plataforma/API, modelo, rango RAM y SoC cuando esté disponible; versiones de app/SDK se registran una sola vez como procedencia de software y las condiciones de entorno se quedan en el contexto de traza. Los datos ausentes quedan desconocidos y se excluyen identificadores hardware. |
| US-103 Traza de ejecución (GitHub #114) | Sustituir la prohibición de resultado crudo por resultado estructurado decodificado; no enviar imagen ni tensor binario. Añadir schema version, procedencia, contexto experimental obligatorio, valores externos declarados, calidad/validez y procedencia no verificada; permitir que la app construya el mismo registro local para ejecuciones de control fuera de `AyniSdk.run`. |
| US-104 Duración por nodo | Registrar estados y tiempos por fase/nodo y distinguir no ejecutado de cero milisegundos. |
| US-105 Error | Error tipado y sanitizado, conservando fase/nodo y relación con incidencia; sin secretos, input ni rutas internas. |
| US-106 Outbox offline | Escritura durable antes del retorno, reintento tras reinicio, dedupe estable; falta de espacio marca evidencia incompleta y nunca falla inferencia. |
| US-107 Entrega | ACK idempotente, rechazo de conflictos, credential/application scope, actualización de la política antes de cada intento y bloqueo de redirecciones a otro origen; lotes solo si el límite real lo requiere. |
| US-108 Consulta | Paginación, detalle de esquema y exportación JSONL sin pérdida de campos declarados. |
| US-109 Filtros | Añadir corrida/repetición, condición, caso y backend a los filtros existentes. |
| US-110 Métricas | Agregados describen muestra, unidad, periodo y origen; no se presentan como mediciones de fuente cuando son calculados. La exportación JSONL sustenta análisis estadístico completo. |
| US-111 Detalle error | Añadir procedencia, contexto de corrida, fases y referencias de evidencia autorizadas, manteniendo la sanitización. |
| US-112 Retención | Aplicar vencimiento a trazas y artefactos adjuntos; eliminar de consultas/exportaciones posteriores al vencimiento. |
| US-113 Restablecimiento | Al resetear el identificador, las trazas ya creadas conservan su ID original y las nuevas usan un UUID nuevo; futuras trazas no se vinculan con las anteriores. |
| US-114 — artifacts fuente (GitHub #327) | Adjuntar, verificar, consultar con autorización y vencer artifacts originales (Perfetto/Macrobenchmark), guardando SHA-256, metadatos y referencia privada R2; validar allowlist, detectar tipo por contenido y servir descargas como adjuntos opacos seguros. |

## Secuencia de implementación acordada

El trabajo inicial implementará en orden las issues existentes #111 (US-101), #113 (US-102) y #114 (US-103), una PR por historia. Cada PR se apila sobre la anterior, espera checks/revisión, se corrige y se integra antes de actualizar la base de la siguiente. Esta especificación encamina el resto de la épica, pero no amplía por sí sola el alcance inmediato de esas tres PR. La app de prueba y las historias restantes se planifican/implementan posteriormente.

## Criterios de aceptación del diseño

- La implementación posterior permite reunir evidencia de control y tratamiento en un esquema versionado común y exportable, preservando qué midió el cliente y qué aportó el SDK.
- Se pueden correlacionar ejecuciones y artifacts con hashes y versiones de código/modelo/dataset sin transmitir imágenes.
- Las trazas sobreviven a desconexión y reinicio si hay espacio, se reintentan sin duplicar registros y no bloquean la inferencia.
- Política y retención por aplicación se respetan tanto en captura como en ingesta y consulta; los objetos fuente siguen la misma retención.
- El servicio identifica el origen declarado, pero no certifica valores o condiciones enviados por el cliente.
- Los elementos incompletos, ausentes o vencidos son visibles/explicables; no se fabrican parámetros pendientes del plan ni conclusiones experimentales.
- No se construye la aplicación Android de pruebas dentro de esta épica.

Para una ejecución de control hecha fuera de `AyniSdk.run`, US-103 define la construcción local de una traza con el mismo esquema, sin añadir una app de prueba al SDK.

## Fuera de alcance

- Crear, diseñar o publicar la aplicación de prueba Android/iOS.
- Automatizar el análisis estadístico integral, dictaminar hipótesis o declarar validada la tesis.
- Capturar imágenes, subir datos crudos de imagen/tensores, identificar personas o recolectar identificadores hardware.
- Inventar datasets, dispositivo(s), umbrales o métodos que el plan aún no haya fijado.
- Revisar o editar el plan de pruebas adjunto.
