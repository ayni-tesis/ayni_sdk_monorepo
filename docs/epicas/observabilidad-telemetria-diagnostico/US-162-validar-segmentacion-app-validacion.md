# US-162 — Validar la segmentación en la app de validación

**Épica:** Observabilidad, telemetría y diagnóstico

## Historia de usuario

Como investigador de la tesis, quiero que la app de validación ejecute un perfil de segmentación con la integración directa y con `ayni_sdk` 0.4.0 para medir si el SDK conserva la máscara y cuánto tarda.

## Interfaz

- **App:** `apps/native` agrega el perfil `SEG-01` a `assets/validation/experiment_plan.json`. Se ejecuta con el mismo botón `Iniciar validación` y las mismas fases (calentamiento, medición y estrés).
- **Registro:** cada fila del JSONL guarda `width`, `height`, `areaFractions`, `confidence`, el SHA-256 de la máscara y la máscara en RLE fila por fila. El JSONL queda en el dispositivo y se exporta con `Exportar JSONL`.

## Happy path

```gherkin
Scenario: Medir SEG-01 con ambas condiciones
  Given el perfil SEG-01 publicado con DeepLabV3 y un dataset de validación verificado
  When se inicia la validación
  Then cada imagen se ejecuta con la integración directa y con el SDK
  And el JSONL permite calcular el acuerdo por píxel y el mIoU entre las dos máscaras
```

## Bad path

```gherkin
Scenario: SDK anterior a 0.4.0
  Given que la app compila con un ayni_sdk menor que 0.4.0
  When intenta preparar el perfil SEG-01
  Then el preflight bloquea la suite y explica que la segmentación requiere ayni_sdk 0.4.0
```

## Criterios de aceptación

- **Versión del SDK:** la app compara la versión con SemVer en lugar de una igualdad fija: al menos 0.3.1 para detección y al menos 0.4.0 para segmentación.
- **Integración directa:** decodifica la segmentación con su propio código, sin usar el del SDK.
- **Sin datos fuera del teléfono:** ninguna máscara se envía al servidor; solo queda en el JSONL local. La página `Recursos` → `Datos y privacidad` del sitio del SDK no cambia por esta historia, porque el JSONL es de la app de validación y no del SDK. Si eso cambiara, se actualiza en el mismo cambio.
- **Dataset:** SEG-01 no se activa hasta tener un dataset publicado con licencia que permita guardarlo en el almacenamiento privado.
