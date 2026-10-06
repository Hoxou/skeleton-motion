import React, { useEffect, useRef, useState } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";
import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { Field } from "@base-ui/react/field";
import { Form } from "@base-ui/react/form";
import "@fontsource-variable/instrument-sans";
import SiteHeader from "../components/SiteHeader";
import buttons from "../components/buttons.module.css";
import styles from "./index.module.css";

const STORAGE_KEY = "skeleton-motion:v1:pending-source";

function MotionPicture({ alt, dark, light }) {
  return (
    <span className={styles.assetThemePair}>
      <img className={styles.lightAsset} src={light} alt={alt} />
      <img className={styles.darkAsset} src={dark} alt={alt} />
    </span>
  );
}

function HomeContent() {
  const [source, setSource] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const folderInput = useRef(null);

  const asset = (name) => ({
    light: useBaseUrl(`img/landing/${name}.light.svg`),
    dark: useBaseUrl(`img/landing/${name}.dark.svg`),
  });
  const assets = {
    select: asset("select-item"),
    insert: asset("insert-step"),
    progress: asset("progress-signal"),
    assignColor: {
      light: useBaseUrl("skeleton-motion-studio-set.assign-color.light.svg"),
      dark: useBaseUrl("skeleton-motion-studio-set.assign-color.dark.svg"),
    },
  };

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setSource(saved);
  }, []);

  function remember(value) {
    setSource(value);
    window.localStorage.setItem(STORAGE_KEY, value);
  }

  function submit(event) {
    event.preventDefault();
    const value = source.trim();
    if (!value) return;
    remember(value);
    setDialogOpen(true);
  }

  function chooseFolder(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const folderName = file.webkitRelativePath?.split("/")[0] || file.name;
    remember(folderName);
    setDialogOpen(true);
    event.target.value = "";
  }

  const features = [
    {
      asset: assets.select,
      alt: "A product interface being reduced to its most useful visual elements",
      eyebrow: "Read the product",
      title: "It starts with what is already there.",
      body: "Skeleton Motion reads the interface language, interaction evidence, colors, type, spacing, and themes. The result belongs to the product instead of looking like a reusable template.",
    },
    {
      asset: assets.insert,
      alt: "A coordinated motion story inserting a new workflow step",
      eyebrow: "Plan the set",
      title: "One visual language. Different stories.",
      body: "Each asset keeps the same design grammar while changing its choreography. A click answers. A new object opens real space. Continuous activity keeps moving while the main action happens.",
    },
    {
      asset: assets.progress,
      alt: "A lightweight signal animation prepared for a landing page",
      eyebrow: "Use it anywhere",
      title: "Small, transparent, and ready to place.",
      body: "Every set includes light and dark SVGs, a source-styled Display Room, a manifest, and one ZIP. The page controls the surrounding background, so the motion can float inside a card, a feature row, or open space.",
    },
    {
      asset: assets.assignColor,
      alt: "A shape's color updating immediately after a swatch click, with the rest of the canvas holding still",
      eyebrow: "Design system",
      title: "Make the shape match the system.",
      body: "A swatch click updates the shape's color immediately; the rest of the canvas holds still.",
    },
  ];

  return (
    <>
      <SiteHeader />

      <main className={`skeleton-motion-home ${styles.page}`}>
        <section className={styles.hero} id="create">
          <div className={styles.composer}>
            <h1>What should move?</h1>
            <Form className={styles.sourceForm} onSubmit={submit}>
              <Field.Root name="source" className={styles.sourceField}>
                <Field.Control
                  aria-label="Repository path or public URL"
                  autoComplete="off"
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="Enter a URL or locate a local folder"
                  value={source}
                />
              </Field.Root>
              <div className={styles.formActions}>
                <Button className={`${buttons.actionButton} ${buttons.folderButton}`} type="button" onClick={() => folderInput.current?.click()}>Locate folder</Button>
                <Button className={`${buttons.actionButton} ${buttons.createButton}`} type="submit">Create</Button>
              </div>
              <input
                ref={folderInput}
                className={styles.folderInput}
                type="file"
                multiple
                webkitdirectory=""
                directory=""
                onChange={chooseFolder}
                tabIndex={-1}
                aria-hidden="true"
              />
            </Form>
          </div>
        </section>

        <section className={styles.story} aria-label="How Skeleton Motion works">
          {features.map((feature, index) => (
            <article className={`${styles.feature} ${index % 2 ? styles.featureReverse : ""}`} key={feature.title}>
              <div className={styles.featureCopy}>
                <p className={styles.eyebrow}>{feature.eyebrow}</p>
                <h2>{feature.title}</h2>
                <p>{feature.body}</p>
              </div>
              <div className={styles.featureAsset}>
                <MotionPicture {...feature.asset} alt={feature.alt} />
              </div>
            </article>
          ))}
        </section>

        <section className={styles.finalCta}>
          <div>
            <span>Make the useful moment move.</span>
            <strong>Start with your product.</strong>
          </div>
          <Button
            className={`${buttons.actionButton} ${buttons.createButton} ${styles.ctaButton}`}
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            Create
          </Button>
        </section>
      </main>

      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.dialogBackdrop} />
          <Dialog.Viewport className={styles.dialogViewport}>
            <Dialog.Popup className={styles.dialogPopup}>
              <Dialog.Title className={styles.dialogTitle}>Connect a local planner</Dialog.Title>
              <Dialog.Description className={styles.dialogDescription}>
                The public site cannot run a local CLI or inspect a repository by itself. Start the local companion, then use an existing Codex or Claude Code login. Provider credentials never enter this page.
              </Dialog.Description>
              <div className={styles.dialogActions}>
                <Button className={`${buttons.actionButton} ${buttons.createButton}`} render={<Link to="/docs/agent-integrations/overview" />}>Open local setup</Button>
                <Dialog.Close className={`${buttons.actionButton} ${buttons.folderButton}`}>Keep this source for later</Dialog.Close>
              </div>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

export default function Home() {
  return (
    <Layout title="Motion assets from your product" description="Generate a coordinated set of source-aware landing-page animations from a repository or URL.">
      <HomeContent />
    </Layout>
  );
}
