import React, { useEffect, useState } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";
import { useColorMode } from "@docusaurus/theme-common";
import { Badge, Button, Dialog, Flex, Text, TextField, Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import styles from "./index.module.css";

const STORAGE_KEY = "skeleton-motion:v1:pending-source";

function HomeContent() {
  const { colorMode } = useColorMode();
  const [source, setSource] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const insertLight = useBaseUrl("qa-segnatura-motion-set.insert-step.light.svg");
  const insertDark = useBaseUrl("qa-segnatura-motion-set.insert-step.dark.svg");
  const setPreview = useBaseUrl("qa-segnatura-motion-set.preview.html");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setSource(saved);
  }, []);

  function submit(event) {
    event.preventDefault();
    const value = source.trim();
    if (!value) return;
    window.localStorage.setItem(STORAGE_KEY, value);
    setDialogOpen(true);
  }

  return (
    <Theme accentColor="blue" appearance={colorMode} grayColor="sand" radius="large" scaling="100%">
        <main className={styles.page}>
          <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <Badge size="2" variant="soft">Local-first · open source</Badge>
              <h1>Your product already knows how it should move.</h1>
              <p>Skeleton Motion reads the interface language, finds the useful moments, and turns them into a coordinated set of lightweight landing-page animations.</p>
              <form className={styles.sourceForm} onSubmit={submit}>
                <label htmlFor="source">Repository path or public URL</label>
                <Flex gap="3" align="center" className={styles.inputRow}>
                  <TextField.Root id="source" size="3" value={source} onChange={(event) => setSource(event.target.value)} placeholder="/Users/me/project or https://example.com" aria-label="Repository path or public URL" />
                  <Button size="3" type="submit">Create a set</Button>
                </Flex>
                <span>Saved only in this browser for now. Local repositories require the companion CLI.</span>
              </form>
            </div>
            <div className={styles.heroVisual} aria-label="Generated qa-segnatura motion example">
              <picture>
                <source media="(prefers-color-scheme: dark)" srcSet={insertDark} />
                <img src={insertLight} alt="A generated workflow step insertion animation" />
              </picture>
            </div>
          </section>

          <section className={styles.statement}>
            <p>Not a screen recording. Not a generic template.</p>
            <h2>A small motion system composed from the source.</h2>
          </section>

          <section className={styles.process}>
            {[
              ["01", "Read the product", "Routes, components, colors, type, spacing, and interaction evidence are gathered programmatically."],
              ["02", "Plan distinct stories", "AI can enrich the plan, while the deterministic engine keeps motion, colors, and output safe."],
              ["03", "Export the set", "Light and dark SVGs, a source-styled Display Room, a manifest, and one downloadable ZIP."],
            ].map(([number, title, body]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}
          </section>

          <section className={styles.demoBand}>
            <div><p className={styles.kicker}>Generated from qa-segnatura</p><h2>One visual language. Four different moments.</h2></div>
            <Button asChild size="3" variant="outline"><a href={setPreview}>Open the Display Room</a></Button>
          </section>

          <section className={styles.localSection}>
            <div><p className={styles.kicker}>The useful boundary</p><h2>Your code and credentials stay with your local tools.</h2></div>
            <div><p>A static web page cannot safely inspect a private repository or start Codex and Claude Code. The planned Studio connects to a loopback companion, detects the AI tools you already installed, and stores generated work on your machine.</p><Flex gap="3" wrap="wrap"><Button asChild variant="soft"><Link to="/docs/agent-integrations/overview">How adapters work</Link></Button><Button asChild variant="ghost"><Link to="/docs/roadmap">Read the roadmap</Link></Button></Flex></div>
          </section>
        </main>

        <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
          <Dialog.Content maxWidth="520px">
            <Dialog.Title>Connect a local planner</Dialog.Title>
            <Dialog.Description size="2" mb="4">The public site cannot run a local CLI or read a repository by itself. Install the Skeleton Motion companion, then connect an existing Codex or Claude Code login. Provider credentials never enter this page.</Dialog.Description>
            <Flex direction="column" gap="3">
              <Button asChild><Link to="/docs/agent-integrations/overview">Open local setup</Link></Button>
              <Button variant="soft" onClick={() => setDialogOpen(false)}>Keep this source for later</Button>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
    </Theme>
  );
}

export default function Home() {
  return (
    <Layout title="Motion assets from your product" description="Generate a coordinated set of source-aware landing-page animations from a repository or URL.">
      <HomeContent />
    </Layout>
  );
}
