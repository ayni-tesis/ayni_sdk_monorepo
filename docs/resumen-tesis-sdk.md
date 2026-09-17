# Resumen de tesis — Ayni SDK

## Propósito

Ayni es un SDK Flutter offline-first para integrar modelos de IA en aplicaciones
móviles. Un dashboard web permite a cada workspace configurar workflows
versionados; el SDK los sincroniza cuando tiene red y los ejecuta localmente en
el dispositivo.

El núcleo de la tesis es un ejecutor de workflows basado en un DAG (grafo
dirigido acíclico). El caso de diagnóstico de hojas de café es solo un ejemplo:
el SDK debe servir a otros problemas de visión por computadora.

## Arquitectura

```text
Workspace (organización)
└─ Aplicaciones
   ├─ Credenciales SDK
   ├─ Workflows DAG y sus versiones
   ├─ Modelos TensorFlow Lite y sus versiones
   ├─ Evidencia recolectada y datasets
   └─ Trazas y métricas

Dashboard/API ──sincronización──> SDK Flutter en el dispositivo
                                      ├─ workflows JSON validados
                                      ├─ modelos .tflite verificados
                                      ├─ inferencia local offline
                                      ├─ cola de evidencia opcional
                                      └─ cola de telemetría opcional
```

La organización de Better Auth funciona como workspace. Cada aplicación aísla
sus credenciales, workflows, modelos, datasets y trazas de las demás.

## Workflow DAG

Los workflows se diseñan en el dashboard y se publican como versiones
inmutables de JSON. El SDK valida esquema, tipos, dependencias y ausencia de
ciclos antes de instalarlos y ejecutarlos.

Los tipos iniciales de nodo son:

- Entrada y transformación de imagen.
- Clasificación y detección TensorFlow Lite.
- Condición tipada para bifurcar el flujo.
- `dataset.capture` opcional.
- Salida tipada.

Un ejemplo de café sería: imagen → validar hoja → condición → diagnosticar
enfermedad/plaga → resultado. El DAG permite extenderlo con otras ramas y
modelos sin publicar una nueva versión de la app.

## Sincronización y ejecución offline

- El SDK descarga manifiestos, workflows y modelos solo con una credencial de
  la aplicación correspondiente.
- Cada modelo registra versión, tamaño y hash de integridad. Un modelo solo se
  instala tras verificar su hash.
- Una actualización se instala de manera atómica: si falla, permanece la última
  combinación local válida de workflow y modelos.
- La ejecución no depende de internet si los recursos ya están instalados.
- El SDK usa TensorFlow Lite como primer runtime y devuelve resultados y errores
  tipados a la app Flutter.

## Imágenes, evidencia y datasets

Las imágenes no se suben durante la sincronización normal. La recolección es
optativa y ocurre únicamente cuando el workflow incluye `dataset.capture`, la
aplicación lo habilitó y existe consentimiento.

La evidencia se optimiza, queda en una cola local y se sube cuando la política
de red lo permite. Luego puede agregarse a datasets, revisarse y etiquetarse.
Los formatos iniciales de exportación son:

- Clasificación: imágenes aprobadas y CSV de etiquetas revisadas.
- Detección: COCO JSON y YOLO.

## Telemetría y privacidad

Si no existe un nodo `dataset.capture`, el SDK solo puede enviar telemetría
permitida: ejecución, versiones, duraciones y errores sanitizados. Nunca envía
imágenes ni entradas crudas como telemetría.

Cada instalación genera un UUID local. No se usan IMEI, MAC ni identificadores
publicitarios. Las trazas pueden incluir modelo de dispositivo, plataforma,
versiones de SO/app/SDK y RAM por rangos, siempre bajo una política de
telemetría y retención configurada por aplicación.

## Empaquetado

El SDK se distribuye como paquete Flutter/Dart, por ejemplo `ayni_sdk`. El
paquete contiene la API pública para inicializar, sincronizar y ejecutar; no
incluye secretos, modelos ni configuración específica de una aplicación.

Inicialmente puede consumirse desde el monorepo o Git. Tras estabilizar su API,
puede publicarse en un registro de paquetes como pub.dev. Android e iOS son las
plataformas iniciales soportadas.

## Épicas e historias

| Épica | Historias | Ubicación |
| --- | ---: | --- |
| Gestión de workspaces y aplicaciones | US-001–US-006 | `epicas/gestion-workspaces-aplicaciones` |
| Gestión de workspaces | US-114–US-119 | `epicas/gestion-workspaces` |
| Credenciales SDK | US-007–US-011 | `epicas/credenciales-sdk` |
| Modelos | US-012–US-023 | `epicas/modelos` |
| Workflows DAG | US-024–US-037 | `epicas/workflows-dag` |
| Sincronización offline | US-038–US-048 | `epicas/sincronizacion-offline` |
| Ejecución local del SDK | US-049–US-062 | `epicas/ejecucion-local-sdk` |
| Recolección de evidencia para datasets | US-063–US-074 | `epicas/recoleccion-evidencia-datasets` |
| Gestión y exportación de datasets | US-075–US-088 | `epicas/gestion-exportacion-datasets` |
| Empaquetado y distribución del SDK | US-089–US-099 | `epicas/empaquetado-distribucion-sdk` |
| Observabilidad, telemetría y diagnóstico | US-100–US-113 | `epicas/observabilidad-telemetria-diagnostico` |

Total: **119 historias de usuario**.

## Límites actuales

- Serverless es una decisión de despliegue del backend, no una épica funcional.
- El dashboard nunca entrega código arbitrario para que el dispositivo lo
  ejecute.
- TensorFlow Lite es el único runtime inicial; otros runtimes se agregan ante
  un caso de uso probado.
