import React, { useEffect, useState } from "react";
import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import buttons from "../../../website/src/components/buttons.module.css";
import { componentName, elementName, groupVariants, htmlCode, reactCode } from "./exportCode.js";
import styles from "./CopyCode.module.css";

const FORMATS = {
  react: { build: reactCode, extension: "jsx", label: "React", type: "text/javascript" },
  html: { build: htmlCode, extension: "html", label: "HTML", type: "text/html" },
};

async function loadSvgs(shapes) {
  const files = [...new Set(shapes.flatMap((shape) => [shape.light, shape.dark]).filter(Boolean))];
  const entries = await Promise.all(files.map(async (file) => {
    const response = await fetch(`./${file}`);
    if (!response.ok) throw new Error(`Could not load ${file} (${response.status})`);
    return [file, await response.text()];
  }));
  return Object.fromEntries(entries);
}

// The dialog shows readable structure; Copy and Download use the full markup.
function elided(svgByFile) {
  return Object.fromEntries(Object.entries(svgByFile).map(([file, svg]) => [file, `<svg>... ${Math.round(svg.length / 1024)} KB ...</svg>`]));
}

function usageLine(format, label) {
  return format === "react"
    ? `import ${componentName(label)} from "./${componentName(label)}";\n\n<${componentName(label)} theme="auto" style={{ width: "100%" }} />`
    : `<${elementName(label)} theme="auto" style="display: block; width: 100%"></${elementName(label)}>`;
}

export default function CopyCode({ asset }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState("react");
  const [svgs, setSvgs] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const shapes = groupVariants(asset.variants);
  const input = { alt: asset.copy?.title || asset.label, label: asset.label, shapes };

  useEffect(() => {
    if (!open) return;
    setSvgs(null);
    setError(null);
    if (location.protocol === "file:") {
      setError("Browsers block reading local files. Open this room from the Skeleton Motion app or a local web server to export code.");
      return;
    }
    loadSvgs(shapes).then(setSvgs, (failure) => setError(failure.message));
  }, [open, asset.id]);

  useEffect(() => setCopied(false), [format, asset.id]);

  const { build, extension, label, type } = FORMATS[format];
  const code = svgs ? build({ ...input, svgByFile: svgs }) : "";

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([code], { type }));
    const link = Object.assign(document.createElement("a"), { download: `${componentName(asset.label)}.${extension}`, href: url });
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={`${buttons.actionButton} ${buttons.folderButton} ${styles.trigger}`}>Copy code</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Title className={styles.title}>{asset.label} as code</Dialog.Title>
          <Dialog.Description className={styles.description}>
            One self-contained file with every frame shape ({shapes.map((shape) => shape.aspect).join(", ")}) in light and dark. It picks the shape closest to its box and follows the visitor's color scheme.
          </Dialog.Description>
          <Tabs.Root value={format} onValueChange={setFormat}>
            <Tabs.List className={styles.tabs} aria-label="Code format">
              {Object.entries(FORMATS).map(([value, item]) => (
                <Tabs.Tab key={value} className={`${buttons.actionButton} ${styles.tab}`} value={value}>{item.label}</Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.Root>
          <p className={styles.label}>Use it</p>
          <pre className={styles.code}><code>{usageLine(format, asset.label)}</code></pre>
          <p className={styles.label}>{componentName(asset.label)}.{extension}</p>
          <pre className={`${styles.code} ${styles.source}`}>
            <code>{error || (svgs ? build({ ...input, svgByFile: elided(svgs) }) : "Loading animation files")}</code>
          </pre>
          <div className={styles.actions}>
            <Button className={`${buttons.actionButton} ${buttons.createButton}`} type="button" disabled={!svgs} onClick={copy}>
              {copied ? "Copied" : `Copy ${label}`}
            </Button>
            <Button className={`${buttons.actionButton} ${buttons.folderButton}`} type="button" disabled={!svgs} onClick={download}>
              Download .{extension}
            </Button>
            <Dialog.Close className={`${buttons.actionButton} ${buttons.folderButton}`}>Close</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
