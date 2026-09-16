# US-069 — Respetar la política de red para evidencia

**Épica:** Recolección de evidencia para datasets

## Historia de usuario

Como usuario de una app móvil, quiero que el SDK respete la política de Wi-Fi o datos móviles al enviar evidencia.

## Interfaz

La pantalla de política explica `Solo Wi‑Fi` o `Wi‑Fi y datos móviles`. Cuando espera Wi‑Fi, el estado de cola es `Pendiente de Wi‑Fi`; no aparece una carga ni se consumen datos móviles.

## Happy path

```gherkin
Scenario: Wi-Fi requerido y disponible
  Given que la política permite enviar solo por Wi-Fi
  And el dispositivo tiene Wi-Fi
  When el SDK procesa la cola
  Then intenta enviar la evidencia pendiente
```

## Bad path

```gherkin
Scenario: Wi-Fi requerido pero no disponible
  Given que la política permite enviar solo por Wi-Fi
  And el dispositivo usa datos móviles o no tiene red
  When el SDK procesa la cola
  Then mantiene la evidencia pendiente
  And no inicia la carga
```

## Criterios de aceptación

- El SDK consulta la política antes de cada envío.
- El SDK no usa datos móviles si la política solo permite Wi-Fi.
- La evidencia pendiente se conserva para un intento posterior.
