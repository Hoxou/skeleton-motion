const sidebars = {
  docs: [
    "intro",
    {
      type: "category",
      label: "Getting started",
      items: ["getting-started/first-set", "getting-started/display-room"],
    },
    {
      type: "category",
      label: "Guides",
      items: ["guides/source-analysis", "guides/asset-sets", "guides/embedding"],
    },
    {
      type: "category",
      label: "Agent integrations",
      items: ["agent-integrations/overview", "agent-integrations/codex", "agent-integrations/claude"],
    },
    {
      type: "category",
      label: "Reference",
      items: ["reference/cli", "reference/manifest"],
    },
    "security-privacy",
    "costs-and-hosting",
    "roadmap",
  ],
};

module.exports = sidebars;
