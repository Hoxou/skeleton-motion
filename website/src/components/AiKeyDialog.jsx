import React, { useEffect, useState } from "react";
import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { Field } from "@base-ui/react/field";
import { Tabs } from "@base-ui/react/tabs";
import buttons from "./buttons.module.css";
import dialog from "../pages/index.module.css";
import styles from "./AiKeyDialog.module.css";
import { PROVIDERS, removeAiKey, saveAiKey } from "./aiKey";

const DATE = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * Settings for the visitor's own AI key. `ownKey` describes the saved key
 * (never the key itself); `notice` explains why the dialog opened.
 */
export default function AiKeyDialog({ notice, onChange, onOpenChange, open, ownKey }) {
  const [provider, setProvider] = useState("gemini");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setProvider(ownKey?.provider || "gemini");
    setModel(ownKey?.model || "");
    setBaseUrl("");
    setKey("");
    setError("");
  }, [open, ownKey]);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const settings = { key, model, provider, ...(provider === "openai-compatible" ? { baseUrl } : {}) };
    // The key leaves component state as soon as it is sent.
    setKey("");
    try {
      onChange(await saveAiKey(settings));
      onOpenChange(false);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      onChange(await removeAiKey());
      onOpenChange(false);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const compatible = provider === "openai-compatible";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={dialog.dialogBackdrop} />
        <Dialog.Viewport className={dialog.dialogViewport}>
          <Dialog.Popup className={`${dialog.dialogPopup} ${styles.popup}`}>
            <Dialog.Title className={dialog.dialogTitle}>Use your own AI key</Dialog.Title>
            <Dialog.Description className={dialog.dialogDescription}>
              {notice ? `${notice} ` : ""}Your key is checked with the provider, then stored encrypted. It is never shown again, never logged, and you can remove it at any time.
            </Dialog.Description>
            {ownKey && (
              <p className={styles.saved}>
                Saved: {PROVIDERS[ownKey.provider]?.label || ownKey.provider}{ownKey.model ? ` (${ownKey.model})` : ""}{ownKey.baseHost ? ` at ${ownKey.baseHost}` : ""}, {DATE.format(new Date(ownKey.savedAt))}.
              </p>
            )}
            <form className={styles.form} onSubmit={save}>
              <Tabs.Root value={provider} onValueChange={setProvider}>
                <Tabs.List className={styles.tabs} aria-label="AI provider">
                  {Object.entries(PROVIDERS).map(([value, item]) => (
                    <Tabs.Tab key={value} className={`${buttons.actionButton} ${styles.tab}`} value={value}>{item.label}</Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.Root>
              <Field.Root className={styles.field}>
                <Field.Label className={styles.label}>API key</Field.Label>
                <Field.Control
                  className={styles.input}
                  type="password"
                  name="ai-api-key"
                  autoComplete="off"
                  spellCheck={false}
                  data-1p-ignore=""
                  data-lpignore="true"
                  data-bwignore=""
                  required
                  placeholder={ownKey ? "Paste a new key to replace the saved one" : "Paste your key"}
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                />
              </Field.Root>
              <Field.Root className={styles.field}>
                <Field.Label className={styles.label}>Model</Field.Label>
                <Field.Control className={styles.input} required={compatible} placeholder={PROVIDERS[provider].modelHint} value={model} onChange={(event) => setModel(event.target.value)} />
              </Field.Root>
              {compatible && (
                <Field.Root className={styles.field}>
                  <Field.Label className={styles.label}>Provider URL</Field.Label>
                  <Field.Control className={styles.input} type="url" placeholder="https://api.openai.com/v1" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
                </Field.Root>
              )}
              {error && <p className={styles.error} role="alert">{error}</p>}
              <div className={dialog.dialogActions}>
                <Button className={`${buttons.actionButton} ${buttons.createButton}`} type="submit" disabled={busy}>{busy ? "Checking" : "Save key"}</Button>
                {ownKey && <Button className={`${buttons.actionButton} ${buttons.folderButton}`} type="button" disabled={busy} onClick={remove}>Remove key</Button>}
                <Dialog.Close className={`${buttons.actionButton} ${buttons.folderButton}`}>Cancel</Dialog.Close>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
