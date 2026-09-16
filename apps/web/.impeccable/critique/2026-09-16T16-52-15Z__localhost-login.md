---
target: "http://localhost:3001/login"
total_score: 16
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "url:http://localhost:3001/login"
timestamp: 2026-09-16T16-52-15Z
slug: localhost-login
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibilidad del estado | 2 | Hay estado de envío, pero no recuperación contextual ni confirmación de sesión. |
| 2 | Sistema y mundo real | 2 | El título es claro, pero mezcla `Email`, `Password` y `workflows`. |
| 3 | Control y libertad | 2 | Se puede pasar a registro, pero no recuperar contraseña ni volver a una ruta segura. |
| 4 | Consistencia y estándares | 2 | El enlace índigo y el borde verde contradicen el sistema azul/cian. |
| 5 | Prevención de errores | 2 | Valida al enviar, pero no comunica requisitos ni evita errores previsibles. |
| 6 | Reconocimiento antes que recuerdo | 2 | Los campos están etiquetados; faltan pistas de acceso y recuperación. |
| 7 | Flexibilidad y eficiencia | 1 | Solo existe el camino de email/contraseña; no hay ayudas o aceleradores. |
| 8 | Diseño estético y minimalista | 2 | El formulario es limpio, pero el vacío y el brillo no construyen significado. |
| 9 | Recuperación de errores | 1 | Los errores de validación y de autenticación quedan en inglés y sin solución junto al campo. |
| 10 | Ayuda y documentación | 0 | No hay recuperación de contraseña ni ayuda contextual. |
| **Total** |  | **16/40** | **Pobre** |

## Design Specificity Verdict

La pantalla se reconoce como un login limpio de shadcn con un borde animado, no como la puerta de entrada a Ayni: una plataforma fiable para flujos de IA offline-first. La composición, el brillo y el copy podrían pertenecer a casi cualquier SaaS. El análisis visual fue realizado antes de la evidencia determinista.

Para la URL se omitió el escaneo CLI conforme a la regla de crítica. La pestaña nueva cargó el formulario correctamente; no fue posible inyectar el detector porque el navegador solo permitió evaluación de lectura. Por ello no existe overlay visible ni hallazgos automáticos; la consola tuvo 0 errores, 0 advertencias y 0 mensajes de Impeccable.

## Overall Impression

Una base limpia y legible en escritorio, pero demasiado genérica para inspirar confianza y con rutas de recuperación insuficientes. La mayor oportunidad es convertir el login en un acceso seguro, localizado y coherente con Ayni, antes de añadir más efecto visual.

## What's Working

- Un único objetivo principal: email, contraseña y CTA, sin distracciones funcionales.
- Las etiquetas visibles y el botón cian facilitan el escaneo y preservan el contraste en escritorio.
- La tarjeta de shadcn y su agrupación interna dan una estructura familiar al formulario.

## Priority Issues

- **[P1] Recuperación de acceso ausente.** Quien olvida la contraseña queda sin salida. Añadir «¿Olvidaste tu contraseña?», estado de envío y reintento contextual. Comando sugerido: `/impeccable harden`.
- **[P1] Errores y microcopy a medio localizar.** `Invalid email address`, `Password must be at least 8 characters`, `Sign in successful`, `Email` y `Password` rompen la experiencia en español; los errores de auth llegan como toast sin explicación junto al campo. Traducirlos y mostrar solución accionable cercana al input. Comando sugerido: `/impeccable clarify`.
- **[P1] Riesgo de legibilidad móvil.** La revisión a 390 px mostró una tarjeta y texto visualmente diminutos. Verificar y corregir ancho, padding, tipografía, targets de 44 px y comportamiento al zoom. Comando sugerido: `/impeccable adapt`.
- **[P2] Lenguaje visual incoherente.** El brillo cian+verde y el enlace índigo se salen de la paleta steel-blue/frosted-blue y convierten el movimiento en adorno. Sustituirlos por foco, estado o señal cian con una intención concreta. Comando sugerido: `/impeccable colorize`.
- **[P2] Copy técnico antes de tiempo.** «Continúa configurando tus aplicaciones y workflows» requiere entender el producto antes de poder entrar. Cambiarlo por una promesa de acceso/continuidad al workspace y reservar el vocabulario técnico para después de autenticar. Comando sugerido: `/impeccable clarify`.

## Persona Red Flags

- **Jordan, primera vez:** no sabe si debe registrarse, no encuentra recuperación de contraseña y debe interpretar «workflows» antes de iniciar sesión.
- **Sam, acceso asistido:** las etiquetas son un buen comienzo, pero los toasts/errores no prueban anuncios ARIA; el borde animado no debe cargar significado y la escala móvil necesita verificación a 200%.
- **Casey, móvil distraído:** la evidencia móvil pone en duda la legibilidad y el CTA queda alto; faltan señales visibles de autocompletado, recuperación y continuidad tras una interrupción.

## Minor Observations

- El margen superior fijo (`mt-12`) deja un vacío amplio sin reforzar la marca ni orientar la tarea.
- El icono del gestor de contraseñas puede competir visualmente dentro del campo de email.
- El cambio a registro sucede en la misma vista aun existiendo `/register`, lo que debilita una navegación predecible.

## Questions to Consider

- ¿El login debe sentirse como acceso seguro al workspace o como continuación de edición de workflows?
- ¿La animación comunica una señal real de Ayni o solo añade movimiento?
