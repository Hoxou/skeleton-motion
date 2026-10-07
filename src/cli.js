import fs from "node:fs/promises";
import path from "node:path";
import { analyzeSource } from "./analyze.js";
import { HELP, parseArgs } from "./args.js";
import { exportMedia } from "./export-media.js";
import { generateCollection } from "./generate.js";
import { createZip } from "./zip.js";

export async function run(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(HELP.trim());
    return;
  }

  console.log(`Analyzing ${options.source}`);
  const analysis = await analyzeSource(options.source);
  const typographyAsset = analysis.typography?.asset;
  const result = generateCollection(analysis, options, {
    fontExtension: typographyAsset ? path.extname(typographyAsset).toLowerCase() : undefined,
  });
  const { archiveFile, assets, collectionName, files, fontFile, manifest, skipped, svgByVariant } = result;
  for (const { format, label } of skipped) console.log(`  ${label} / ${format}: not yet composed for this shape, skipped`);
  await fs.mkdir(options.out, { recursive: true });

  const generatedFiles = [];
  if (fontFile) {
    await fs.copyFile(typographyAsset, path.join(options.out, fontFile));
    generatedFiles.push(fontFile);
  }
  for (const file of files) {
    await fs.writeFile(path.join(options.out, file.name), file.data);
    generatedFiles.push(file.name);
  }

  for (const format of options.formats.filter((item) => ["gif", "webm", "mp4"].includes(item))) {
    for (const asset of assets) {
      for (const scene of asset.scenes) {
        const base = scene.file.replace(/\.svg$/, "");
        const output = path.join(options.out, `${base}.${format}`);
        console.log(`Exporting ${path.basename(output)}`);
        await exportMedia(svgByVariant.get(base), scene, format, output);
        generatedFiles.push(path.basename(output));
      }
    }
  }

  await fs.writeFile(path.join(options.out, manifest.name), manifest.data);
  generatedFiles.push(manifest.name);

  const archiveEntries = await Promise.all([...new Set(generatedFiles)].map(async (file) => ({
    data: await fs.readFile(path.join(options.out, file)),
    name: file,
  })));
  await fs.writeFile(path.join(options.out, archiveFile), createZip(archiveEntries));

  console.log(`Generated ${assets.length} asset${assets.length === 1 ? "" : "s"} in ${options.out}`);
  for (const asset of assets) for (const scene of asset.scenes) console.log(`  ${asset.label} / ${scene.format.id} / ${scene.theme}: ${scene.file}`);
  if (options.formats.includes("html")) console.log(`  preview: ${collectionName}.preview.html`);
  console.log(`  archive: ${archiveFile}`);
}
