import source from "../../../../packages/sdk_flutter/example/quickstart.dart?raw";
import { exampleRegion } from "./region";

/** The Dart snippets of `Comenzar → Inicio rápido`, one per step (US-139). */
export const quickstart = {
  saveCredential: exampleRegion(source, "guardar-credencial"),
  createClient: exampleRegion(source, "crear-cliente"),
  sync: exampleRegion(source, "sincronizar"),
  checkResult: exampleRegion(source, "revisar-resultado"),
};
