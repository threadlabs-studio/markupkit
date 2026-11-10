import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createApplication } from "../dist/index.js";
import { write } from "./fixture.js";

it("puts navigation metadata on layer roots independently of authored forwarding", async () => {
  const root = await mkdtemp(join(tmpdir(), "markupkit-layer-metadata-"));
  await write(root, "package.json", '{"type":"module"}');
  await write(root, "app/layouts/default.html", `<template component="app-shell" noforward>
    <main><div id="inner" $attributes><slot name="page"></slot></div></main>
  </template>`);
  await write(root, "app/pages/index.html", `<template component="home-page" noforward>
    <defs><state name="message" value="Ready"></state></defs><h1 id="authored">{$message}</h1>
  </template>`);
  const application = await createApplication({ root });
  try {
    const page = await application.render("/");
    expect(page.body.match(/<main\b([^>]*)>/)?.[1]).toContain('data-mk-layer="0"');
    expect(page.body.match(/<h1\b([^>]*)>/)?.[1]).toContain('data-mk-layer="1"');
    expect(page.body).toContain('id="authored"');
    expect(page.body).toContain(">Ready</h1>");
    expect(page.body.match(/<div\b([^>]*)>/)?.[1]).not.toContain("data-mk-layer");
    expect(page.body).not.toContain('id="mk-layer-');
  } finally { await application.close(); await rm(root, { recursive: true, force: true }); }
});
