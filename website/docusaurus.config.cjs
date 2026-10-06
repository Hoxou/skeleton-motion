const path = require("node:path");

const config = {
  title: "Skeleton Motion",
  tagline: "Product motion, inferred from the product itself.",
  favicon: "img/favicon.svg",
  url: "https://hoxou.github.io",
  baseUrl: "/skeleton-motion/",
  organizationName: "Hoxou",
  projectName: "skeleton-motion",
  trailingSlash: false,
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },
  staticDirectories: ["static", path.resolve(__dirname, "../examples/qa-segnatura-set")],
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
      logo: { alt: "Skeleton Motion", src: "img/logo.svg" },
      items: [
        { label: "Docs", position: "right", to: "/docs" },
        { label: "Roadmap", position: "right", to: "/docs/roadmap" },
        { label: "Support", position: "right", to: "/support" },
        { href: "https://github.com/Hoxou/skeleton-motion", label: "GitHub", position: "right" },
      ],
    },
    footer: {
      style: "light",
      links: [
        { title: "Build", items: [{ label: "Getting started", to: "/docs/getting-started/first-set" }, { label: "CLI reference", to: "/docs/reference/cli" }] },
        { title: "Understand", items: [{ label: "Local AI adapters", to: "/docs/agent-integrations/overview" }, { label: "Security", to: "/docs/security-privacy" }] },
        { title: "Project", items: [{ label: "Roadmap", to: "/docs/roadmap" }, { label: "GitHub", href: "https://github.com/Hoxou/skeleton-motion" }] },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Skeleton Motion. MIT licensed.`,
    },
  },
};

module.exports = config;
