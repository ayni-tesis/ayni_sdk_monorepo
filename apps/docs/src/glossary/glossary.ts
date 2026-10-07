export type GlossaryEntry = {
  /** The term as `CONTEXT.md` names it, which this entry translates. */
  source: string;
  term: string;
  definition: string;
  /** The terms to avoid, translated in the order `CONTEXT.md` lists them. */
  avoid: string[];
  /** The concept page that explains the term. */
  concept?: string;
  /** What is not available yet; the glossary shows it with `Próximamente`. */
  comingSoon?: string;
};

/** The id of a term's heading on the `Glosario` page. */
export function termAnchor(term: string): string {
  return term
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const workspaces = "/conceptos/workspaces-y-aplicaciones/";
const credentials = "/conceptos/credenciales-del-sdk/";
const models = "/conceptos/modelos-y-versiones/";
const workflows = "/conceptos/workflows-dag/";
const sync = "/conceptos/sincronizacion-offline/";

/**
 * The Spanish glossary: every term of `CONTEXT.md`, translated. Its test fails
 * when a term is added to or removed from `CONTEXT.md` without updating this
 * list (US-141).
 */
export const glossary: GlossaryEntry[] = [
  {
    source: "Workspace",
    term: "Workspace",
    definition:
      "El límite de aislamiento que separa las aplicaciones, los miembros, las credenciales del SDK, los workflows y los datasets. Se implementa directamente como una organización de Better Auth, sin una entidad duplicada.",
    avoid: ["equipo", "tenant", "proyecto", "cuenta"],
    concept: workspaces,
  },
  {
    source: "Organization",
    term: "Organización",
    definition:
      "La entidad de Better Auth que respalda un workspace y guarda sus miembros y permisos.",
    avoid: ["org", "tenant"],
    concept: workspaces,
  },
  {
    source: "Application",
    term: "Aplicación",
    definition:
      "Un proyecto aislado de un workspace que define y despliega workflows DAG, modelos y políticas de telemetría y de recolección.",
    avoid: ["proyecto de app", "app cliente"],
    concept: workspaces,
  },
  {
    source: "Administrator",
    term: "Administrador",
    definition:
      "Un miembro del workspace con rol `owner` o `admin` y permisos completos para gestionar las aplicaciones y los recursos del workspace.",
    avoid: ["gestor", "superusuario"],
    concept: workspaces,
  },
  {
    source: "SDK Credential",
    term: "Credencial del SDK",
    definition:
      "Un secreto de una aplicación con el que una instalación del SDK se autentica para sincronizar los recursos de esa aplicación. El servidor nunca guarda el secreto reutilizable: conserva solo su hash SHA-256 y su prefijo visible, y muestra el secreto una sola vez, al crearla. Después, los administradores solo ven el prefijo y metadatos operativos (estado y fechas), nunca el secreto. Revocar una credencial la marca como `revoked`: desde entonces no puede autenticar ni sincronizar recursos nuevos (`credentialRevoked`). La revocación nunca borra workflows, modelos ni versiones existentes, ni elimina los recursos ya guardados sin conexión en los dispositivos.",
    avoid: ["API key", "token"],
    concept: credentials,
  },
  {
    source: "Model",
    term: "Modelo",
    definition:
      "Un modelo de IA para el dispositivo, registrado en una aplicación, que define su runtime admitido (por ejemplo, TensorFlow Lite) y agrupa sus versiones para usarlas en workflows.",
    avoid: ["archivo de ML", "pesos", "algoritmo"],
    concept: models,
  },
  {
    source: "Model Version",
    term: "Versión de modelo",
    definition:
      "Un artefacto inmutable que representa una versión concreta de un modelo. Se identifica con una etiqueta SemVer única dentro de ese modelo, contiene un archivo binario de inferencia en el dispositivo (por ejemplo, un `.tflite` de TensorFlow Lite) y, al subirse, se verifican su formato y su checksum criptográfico (SHA-256). Una versión publicada no se puede sobrescribir ni reemplazar.",
    avoid: ["checkpoint", "build", "snapshot", "archivo de pesos", "release"],
    concept: models,
  },
  {
    source: "Workflow",
    term: "Workflow",
    definition:
      "Un grafo dirigido acíclico (DAG) de pasos de inferencia que pertenece a una sola aplicación. Un administrador del workspace lo crea como un borrador (`draft`) vacío, sin nodos ni versión publicada; crearlo en una aplicación archivada se rechaza con `applicationArchived`.",
    avoid: ["pipeline", "flujo", "cadena"],
    concept: workflows,
  },
  {
    source: "Draft Revision",
    term: "Revisión del borrador",
    definition:
      "Un contador del borrador de un workflow que aumenta en uno con cada cambio aceptado. Cada cambio desde el lienzo indica la revisión en la que se basó; un cambio basado en una revisión anterior se rechaza con `draftConflict` y no modifica nada, para que nadie sobrescriba el trabajo de otro administrador con una vista desactualizada. Las versiones publicadas no lo llevan.",
    avoid: ["versión del borrador (una versión publicada de un workflow es otra cosa)", "ETag"],
    concept: workflows,
  },
  {
    source: "Workflow Version",
    term: "Versión de workflow",
    definition:
      "Una copia inmutable del borrador de un workflow, publicada por un administrador con una etiqueta SemVer única dentro de ese workflow. Solo se publica un borrador que pasa la validación (si no, `workflowInvalid`); publicar en una aplicación archivada se rechaza con `applicationArchived` y repetir una etiqueta, con `versionExists`. Los cambios posteriores del borrador nunca alteran una versión publicada. El SDK recibe solo la versión publicada más reciente de cada workflow no archivado; los borradores nunca salen del servidor.",
    avoid: ["release", "despliegue", "versión del borrador"],
    concept: workflows,
  },
  {
    source: "Offline Sync",
    term: "Sincronización offline",
    definition:
      "El proceso del SDK que se autentica con una credencial del SDK, compara las versiones de workflow y de modelo que ofrece el servidor con las que ya están en el dispositivo y descarga solo lo que cambió. Antes de instalar, valida la definición de cada versión de workflow y verifica el checksum SHA-256 de cada versión de modelo. Una versión de workflow se instala junto con todas sus versiones de modelo o no se instala: si una actualización falla, el dispositivo conserva la última combinación válida de versión de workflow y versiones de modelo, que la app puede seguir usando sin red.",
    avoid: ["descarga", "despliegue", "actualización", "OTA"],
    concept: sync,
  },
  {
    source: "Telemetry Policy",
    term: "Política de telemetría",
    definition:
      "La configuración de cada aplicación que indica si el SDK puede capturar trazas técnicas localmente y el periodo permitido de retención. Solo los administradores la cambian. Sin una política guardada, la captura está desactivada. Nunca autoriza a recopilar imágenes ni entradas sin procesar.",
    avoid: ["configuración de seguimiento", "consentimiento de analítica"],
    comingSoon:
      "El SDK conserva las trazas pendientes localmente, pero todavía no las envía al servidor.",
  },
  {
    source: "Collection Policy",
    term: "Política de recolección",
    definition:
      "La configuración de cada aplicación que indica si el SDK puede capturar imágenes como evidencia para datasets, por qué red puede subirlas y el tamaño y la calidad máximos a los que las comprime. Solo los administradores la cambian. Sin una política guardada, la recolección está desactivada. Solo se puede activar junto con una configuración explícita de consentimiento, y solo capturan imágenes los workflows que incluyen `dataset.capture`.",
    avoid: ["configuración de captura", "configuración de subida"],
  },
  {
    source: "Evidence",
    term: "Evidencia",
    definition:
      "Una imagen que el SDK conserva en el dispositivo cuando una ejecución de una versión de workflow alcanza un nodo `dataset.capture` y termina bien (una ejecución que falla o se cancela no crea ninguna), junto con el resultado de inferencia que recibió el nodo, la versión de workflow y la versión de modelo que produjo el resultado, para enviarla después a los datasets de su aplicación. Un nodo `dataset.capture` que cuelga de una rama de una condición solo se alcanza cuando la condición toma esa rama, así una aplicación puede recolectar, por ejemplo, solo las predicciones de baja confianza. El SDK solo la crea mientras la app indica que la persona consiente la recolección de evidencia, y nunca retrasa ni cambia el resultado que devuelve. Conserva una copia de la imagen reducida y comprimida con el tamaño máximo y la calidad de la política de recolección, nunca la imagen que usó el workflow, y descarta la evidencia que no puede preparar o que no tiene espacio para guardar. Una evidencia guardada queda pendiente en una cola local del dispositivo, sin conexión y aunque la app se reinicie, y nunca cuenta como enviada antes de que el servidor confirme que la recibió; con esa confirmación, el SDK la elimina del dispositivo, y una carga sin ella la conserva. Una carga que falla se reintenta en sincronizaciones posteriores con el mismo ID, esperando más después de cada fallo, hasta un número de intentos configurado; después la evidencia queda en el dispositivo como `Fallida` y el SDK ya no la envía automáticamente. Solo sale del dispositivo mientras la política de recolección está habilitada y por la red que permite: si solo permite Wi-Fi, la evidencia espera el Wi-Fi (`Pendiente de Wi-Fi`) en vez de usar datos móviles. El servidor solo la acepta para la aplicación de la credencial del SDK, desde un nodo `dataset.capture` de una de sus versiones de workflow, y la conserva, imagen y datos, asociada a esa aplicación, workflow, versión de workflow y versión de modelo.",
    avoid: ["muestra", "subida", "telemetría"],
    comingSoon:
      "El servidor recibe la evidencia, pero el dashboard todavía no la muestra ni la agrega a datasets.",
  },
  {
    source: "Dataset",
    term: "Dataset",
    definition:
      "Una colección de evidencias de una aplicación para una tarea de clasificación o detección. Cada elemento conserva el resultado original separado de la revisión humana y las anotaciones corregidas.",
    avoid: ["dataset de validación"],
  },
  {
    source: "Dataset Export",
    term: "Exportación del dataset",
    definition:
      "Un paquete inmutable generado con las evidencias aprobadas y las anotaciones revisadas que cumplen los requisitos del dataset. Tiene una versión propia y una fecha de generación; los cambios posteriores al dataset no modifican una exportación existente.",
    avoid: ["revisión del dataset"],
  },
  {
    source: "Slug",
    term: "Slug",
    definition:
      "Un identificador único y apto para URL que se genera para cada workspace al crearlo, para cumplir las restricciones de las organizaciones.",
    avoid: ["identificador del workspace", "código de organización"],
  },
];
