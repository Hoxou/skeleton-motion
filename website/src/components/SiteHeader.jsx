import React from "react";
import Link from "@docusaurus/Link";
import { useColorMode } from "@docusaurus/theme-common";
import SiteHeaderView from "./SiteHeaderView";

export default function SiteHeader() {
  const { colorMode, setColorMode } = useColorMode();
  const isDark = colorMode === "dark";

  return <SiteHeaderView LinkComponent={Link} isDark={isDark} onToggleTheme={() => setColorMode(isDark ? "light" : "dark")} />;
}
