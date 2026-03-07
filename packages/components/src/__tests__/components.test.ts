import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const componentsDir = path.join(__dirname, "..");

function readComponent(name: string): string {
  return fs.readFileSync(path.join(componentsDir, name), "utf-8");
}

describe("Card.astro", () => {
  const src = readComponent("Card.astro");

  it("uses ab- scoped CSS classes", () => {
    expect(src).toContain(".ab-card");
    expect(src).toContain(".ab-card-body");
    expect(src).toContain(".ab-card-title");
  });

  it("renders as link when href is provided", () => {
    expect(src).toContain("href");
  });
});

describe("Grid.astro", () => {
  const src = readComponent("Grid.astro");

  it("uses ab- scoped CSS classes", () => {
    expect(src).toContain(".ab-grid");
  });

  it("supports column variants", () => {
    expect(src).toContain(".ab-grid--2");
    expect(src).toContain(".ab-grid--3");
    expect(src).toContain(".ab-grid--4");
  });

  it("has responsive media query", () => {
    expect(src).toContain("@media");
    expect(src).toContain("768px");
  });
});

describe("Button.astro", () => {
  const src = readComponent("Button.astro");

  it("uses ab- scoped CSS classes", () => {
    expect(src).toContain(".ab-btn");
  });

  it("supports variant classes", () => {
    expect(src).toContain("ab-btn--primary");
    expect(src).toContain("ab-btn--secondary");
    expect(src).toContain("ab-btn--outline");
  });

  it("supports size classes", () => {
    expect(src).toContain("ab-btn--sm");
    expect(src).toContain("ab-btn--md");
    expect(src).toContain("ab-btn--lg");
  });
});

describe("Tabs.astro", () => {
  const src = readComponent("Tabs.astro");

  it("uses ab- scoped CSS classes", () => {
    expect(src).toContain(".ab-tabs");
    expect(src).toContain(".ab-tab-btn");
    expect(src).toContain("ab-tab-panel");
  });

  it("has role=tablist on the headers container", () => {
    expect(src).toContain('role="tablist"');
  });

  it("has role=tab on buttons", () => {
    expect(src).toContain('role="tab"');
  });

  it("has role=tabpanel on panels", () => {
    expect(src).toContain('role="tabpanel"');
  });

  it("uses aria-selected attribute", () => {
    expect(src).toContain("aria-selected");
  });

  it("uses aria-controls linking tabs to panels", () => {
    expect(src).toContain("aria-controls");
  });

  it("uses aria-labelledby on panels", () => {
    expect(src).toContain("aria-labelledby");
  });

  it("manages tabindex for keyboard navigation", () => {
    expect(src).toContain("tabindex");
  });

  it("handles ArrowRight keyboard navigation", () => {
    expect(src).toContain("ArrowRight");
  });

  it("handles ArrowLeft keyboard navigation", () => {
    expect(src).toContain("ArrowLeft");
  });

  it("handles Home key navigation", () => {
    expect(src).toContain('"Home"');
  });

  it("handles End key navigation", () => {
    expect(src).toContain('"End"');
  });

  it("has focus-visible styles", () => {
    expect(src).toContain("focus-visible");
  });
});

describe("PostLayout.astro", () => {
  const src = readComponent("PostLayout.astro");

  it("uses ab- scoped CSS classes", () => {
    expect(src).toContain(".ab-post");
    expect(src).toContain(".ab-post-header");
    expect(src).toContain(".ab-post-title");
    expect(src).toContain(".ab-post-content");
  });

  it("includes Open Graph meta tags", () => {
    expect(src).toContain('property="og:title"');
    expect(src).toContain('property="og:type"');
    expect(src).toContain('property="og:description"');
    expect(src).toContain('property="og:image"');
    expect(src).toContain('property="og:url"');
    expect(src).toContain('property="og:site_name"');
  });

  it("includes Twitter Card meta tags", () => {
    expect(src).toContain('name="twitter:card"');
    expect(src).toContain('name="twitter:title"');
    expect(src).toContain('name="twitter:description"');
    expect(src).toContain('name="twitter:image"');
  });

  it("includes JSON-LD structured data", () => {
    expect(src).toContain("application/ld+json");
    expect(src).toContain("schema.org");
    expect(src).toContain('"Article"');
  });

  it("includes article:published_time meta", () => {
    expect(src).toContain('property="article:published_time"');
  });

  it("includes article:tag meta for tags", () => {
    expect(src).toContain('property="article:tag"');
  });

  it("uses semantic <time> element", () => {
    expect(src).toContain("<time");
    expect(src).toContain("datetime");
  });

  it("uses semantic <article> element", () => {
    expect(src).toContain("<article");
  });

  it("supports canonical URL", () => {
    expect(src).toContain("canonical");
  });
});

describe("mdx-components barrel export", () => {
  const src = readComponent("mdx-components.ts");

  it("exports Card", () => {
    expect(src).toContain("Card");
  });

  it("exports Grid", () => {
    expect(src).toContain("Grid");
  });

  it("exports Tabs", () => {
    expect(src).toContain("Tabs");
  });

  it("exports Button", () => {
    expect(src).toContain("Button");
  });
});
