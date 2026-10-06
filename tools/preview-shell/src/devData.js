// `npm run dev` only: the qa-segnatura set, served by vite.config.js's publicDir.
import manifest from "../../../examples/qa-segnatura-set/qa-segnatura-motion-set.manifest.json";
import { previewInputFromManifest, roomData } from "../../../src/room-data.js";

export default roomData(previewInputFromManifest(manifest, "qa-segnatura-motion-set.manifest.json"));
