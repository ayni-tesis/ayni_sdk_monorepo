# Contrato de interfaz — Observabilidad, telemetría y diagnóstico

| Historia | Ubicación y acción | Texto y estados visibles |
| --- | --- | --- |
| US-100 | Aplicación → `Privacidad y telemetría` → `Guardar política` | `Permitir telemetría técnica`; `La telemetría no incluye imágenes ni entradas crudas.`; `Política de telemetría actualizada.` |
| US-101 | Configuración de diagnóstico → `Restablecer identificador` | `Las trazas futuras no se vincularán con las anteriores.` |
| US-102 | Panel de trazas → detalle de instalación | `Dispositivo`, `Sistema operativo`, `RAM (rango)`, `App` y `SDK`; nunca IMEI/MAC. |
| US-103 | Panel de trazas → fila de ejecución | `Workflow`, `Versión`, `Estado`, `Duración` e `Instalación`; vacío: `Aún no hay trazas.` |
| US-104 | Detalle de traza → `Duración por nodo` | `Nodo`, `Estado` y `Duración`; los no ejecutados muestran `No ejecutado`. |
| US-105 | Detalle de traza con fallo | `Error de ejecución`, categoría y nodo; `No se muestran datos sensibles.` |
| US-106 | Estado de diagnóstico en la app | `Telemetría pendiente de envío`; si falta espacio: `No se pudo guardar una traza. El análisis se completó normalmente.` |
| US-107 | Estado de diagnóstico en la app | `Enviando telemetría…`, `Telemetría enviada.` o `No se pudo enviar la telemetría; se reintentará.` |
| US-108 | Aplicación → `Telemetría` → `Trazas` | Tabla `Fecha`, `Workflow`, `Estado`, `Dispositivo` y `Duración`; carga `Cargando trazas…`. |
| US-109 | `Trazas` → `Filtrar` | Filtros `Workflow`, `Modelo`, `Versión`, `Estado`, `Fecha` y `Dispositivo`; `No hay trazas que coincidan con los filtros.` |
| US-110 | Aplicación → `Telemetría` → `Métricas` | Tarjetas `Ejecuciones`, `Tasa de errores`, `Duración media`; vacío `No hay datos para este periodo.` |
| US-111 | Trazas → fila con error → `Ver detalle` | `Categoría`, `Nodo`, `Workflow`, `Modelo`, `Versión` y perfil técnico; `No se muestran secretos ni rutas internas.` |
| US-112 | Aplicación → `Privacidad y telemetría` → `Retención` | Selector `Periodo de retención`; ayuda `Las trazas vencidas dejarán de estar disponibles.`; éxito `Retención actualizada.` |
| US-113 | Configuración de diagnóstico → `Restablecer identificador` | Confirmación `¿Restablecer el identificador de diagnóstico?`; acciones `Restablecer`/`Cancelar`; éxito `Identificador restablecido.` |
