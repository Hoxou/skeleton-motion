import React, { useEffect, useState } from "react";
import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import styles from "./SiteHeader.module.css";

// Framework-free so the Display Room (tools/preview-shell) renders the same
// header as the site. SiteHeader.jsx wires it to Docusaurus.
const LINKS = [
  { label: "Gallery", to: "/gallery" },
  { label: "Examples", to: "/examples" },
  { label: "Docs", to: "/docs" },
  { label: "Support", to: "/support" },
  { label: "GitHub", href: "https://github.com/Hoxou/skeleton-motion" },
];

function ThemeToggle({ isDark, onToggle }) {
  return (
    <Button
      className={styles.iconButton}
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={onToggle}
    >
      <svg className={styles.themeToggleIcon} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        {isDark ? (
          <path
            fill="currentColor"
            d="M12 3a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 10a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm9-6a1 1 0 0 1-1 1h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1ZM5 12a1 1 0 0 1-1 1H3a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1Zm13.364 6.364a1 1 0 0 1-1.414 0l-.708-.708a1 1 0 1 1 1.415-1.414l.707.707a1 1 0 0 1 0 1.415Zm-11.314 0a1 1 0 0 1 0-1.415l.707-.707a1 1 0 1 1 1.415 1.414l-.708.708a1 1 0 0 1-1.414 0ZM18.364 5.636a1 1 0 0 1 0 1.414l-.708.708a1 1 0 1 1-1.414-1.415l.707-.707a1 1 0 0 1 1.415 0Zm-11.314 0a1 1 0 0 1 1.415 0l.707.707A1 1 0 1 1 7.758 7.76l-.708-.708a1 1 0 0 1 0-1.414Z"
          />
        ) : (
          <path
            fill="currentColor"
            d="M20.742 13.045a8.088 8.088 0 0 1-2.077.273c-4.47 0-8.09-3.62-8.09-8.09 0-.728.096-1.433.274-2.102a1 1 0 0 0-1.274-1.228A10.094 10.094 0 0 0 2 11.91C2 17.481 6.519 22 12.09 22a10.094 10.094 0 0 0 9.9-8.015 1 1 0 0 0-1.248-1.14Z"
          />
        )}
      </svg>
    </Button>
  );
}

// Phones only (see the 820px rule in SiteHeader.module.css); the theme toggle
// stays outside it. A full-height drawer rather than an anchored popup: a
// small dropdown left no room for five link targets at a thumb-friendly size.
function BurgerMenu({ LinkComponent }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={`${styles.iconButton} ${styles.burger}`} aria-label="Open menu">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
          <path d="M3 5.5h12M3 9h12M3 12.5h12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.menuBackdrop} />
        <Dialog.Popup className={styles.menuPanel}>
          <div className={styles.menuPanelHead}>
            <Dialog.Title className={styles.wordmark}>Skeleton Motion</Dialog.Title>
            <Dialog.Close className={styles.iconButton} aria-label="Close menu">
              <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
                <path d="M4 4l10 10M14 4 4 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </Dialog.Close>
          </div>
          <nav aria-label="Main navigation">
            {LINKS.map(({ label, ...target }) => (
              <LinkComponent key={label} className={styles.menuPanelLink} onClick={() => setOpen(false)} {...target}>
                {label}
              </LinkComponent>
            ))}
          </nav>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * @param LinkComponent receives `to` (site path) or `href` (external URL).
 * @param onToggleTheme omit to hide the theme toggle.
 */
export default function SiteHeaderView({ LinkComponent, isDark, onToggleTheme }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onScroll = () => setHidden(window.scrollY > 72);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`${styles.siteHeader} ${hidden ? styles.siteHeaderHidden : ""}`}>
      <LinkComponent className={styles.wordmark} to="/">Skeleton Motion</LinkComponent>
      <nav className={styles.siteNav} aria-label="Main navigation">
        {LINKS.map(({ label, ...target }) => <LinkComponent key={label} className={styles.navLink} {...target}>{label}</LinkComponent>)}
        {onToggleTheme && <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />}
        <BurgerMenu LinkComponent={LinkComponent} />
      </nav>
    </header>
  );
}
