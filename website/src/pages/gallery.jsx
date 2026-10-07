import React, { useCallback, useEffect, useState } from "react";
import Layout from "@theme/Layout";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import "@fontsource-variable/instrument-sans";
import SiteHeader from "../components/SiteHeader";
import buttons from "../components/buttons.module.css";
import tiles from "./examples.module.css";
import home from "./index.module.css";
import styles from "./gallery.module.css";

const RESTORE_HASH = /^#restore=([A-Za-z0-9_-]{43})$/;
const TABS = ["mine", "all"];
const DATE = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

async function api(path, init) {
  const response = await fetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function postJson(path, body) {
  return api(path, { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST" });
}

// Same rhythm as the Examples page: a wide feature, then tall and regular
// tiles. Tall tiles show the job's 4:5 variant, so a job without one stays regular.
const RHYTHM = ["feature", "tall", "regular", "regular", "tall", "regular", "regular", "regular"];

function tileFor(job, index) {
  const kind = RHYTHM[index % RHYTHM.length];
  if (kind === "tall" && job.heroes?.["4:5"]) return { kind, shape: job.heroes["4:5"] };
  const wide = job.heroes?.["16:9"] || { dark: job.heroDark, light: job.heroLight };
  return { kind: kind === "tall" ? "regular" : kind, shape: wide };
}

function GenerationTile({ job, index, children }) {
  const host = new URL(job.source).hostname.replace(/^www\./, "");
  const { kind, shape } = tileFor(job, index);
  const asset = (file) => `/jobs/${job.id}/${file}`;
  return (
    <article className={`${styles.card} ${kind === "regular" ? "" : tiles[kind]}`}>
      <Button className={`${tiles.tile} ${styles.tile}`} nativeButton={false} render={<a href={job.url} aria-label={`Open ${host} in its Display Room`} />}>
        <span className={tiles.assetThemePair}>
          <img className={tiles.lightAsset} src={asset(shape.light || shape.dark)} alt="" loading="lazy" />
          <img className={tiles.darkAsset} src={asset(shape.dark || shape.light)} alt="" loading="lazy" />
        </span>
        <span className={tiles.overlay} aria-hidden="true">
          <span className={`${buttons.actionButton} ${buttons.createButton} ${tiles.viewButton}`}>View</span>
        </span>
      </Button>
      <p className={styles.caption}>
        <strong>{host}</strong>
        <span>{DATE.format(new Date(job.createdAt))}</span>
      </p>
      {children && <div className={styles.cardAction}>{children}</div>}
    </article>
  );
}

function VisibilityButton({ job, onChange }) {
  const [busy, setBusy] = useState(false);
  const next = job.visibility === "public" ? "private" : "public";
  async function toggle() {
    setBusy(true);
    try {
      await postJson(`/api/jobs/${job.id}/visibility`, { visibility: next });
      onChange({ ...job, visibility: next });
    } catch {
      // Unchanged label already reflects the stored state.
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button
      className={`${buttons.actionButton} ${buttons.folderButton} ${styles.visibilityButton}`}
      type="button"
      disabled={busy}
      onClick={toggle}
      aria-label={`${job.visibility === "public" ? "Public" : "Private"}. Make ${next}`}
    >
      {job.visibility === "public" ? "Public" : "Private"}
    </Button>
  );
}

function EmptyState({ children, action }) {
  return (
    <div className={styles.empty}>
      <p>{children}</p>
      {action}
    </div>
  );
}

function MyGenerations({ onBrowseAll }) {
  const [state, setState] = useState({ error: null, jobs: null, recoveryToken: null });
  const [restoreToken, setRestoreToken] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api("/api/gallery")
      .then(({ jobs, recoveryToken }) => setState({ error: null, jobs, recoveryToken }))
      .catch((error) => setState({ error: error.message, jobs: [], recoveryToken: null }));
  }, []);

  useEffect(() => {
    const match = window.location.hash.match(RESTORE_HASH);
    if (match) setRestoreToken(match[1]);
    load();
  }, [load]);

  async function restore() {
    await postJson("/api/gallery/restore", { token: restoreToken })
      .catch((error) => setState((current) => ({ ...current, error: error.message })));
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    setRestoreToken(null);
    load();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/gallery#restore=${state.recoveryToken}`);
    setCopied(true);
  }

  const replace = (updated) => setState((current) => ({ ...current, jobs: current.jobs.map((job) => (job.id === updated.id ? updated : job)) }));
  const { error, jobs } = state;
  return (
    <>
      {error && <p className={styles.notice}>{error}</p>}
      {jobs?.length === 0 && !error && (
        <EmptyState action={
          <>
            <Button className={`${buttons.actionButton} ${buttons.createButton}`} nativeButton={false} render={<a href="/" />}>Create a set</Button>
            <Button className={`${buttons.actionButton} ${buttons.folderButton}`} type="button" onClick={onBrowseAll}>See everyone's</Button>
          </>
        }>
          Nothing here yet. Every set you generate in this browser shows up here.
        </EmptyState>
      )}
      {jobs?.length > 0 && (
        <>
          <section className={tiles.grid} aria-label="Your generations">
            {jobs.map((job, index) => (
              <GenerationTile job={job} index={index} key={job.id}>
                <VisibilityButton job={job} onChange={replace} />
              </GenerationTile>
            ))}
          </section>
          <div className={styles.recovery}>
            <p>Saved in this browser. Keep this link private.</p>
            <Button className={`${buttons.actionButton} ${buttons.folderButton} ${styles.copyButton}`} type="button" onClick={copyLink}>
              {copied ? "Link copied" : "Copy gallery link"}
            </Button>
          </div>
        </>
      )}

      <Dialog.Root open={Boolean(restoreToken)} onOpenChange={(open) => !open && setRestoreToken(null)}>
        <Dialog.Portal>
          <Dialog.Backdrop className={home.dialogBackdrop} />
          <Dialog.Viewport className={home.dialogViewport}>
            <Dialog.Popup className={home.dialogPopup}>
              <Dialog.Title className={home.dialogTitle}>Open this gallery here?</Dialog.Title>
              <Dialog.Description className={home.dialogDescription}>
                This browser switches to the gallery from the link. Copy this browser's current gallery link first if you want to come back to it.
              </Dialog.Description>
              <div className={home.dialogActions}>
                <Button className={`${buttons.actionButton} ${buttons.createButton}`} type="button" onClick={restore}>Open gallery</Button>
                <Dialog.Close className={`${buttons.actionButton} ${buttons.folderButton}`}>Cancel</Dialog.Close>
              </div>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function AllGenerations() {
  const [jobs, setJobs] = useState(null);
  const [next, setNext] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (before) => {
    setLoading(true);
    try {
      const page = await api(`/api/gallery?scope=all${before ? `&before=${encodeURIComponent(before)}` : ""}`);
      setJobs((current) => [...(before ? current || [] : []), ...page.jobs]);
      setNext(page.next);
      setError(null);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      {error && <p className={styles.notice}>{error}</p>}
      {jobs?.length === 0 && !error && <EmptyState>No public generations yet.</EmptyState>}
      {jobs?.length > 0 && (
        <section className={tiles.grid} aria-label="Everyone's generations">
          {jobs.map((job, index) => <GenerationTile job={job} index={index} key={job.id} />)}
        </section>
      )}
      {next && (
        <div className={styles.more}>
          <Button className={`${buttons.actionButton} ${buttons.folderButton} ${styles.copyButton}`} type="button" disabled={loading} onClick={() => load(next)}>
            {loading ? "Loading" : "Load more"}
          </Button>
        </div>
      )}
    </>
  );
}

function HostedGallery() {
  const [tab, setTab] = useState("mine");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (TABS.includes(requested)) setTab(requested);
  }, []);

  // The tab lives in the URL so "All" can be linked directly.
  function select(value) {
    setTab(value);
    const url = new URL(window.location.href);
    if (value === "mine") url.searchParams.delete("tab");
    else url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url);
  }

  return (
    <Tabs.Root value={tab} onValueChange={select}>
      <Tabs.List className={styles.tabs} aria-label="Gallery">
        <Tabs.Tab className={`${buttons.actionButton} ${styles.tab}`} value="mine">My generations</Tabs.Tab>
        <Tabs.Tab className={`${buttons.actionButton} ${styles.tab}`} value="all">All</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="mine"><MyGenerations onBrowseAll={() => select("all")} /></Tabs.Panel>
      <Tabs.Panel value="all"><AllGenerations /></Tabs.Panel>
    </Tabs.Root>
  );
}

export default function Gallery() {
  const { siteConfig } = useDocusaurusContext();
  const { appUrl, hosted } = siteConfig.customFields;
  return (
    <Layout title="Gallery" description="Motion sets generated with Skeleton Motion: yours and everyone's.">
      <SiteHeader />
      <main className={`skeleton-motion-examples ${tiles.page}`}>
        <header className={tiles.intro}>
          <p>Gallery</p>
          <h1>See what moves.</h1>
        </header>
        {hosted ? <HostedGallery /> : (
          <EmptyState action={<Button className={`${buttons.actionButton} ${buttons.createButton}`} nativeButton={false} render={<a href={`${appUrl}/gallery`} />}>Open the app gallery</Button>}>
            Generations live on the Skeleton Motion app.
          </EmptyState>
        )}
      </main>
    </Layout>
  );
}
