# US-150 — Mantener verificados los ejemplos y enlaces de la documentación

**Épica:** Documentación del SDK

## Historia de usuario

Como desarrollador que mantiene Ayni, quiero que CI compruebe los ejemplos de
código, los enlaces y los contratos citados en la documentación para que nunca
publique algo que no funciona o que no existe.

## Interfaz

### Ubicación

Pipeline de CI (`.github/workflows/ci.yml`) y scripts del sitio de
documentación.

### Elementos y texto visible

- Paso de CI `Verificar documentación`, con estas comprobaciones:
  - Los fragmentos Dart salen de archivos de ejemplo que se analizan con
    `dart analyze`; las páginas los incluyen por referencia, no copiados.
  - El ejemplo JSON de workflow pasa `WorkflowDefinitionValidator`.
  - Los enums de la referencia de estados coinciden con los del SDK.
  - Los enlaces internos y las anclas existen.
  - La especificación OpenAPI está al día (`openapi:verify`).
- Mensaje de fallo con archivo, línea y causa, por ejemplo `Enlace roto:
  /referencia/estados#uptodate en comenzar/inicio-rapido.mdx:42`.

### Estados y mensajes

- Éxito: el paso termina en verde y el sitio se compila.
- Error: el paso falla y bloquea la integración.

## Happy path

```gherkin
Scenario: Cambio de documentación válido
  Given que actualizo una página y sus ejemplos compilan
  When CI ejecuta "Verificar documentación"
  Then todas las comprobaciones pasan
```

## Bad path

```gherkin
Scenario: Ejemplo que usa una API renombrada
  Given que un cambio renombra un símbolo público del SDK
  And la documentación aún usa el nombre anterior
  When CI ejecuta "Verificar documentación"
  Then el análisis del ejemplo falla
  And el mensaje indica la página y el símbolo inexistente
```

```gherkin
Scenario: Enlace interno roto
  Given que una página enlaza a un ancla que ya no existe
  When CI ejecuta "Verificar documentación"
  Then la verificación falla con la página, la línea y el enlace
```

## Criterios de aceptación

- Ningún fragmento de código Dart del sitio se escribe fuera de un archivo que
  CI analiza.
- La verificación de enlaces externos avisa sin bloquear, para no depender de
  sitios de terceros.
- Las comprobaciones corren localmente con un solo comando documentado en el
  README del sitio.
- Existe una prueba que demuestra que cada comprobación falla ante un caso roto.
