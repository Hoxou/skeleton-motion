import React from "react";
import styles from "./scenes.module.css";

// The CLI writes the primary frame shape first; Display/Card/... show it.
function primaryVariants(asset) {
  const primary = asset.variants[0].format;
  return asset.variants.filter((variant) => variant.format === primary);
}

function formatsOf(asset) {
  return [...new Set(asset.variants.map((variant) => variant.format).filter(Boolean))];
}

// A light/dark pair swaps purely in CSS (same pattern as the site's asset
// galleries); a single-theme asset stays visible in both themes.
function AssetImage({ asset, variants = primaryVariants(asset), detail = "" }) {
  const light = variants.find((variant) => variant.theme === "light") || variants[0];
  const dark = variants.find((variant) => variant.theme === "dark");
  const image = (variant, className) => (
    <img
      className={`${styles.asset} ${className}`}
      src={`./${variant.file}`}
      width={variant.width}
      height={variant.height}
      alt={`${asset.label} product motion${detail}, ${variant.theme} theme`}
    />
  );
  if (!dark || dark === light) return image(light, "");
  return <>{image(light, styles.lightAsset)}{image(dark, styles.darkAsset)}</>;
}

function Copy({ asset, heading: Heading = "h2", titleClass = "" }) {
  return (
    <div>
      <p className={styles.eyebrow}>{asset.copy.eyebrow}</p>
      <Heading className={`${styles.title} ${titleClass}`}>{asset.copy.title}</Heading>
      <p className={styles.body}>{asset.copy.description}</p>
    </div>
  );
}

function Display({ asset }) {
  return <div className={styles.displaySlot}><AssetImage asset={asset} /></div>;
}

function Card({ asset }) {
  return (
    <article className={`${styles.surface} ${styles.featureCard}`}>
      <Copy asset={asset} />
      <div><AssetImage asset={asset} /></div>
    </article>
  );
}

function Split({ asset }) {
  return (
    <div className={styles.splitLayout}>
      <Copy asset={asset} heading="h1" />
      <div><AssetImage asset={asset} /></div>
    </div>
  );
}

function Bento({ asset }) {
  return (
    <div className={styles.bentoLayout}>
      <div className={`${styles.surface} ${styles.bentoAsset}`}><AssetImage asset={asset} /></div>
      <div className={`${styles.surface} ${styles.bentoCopy}`}><Copy asset={asset} titleClass={styles.bentoTitle} /></div>
      <div className={`${styles.surface} ${styles.bentoDetail}`} aria-hidden="true" />
    </div>
  );
}

function Story({ assets }) {
  return (
    <div className={styles.storyLayout}>
      {assets.map((asset, index) => (
        <article key={asset.id} className={`${styles.storyRow} ${index % 2 ? styles.storyRowReverse : ""}`}>
          <Copy asset={asset} titleClass={styles.storyTitle} />
          <div className={styles.storyAsset}><AssetImage asset={asset} /></div>
        </article>
      ))}
    </div>
  );
}

function Overview({ assets }) {
  return (
    <div className={styles.setGrid}>
      {assets.map((asset) => (
        <article key={asset.id} className={`${styles.surface} ${styles.setCard}`}>
          <div className={styles.setCardLabel}>{asset.label}</div>
          <AssetImage asset={asset} />
        </article>
      ))}
    </div>
  );
}

function Formats({ asset }) {
  return (
    <div className={styles.formatsRow}>
      {formatsOf(asset).map((format) => {
        const variants = asset.variants.filter((variant) => variant.format === format);
        return (
          <figure key={format} className={styles.formatFigure}>
            <div className={styles.formatFrame} style={{ aspectRatio: `${variants[0].width} / ${variants[0].height}` }}>
              <AssetImage asset={asset} variants={variants} detail={`, ${format}`} />
            </div>
            <figcaption className={styles.formatCaption}>{format}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}

const SCENES = [
  { id: "display", label: "Display", Scene: Display },
  { id: "card", label: "Card", Scene: Card },
  { id: "split", label: "Split", Scene: Split },
  { id: "bento", label: "Bento", Scene: Bento },
  { id: "story", label: "Story", Scene: Story, showsAllAssets: true, available: (assets) => assets.length > 1 },
  { id: "overview", label: "Set", Scene: Overview, showsAllAssets: true, available: (assets) => assets.length > 1 },
  { id: "formats", label: "Formats", Scene: Formats, available: (assets) => assets.some((asset) => formatsOf(asset).length > 1) },
];

export function scenesFor(assets) {
  return SCENES.filter((scene) => !scene.available || scene.available(assets));
}
