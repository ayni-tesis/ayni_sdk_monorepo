import source from "../../../../packages/sdk_flutter/example/configuration.dart?raw";
import { exampleRegion } from "./region";

/** The Dart snippets of `Comenzar → Instalación y configuración` (US-140). */
export const configuration = {
  production: exampleRegion(source, "produccion"),
  localDevelopment: exampleRegion(source, "desarrollo-local"),
};
