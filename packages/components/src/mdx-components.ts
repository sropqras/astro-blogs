/**
 * MDX component map for use in Astro's MDX integration config.
 *
 * Usage in astro.config.mjs:
 *
 *   import { mdxComponents } from '@astro-blogs/components/mdx';
 *
 * Then in your .mdx files you can use <Card>, <Grid>, <Tabs>, <Button>
 * without explicit imports when configured via the customComponents option
 * or by passing them in the layout.
 *
 * Alternatively, import directly in MDX:
 *
 *   import Card from '@astro-blogs/components/Card.astro';
 */

export { default as Card } from "./Card.astro";
export { default as Grid } from "./Grid.astro";
export { default as Tabs } from "./Tabs.astro";
export { default as Button } from "./Button.astro";
