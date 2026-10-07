import React, { useState } from "react";
import SiteHeaderView from "../../../website/src/components/SiteHeaderView.jsx";
import buttons from "../../../website/src/components/buttons.module.css";
import AspectButton from "./AspectButton.jsx";
import CopyCode from "./CopyCode.jsx";
import RoomSelect from "./RoomSelect.jsx";
import { scenesFor, setFormats } from "./scenes.jsx";
import styles from "./DisplayRoom.module.css";

// Hosted generations live under /jobs/ on the app origin and link back to
// it; rooms opened from disk or the Pages mirror link to the public site.
const SITE = typeof window !== "undefined" && window.location.pathname.startsWith("/jobs/")
  ? window.location.origin
  : "https://hoxou.github.io/skeleton-motion";

// Forwards its ref so Base UI's menu can focus the header links.
const SiteLink = React.forwardRef(function SiteLink({ href, to, ...props }, ref) {
  return <a ref={ref} href={href ?? `${SITE}${to}`} {...props} />;
});

function useTheme() {
  const [theme, setThemeState] = useState(() => document.documentElement.dataset.theme);
  const setTheme = (next) => {
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    setThemeState(next);
  };
  return [theme, setTheme];
}

// Set asset ids carry the collection prefix; `?asset=insert-step` works too.
function viewFromUrl(scenes, assets, aspects) {
  const params = new URLSearchParams(location.search);
  const scene = params.get("scene");
  const asset = params.get("asset");
  const aspect = params.get("aspect");
  return {
    aspect: aspects.includes(aspect) ? aspect : aspects[0] ?? null,
    assetId: assets.find((item) => item.id === asset || item.id.endsWith(`.${asset}`))?.id ?? assets[0].id,
    sceneId: scenes.find((item) => item.id === scene)?.id ?? scenes[0].id,
  };
}

function writeUrl({ aspect, assetId, sceneId }) {
  const params = new URLSearchParams(location.search);
  params.set("scene", sceneId);
  params.set("asset", assetId);
  if (aspect) params.set("aspect", aspect);
  history.replaceState(null, "", `?${params}`);
}

// Only the stage takes the source's palette, type, and radius; the chrome
// around it keeps the site's --home-* tokens.
function stageStyle(source, theme) {
  const tokens = (theme === "dark" && source.dark) || source.light;
  return {
    "--accent": tokens.accent,
    "--accent-2": tokens.accent2,
    "--accent-3": tokens.accent3,
    "--copy": tokens.copy,
    "--page": tokens.page,
    "--page-ink": tokens.ink,
    "--panel": tokens.panel,
    "--panel-border": tokens.border,
    "--panel-solid": tokens.panelSolid,
    "--scene-radius": `${source.radius}px`,
    fontFamily: source.fontFile ? `"Source Preview", ${source.fontStack}` : source.fontStack,
  };
}

export default function DisplayRoom({ data }) {
  const { archive, assets, source } = data;
  const scenes = scenesFor(assets);
  const aspects = setFormats(assets);
  const [theme, setTheme] = useTheme();
  const [view, setView] = useState(() => viewFromUrl(scenes, assets, aspects));
  const scene = scenes.find((item) => item.id === view.sceneId);
  const asset = assets.find((item) => item.id === view.assetId);
  const update = (change) => {
    const next = { ...view, ...change };
    setView(next);
    writeUrl(next);
  };

  return (
    <>
      <SiteHeaderView
        LinkComponent={SiteLink}
        isDark={theme === "dark"}
        onToggleTheme={source.dark ? () => setTheme(theme === "dark" ? "light" : "dark") : undefined}
      />
      <div className={styles.room}>
        <main className={styles.stage} style={stageStyle(source, theme)} aria-label="Display Room">
          {source.fontFile && <style>{`@font-face { font-family: "Source Preview"; src: url("./${source.fontFile}"); font-display: swap; }`}</style>}
          <section key={`${scene.id}:${view.aspect}`} className={styles.scene}>
            <scene.Scene asset={asset} assets={assets} format={view.aspect} />
          </section>
        </main>
        <aside className={styles.panel} aria-label="Display controls">
          <RoomSelect
            label="Scene"
            items={scenes.map((item) => ({ label: item.label, value: item.id }))}
            value={scene.id}
            onValueChange={(sceneId) => update({ sceneId })}
          />
          <RoomSelect
            label="Animation"
            disabled={assets.length < 2 || Boolean(scene.showsAllAssets)}
            items={assets.map((item) => ({ label: item.label, value: item.id }))}
            value={asset.id}
            onValueChange={(assetId) => update({ assetId })}
          />
          {aspects.length > 1 && (
            <AspectButton
              aspects={aspects}
              disabled={Boolean(scene.showsAllFormats)}
              value={view.aspect}
              onChange={(aspect) => update({ aspect })}
            />
          )}
          <a className={`${buttons.actionButton} ${buttons.createButton} ${styles.download}`} href={`./${archive}`} download>
            Download ZIP
          </a>
          <CopyCode asset={asset} />
        </aside>
      </div>
    </>
  );
}
