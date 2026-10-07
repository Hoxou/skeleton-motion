import React, { useEffect, useState } from "react";
import { Button } from "@base-ui/react/button";
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
      className={styles.themeToggle}
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
        {LINKS.map(({ label, ...target }) => <LinkComponent key={label} {...target}>{label}</LinkComponent>)}
        {onToggleTheme && <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />}
      </nav>
    </header>
  );
}
