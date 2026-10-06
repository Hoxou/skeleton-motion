import React from "react";
import Layout from "@theme/Layout";
import useBaseUrl from "@docusaurus/useBaseUrl";
import { Button } from "@base-ui/react/button";
import "@fontsource-variable/instrument-sans";
import SiteHeader from "../components/SiteHeader";
import buttons from "../components/buttons.module.css";
import styles from "./examples.module.css";

function ExampleTile({ className = "", dark, href, label, light, project }) {
  return (
    <Button
      className={`${styles.tile} ${className}`}
      nativeButton={false}
      render={<a href={href} aria-label={`View ${label} in the ${project} Display Room`} />}
    >
      <span className={styles.assetThemePair}>
        <img className={styles.lightAsset} src={light} alt="" />
        <img className={styles.darkAsset} src={dark} alt="" />
      </span>
      <span className={styles.overlay} aria-hidden="true">
        <span className={`${buttons.actionButton} ${buttons.createButton} ${styles.viewButton}`}>View</span>
      </span>
    </Button>
  );
}

export default function Examples() {
  const qaPreview = useBaseUrl("qa-segnatura-motion-set.preview.html");
  const bisonPreview = useBaseUrl("ai-project-operations-for-voice-first-product-teams-bisonflow-fl.preview.html");
  const studioPreview = useBaseUrl("skeleton-motion-studio-set.preview.html");
  const qa = (name, theme) => useBaseUrl(`qa-segnatura-motion-set.${name}.${theme}.svg`);
  const bison = (theme) => useBaseUrl(`ai-project-operations-for-voice-first-product-teams-bisonflow-fl.${theme}.svg`);
  const studio = (name, theme) => useBaseUrl(`skeleton-motion-studio-set.${name}.${theme}.svg`);

  const examples = [
    {
      className: styles.feature,
      project: "BisonFlow",
      label: "Voice becomes structured work",
      light: bison("light"),
      dark: bison("dark"),
      href: `${bisonPreview}?scene=display`,
    },
    {
      className: styles.tall,
      project: "qa-segnatura",
      label: "Insert a workflow step",
      light: qa("insert-step.4x5", "light"),
      dark: qa("insert-step.4x5", "dark"),
      href: `${qaPreview}?asset=insert-step&scene=display`,
    },
    {
      className: styles.tall,
      project: "qa-segnatura",
      label: "Confirm an edit",
      light: qa("confirm-edit.4x5", "light"),
      dark: qa("confirm-edit.4x5", "dark"),
      href: `${qaPreview}?asset=confirm-edit&scene=split`,
    },
    {
      className: styles.feature,
      project: "qa-segnatura",
      label: "Follow the progress signal",
      light: qa("progress-signal", "light"),
      dark: qa("progress-signal", "dark"),
      href: `${qaPreview}?asset=progress-signal&scene=bento`,
    },
    {
      project: "qa-segnatura",
      label: "Move from list to detail",
      light: qa("select-item", "light"),
      dark: qa("select-item", "dark"),
      href: `${qaPreview}?asset=select-item&scene=card`,
    },
    {
      project: "Studio",
      label: "Assign a color",
      light: studio("assign-color", "light"),
      dark: studio("assign-color", "dark"),
      href: `${studioPreview}?asset=assign-color&scene=display`,
    },
    {
      project: "Studio",
      label: "Snap to grid",
      light: studio("snap-to-grid", "light"),
      dark: studio("snap-to-grid", "dark"),
      href: `${studioPreview}?asset=snap-to-grid&scene=display`,
    },
  ];

  return (
    <Layout title="Examples" description="Generated Skeleton Motion assets shown in their source-styled Display Rooms.">
      <SiteHeader />
      <main className={`skeleton-motion-examples ${styles.page}`}>
        <header className={styles.intro}>
          <p>Examples</p>
          <h1>Different products should move differently.</h1>
        </header>
        <section className={styles.grid} aria-label="Generated motion examples">
          {examples.map((example) => <ExampleTile key={example.label} {...example} />)}
        </section>
      </main>
    </Layout>
  );
}
