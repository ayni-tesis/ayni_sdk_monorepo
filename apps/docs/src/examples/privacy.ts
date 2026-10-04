import source from "../../../../packages/sdk_flutter/example/privacy.dart?raw";
import { exampleRegion } from "./region";

/** The Dart snippets of `Recursos → Datos y privacidad` (US-147). */
export const privacy = {
  deleteData: exampleRegion(source, "borrar-datos"),
  resetInstallationId: exampleRegion(source, "restablecer-identificador-instalacion"),
  captureEvidence: exampleRegion(source, "capturar-evidencia"),
  deleteEvidence: exampleRegion(source, "borrar-evidencia"),
  pendingEvidence: exampleRegion(source, "evidencia-pendiente"),
  evidenceQueueStatus: exampleRegion(source, "estado-cola-evidencia"),
  uploadEvidence: exampleRegion(source, "subir-evidencia"),
  evidenceStatus: exampleRegion(source, "estado-de-cada-evidencia"),
};
