# US-151 — Alcance legal preliminar del mapa de tratamientos

**Estado:** revisión jurídica pendiente; esta nota no es asesoría legal.

El mapa registra hechos declarados por el administrador. No determina la base
legal, los roles ni el cumplimiento del tratamiento. La referencia normativa
es la [Ley N.° 29733](https://www.leyes.congreso.gob.pe/documentos/leyes/29733.pdf)
y su reglamento vigente, el [D.S. N.° 016-2024-JUS](https://busquedas.elperuano.pe/dispositivo/SE/2349653-1).

| Campo del mapa | Referencia preliminar | Límite de esta implementación |
| --- | --- | --- |
| Finalidad, categorías, obligatoriedad, destinatarios, transferencias, conservación y canal de derechos | Ley N.° 29733, art. 18; transferencias, art. 15; derechos, arts. 19–22 | El administrador declara los valores para cada finalidad; el sistema no valida si son suficientes para un caso concreto. |
| Rol responsable/encargado | Ley N.° 29733, art. 2 (definiciones de encargado y titular del banco de datos) | `Por determinar` bloquea la publicación. Ayni no asigna el rol según quién aloja o ejecuta el sistema. |
| Base aplicable | Ley N.° 29733, arts. 13.5–13.6 cuando corresponda consentimiento; D.S. N.° 016-2024-JUS, arts. 1–10 | La base es texto declarado y confirmado por el administrador. El producto no elige consentimiento ni otra base. |
| Fuente y contexto Ayni/aplicación cliente | Contexto operativo para distinguir los flujos y revisar el deber de informar del art. 18 | El mapeo legal exacto de estos campos y si deben aparecer en cada aviso requieren revisión jurídica. |

## Bloqueo antes del lanzamiento

- [ ] La persona responsable de privacidad o asesoría legal confirma el alcance
  de los campos frente a la Ley N.° 29733, el D.S. N.° 016-2024-JUS y los
  tratamientos, proveedores y transferencias reales de Ayni.
- [ ] Se resuelve si la base aplicable, la fuente y el contexto deben mostrarse
  en el aviso publicado para cada flujo.

Hasta completar esta revisión, la publicación técnica del snapshot no debe
interpretarse como revisión legal ni como declaración de cumplimiento.
