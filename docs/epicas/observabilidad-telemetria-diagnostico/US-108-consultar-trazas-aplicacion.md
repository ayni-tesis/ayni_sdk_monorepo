# US-108 — Consultar trazas de una aplicación

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como miembro de un workspace, quiero consultar las trazas de una aplicación para analizar sus ejecuciones recientes.

## Happy path

```gherkin
Scenario: Consultar trazas propias
  Given que pertenezco al workspace de una aplicación con trazas
  When abro su panel de trazas
  Then el sistema muestra estado, fecha, workflow, versiones y dispositivo técnico de cada traza
```

## Bad path

```gherkin
Scenario: Consultar trazas de otra aplicación
  Given que no pertenezco al workspace de una aplicación
  When intento consultar sus trazas
  Then el sistema rechaza la solicitud
  And no revela su existencia
```

## Criterios de aceptación

- Las trazas están aisladas por aplicación y workspace.
- La vista no muestra imágenes ni información sensible.
- Los miembros autorizados pueden consultar el registro técnico y los resultados estructurados permitidos; imágenes, secretos y tensores arbitrarios no se exponen.

## Criterios para validación técnica

- La consulta permite paginar resultados y abrir el registro versionado completo autorizado.
- La exportación JSONL conserva un registro por línea, los valores reportados por el cliente, las marcas de procedencia y las referencias/hash de artifacts.
- La consulta y exportación se limitan a miembros de la aplicación; los artifacts binarios requieren autorización equivalente.
- Los registros vencidos y los artifacts eliminados por retención no aparecen ni se descargan.
