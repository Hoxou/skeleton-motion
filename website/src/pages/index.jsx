import React, { useEffect, useRef, useState } from "react";
import Layout from "@theme/Layout";
import useBaseUrl from "@docusaurus/useBaseUrl";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { Field } from "@base-ui/react/field";
import { Form } from "@base-ui/react/form";
import "@fontsource-variable/instrument-sans";
import AiKeyDialog from "../components/AiKeyDialog";
import GeneratingStage from "../components/GeneratingStage";
import { PROVIDERS } from "../components/aiKey";
import SiteHeader from "../components/SiteHeader";
import buttons from "../components/buttons.module.css";
import styles from "./index.module.css";

const DIALOGS = {
  folder: {
    title: "Folder upload is coming next",
    description: "For now, paste the public URL of the product. Skeleton Motion reads its colors, type, and layout from the live page.",
  },
  error: { title: "That one did not work" },
};

// Answers that mean "bring your own key" rather than "something broke".
const KEY_WALL = new Set(["free-uses-exhausted", "hosted-busy", "hosted-unavailable", "key-unreadable", "own-keys-unavailable", "ai-auth"]);

async function requestJob(source) {
  const response = await fetch("/api/jobs", {
    body: JSON.stringify({ source }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || `Generation failed (${response.status})`), { code: body.code });
  return body.job;
}

// Matches the 820px breakpoint where the source form docks to the bottom.
const DOCKED_QUERY = "(max-width: 820px)";

// Height of the on-screen keyboard (or any browser UI) covering the bottom of
// the layout viewport. A fixed bottom bar stays under the iOS keyboard unless
// it is lifted by this much.
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const measure = () => setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, []);
  return inset;
}

function MotionPicture({ alt, dark, light }) {
  return (
    <span className={styles.assetThemePair}>
      <img className={styles.lightAsset} src={light} alt={alt} />
      <img className={styles.darkAsset} src={dark} alt={alt} />
    </span>
  );
}

function HomeContent() {
  const { siteConfig } = useDocusaurusContext();
  const { appUrl, hosted } = siteConfig.customFields;
  const [source, setSource] = useState("");
  const [dialog, setDialog] = useState(null);
  const [working, setWorking] = useState(false);
  const [quota, setQuota] = useState(null);
  const [keyDialog, setKeyDialog] = useState({ notice: "", open: false });
  const folderInput = useRef(null);
  const sourceInput = useRef(null);
  const keyboardInset = useKeyboardInset();

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
    const linked = new URLSearchParams(window.location.search).get("source");
    if (linked) setSource(linked);
    if (hosted) fetch("/api/ai/status").then((response) => response.json()).then(setQuota).catch(() => {});
  }, [hosted]);

  async function submit(event) {
    event.preventDefault();
    const value = source.trim();
    if (!value || working) return;
    // The Pages mirror has no API; generation happens on the app origin.
    if (!hosted) {
      window.location.assign(`${appUrl}/?source=${encodeURIComponent(value)}`);
      return;
    }
    const ownKey = quota?.ownKey;
    if (!ownKey && quota && quota.remaining <= 0) {
      setKeyDialog({ notice: `You've used your ${quota.freeUses} free generations.`, open: true });
      return;
    }
    setWorking(true);
    window.scrollTo({ top: 0 });
    try {
      const job = await requestJob(value);
      window.location.assign(job.url);
    } catch (error) {
      setWorking(false);
      if (KEY_WALL.has(error.code)) setKeyDialog({ notice: error.message, open: true });
      else setDialog({ ...DIALOGS.error, description: error.message });
    }
  }

  function chooseFolder(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const folderName = file.webkitRelativePath?.split("/")[0] || file.name;
    setSource(folderName);
    setDialog(DIALOGS.folder);
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
        {working ? <GeneratingStage source={source} /> : (
          <>
            <section className={styles.hero} id="create">
              <div className={styles.composer}>
                <h1>What should move?</h1>
                <Form className={styles.sourceForm} onSubmit={submit} style={{ "--keyboard-inset": `${keyboardInset}px` }}>
                  <Field.Root name="source" className={styles.sourceField}>
                    <Field.Control
                      ref={sourceInput}
                      aria-label="Repository path or public URL"
                      autoComplete="off"
                      onChange={(event) => setSource(event.target.value)}
                      placeholder="Enter your product's URL"
                      value={source}
                    />
                  </Field.Root>
                  <div className={styles.formActions}>
                    <Button className={`${buttons.actionButton} ${buttons.folderButton} ${styles.locateFolder}`} type="button" onClick={() => folderInput.current?.click()}>Locate folder</Button>
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
                <p className={styles.status} aria-live="polite">
                  {hosted && (
          <>
                      {quota?.ownKey ? `Using your own ${PROVIDERS[quota.ownKey.provider]?.label || "AI"} key. ` : quota ? `${quota.remaining} of ${quota.freeUses} free generations left. ` : ""}
                      <Button className={styles.inlineLink} type="button" onClick={() => setKeyDialog({ notice: "", open: true })}>{quota?.ownKey ? "Manage key" : "Use your own AI key"}</Button>
                      <span className={styles.statusNote}>Generations are listed in the public gallery with their page URL.</span>
          </>
                  )}
                </p>
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
                onClick={() => {
                    if (window.matchMedia(DOCKED_QUERY).matches) sourceInput.current?.focus();
                    else window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
              >
                Create
              </Button>
            </section>
          </>
        )}
      </main>

      <AiKeyDialog
        notice={keyDialog.notice}
        open={keyDialog.open}
        ownKey={quota?.ownKey || null}
        onChange={(ownKey) => setQuota((current) => ({ ...current, ownKey }))}
        onOpenChange={(open) => setKeyDialog((current) => ({ ...current, open }))}
      />

      <Dialog.Root open={Boolean(dialog)} onOpenChange={(open) => !open && setDialog(null)}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.dialogBackdrop} />
          <Dialog.Viewport className={styles.dialogViewport}>
            <Dialog.Popup className={styles.dialogPopup}>
              <Dialog.Title className={styles.dialogTitle}>{dialog?.title}</Dialog.Title>
              <Dialog.Description className={styles.dialogDescription}>{dialog?.description}</Dialog.Description>
              <div className={styles.dialogActions}>
                <Dialog.Close className={`${buttons.actionButton} ${buttons.createButton}`}>Got it</Dialog.Close>
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
