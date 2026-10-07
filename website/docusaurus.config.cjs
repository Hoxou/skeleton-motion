const path = require("node:path");

// The Cloudflare Worker serves the site and the generation API from the
// same origin; override for a custom domain or a local wrangler port.
const SITE_URL = process.env.SKELETON_MOTION_APP_URL || "https://skeleton-motion.qa-segnatura.workers.dev";

const config = {
  title: "Skeleton Motion",
  tagline: "Product motion, inferred from the product itself.",
  favicon: "img/favicon.svg",
  url: SITE_URL,
  baseUrl: "/",
  organizationName: "Hoxou",
  projectName: "skeleton-motion",
  trailingSlash: false,
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },
  staticDirectories: [
    "static",
    path.resolve(__dirname, "../examples/qa-segnatura-set"),
    path.resolve(__dirname, "../examples/bisonflow"),
    path.resolve(__dirname, "../examples/skeleton-motion-set"),
    path.resolve(__dirname, "../examples/studio-set"),
  ],
  presets: [
    [
      "classic",
      {
        blog: false,
        docs: {
          path: "../docs",
          routeBasePath: "docs",
          sidebarPath: "./sidebars.cjs",
        },
        theme: {
          customCss: "./src/css/custom.css",
        },
      },
    ],
  ],
  themeConfig: {
    colorMode: {
      defaultMode: "light",
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Skeleton Motion",
      items: [
        { label: "Gallery", position: "right", to: "/gallery" },
        { label: "Examples", position: "right", to: "/examples" },
        { label: "Docs", position: "right", to: "/docs" },
        { label: "Support", position: "right", to: "/support" },
        { href: "https://github.com/Hoxou/skeleton-motion", label: "GitHub", position: "right" },
      ],
    },
    footer: {
      style: "light",
      links: [
        { title: "Use", items: [{ label: "Create on the website", to: "/docs/website" }, { label: "Use the code", to: "/docs/code" }] },
        { title: "Reference", items: [{ label: "CLI", to: "/docs/cli" }, { label: "Compatibility", to: "/docs/compatibility" }] },
        { title: "Project", items: [{ label: "Gallery", to: "/gallery" }, { label: "GitHub", href: "https://github.com/Hoxou/skeleton-motion" }] },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Skeleton Motion. MIT licensed.`,
    },
  },
};

module.exports = config;
