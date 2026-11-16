import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApplication, devApplication, previewApplication, type ApplicationServer } from "@threadlabs/markupkit";
import { installPackages, write } from "../fixture.js";

for (const delivery of ["built", "dev"] as const) {
  describe.skipIf(process.env.HTMLNEXT_BROWSER_TEST !== "1")(`${delivery} adaptive System UI collection/detail`, () => {
    let root: string, server: ApplicationServer;
    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), "markupkit-collection-detail-"));
      await installPackages(root);
      await write(root, "package.json", '{"private":true,"type":"module"}');
      await write(root, "app/pages/garden.html", '<template component="garden-page"><main><h1>Garden</h1></main></template>');
      await write(root, "app/pages/index.html", `<link rel="component" href="@threadlabs/system-ui/components/collection-detail.html">
        <template component="adaptive-page" module="./index.ts"><defs><state name="active" type="string" value="detail"></state></defs>
        <main><h1>Notes</h1><div id="allocation"><mk-collection-detail from:active="$active">
          <nav slot="collection" aria-label="Notes"><a href="/garden/">Garden</a></nav>
          <section slot="detail"><label for="draft">Draft</label><textarea id="draft">Initial</textarea><button id="leave">Leave</button><button id="stay">Stay</button><output id="status"></output></section>
        </mk-collection-detail></div></main></template>`);
      await write(root, "app/pages/index.ts", `import '@threadlabs/system-ui/web.css';
        import { createEditingSession, createNavigationScene } from '@threadlabs/system-ui';
        export function connect(host) {
          const scene = createNavigationScene({ destination: '/coast/', copy: value => value });
          const editor = createEditingSession({ resource: 'coast', value: 'Initial', version: 1, operation: 'save', whenDirty: 'confirm', copy: value => value, equal: Object.is });
          window.adaptive = { editor, scene, show: active => host.state.active = active };
          host.on('input', event => { if(event.target.id === 'draft') editor.dispatch({type:'edit',sessionId:editor.snapshot().sessionId,value:event.target.value}); });
          host.on('click', event => {
            if(event.target.id==='leave') editor.dispatch({type:'leave',sessionId:editor.snapshot().sessionId,destination:'/garden/'});
            if(event.target.id==='stay') editor.dispatch({type:'choose-leave',sessionId:editor.snapshot().sessionId,leaveId:editor.snapshot().leave.id,choice:'stay'});
            host.root.querySelector('#status').textContent=editor.snapshot().leave ? 'Decision pending' : 'Editing';
          });
        }`);
      if (delivery === "built") { await buildApplication({ root }); server = await previewApplication({ root, port: 0 }); }
      else server = await devApplication({ root, port: 0 });
    });
    afterAll(async () => { await server?.close(); if (root) await rm(root, { recursive: true, force: true }); });
    for (const engine of [chromium, firefox, webkit]) it(`${engine.name()} changes allocated panes without replacing draft or navigation`, async () => {
      const browser = await engine.launch();
      try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
        page.setDefaultTimeout(5000);
        const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
        await page.goto(server.url);
        await page.waitForFunction(() => Boolean(Reflect.get(window, "adaptive")));
        const collection = page.getByRole("navigation", { name: "Notes" }), draft = page.getByRole("textbox", { name: "Draft" });
        await expect.poll(() => collection.isVisible()).toBe(true);
        await draft.fill("A retained draft"); await draft.evaluate((node: HTMLTextAreaElement) => node.setSelectionRange(2, 8));
        const before = await page.evaluate(() => {
          Reflect.set(window, "draftNode", document.querySelector("#draft"));
          const app = Reflect.get(window, "adaptive");
          return { editor: app.editor.snapshot(), navigation: app.scene.snapshot(), history: history.length, url: location.href };
        });
        for (const width of [375, 1000, 375, 1000]) {
          // Allocation, rather than viewport width, determines which panes are visible.
          await page.locator("#allocation").evaluate((node, width) => { (node as HTMLElement).style.width = `${width}px`; }, width);
          await expect.poll(() => collection.isVisible()).toBe(width === 1000);
          expect(await draft.isVisible()).toBe(true);
          expect(await page.evaluate(() => document.activeElement === Reflect.get(window, "draftNode"))).toBe(true);
          expect(await draft.evaluate((node: HTMLTextAreaElement) => [node.selectionStart, node.selectionEnd])).toEqual([2, 8]);
        }
        await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
        await expect.poll(() => collection.isVisible()).toBe(false);
        expect(await draft.isVisible()).toBe(true);
        await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
        await expect.poll(() => collection.isVisible()).toBe(true);
        await page.getByRole("button", { name: "Leave", exact: true }).click();
        expect(await page.locator("#status").textContent()).toBe("Decision pending");
        const pending = await page.evaluate(() => Reflect.get(window, "adaptive").editor.snapshot());
        await page.setViewportSize({ width: 375, height: 900 });
        await page.locator("#allocation").evaluate(node => { (node as HTMLElement).style.width = "100%"; });
        await expect.poll(() => collection.isVisible()).toBe(false);
        expect(await page.evaluate(() => Reflect.get(window, "adaptive").editor.snapshot())).toEqual(pending);
        await page.getByRole("button", { name: "Stay", exact: true }).click();
        const after = await page.evaluate(() => {
          const app = Reflect.get(window, "adaptive");
          return { editor: app.editor.snapshot(), navigation: app.scene.snapshot(), history: history.length, url: location.href, sameNode: document.querySelector("#draft") === Reflect.get(window, "draftNode") };
        });
        expect(after.sameNode).toBe(true); expect(after.editor.sessionId).toBe(before.editor.sessionId);
        expect(after.editor.value).toBe("A retained draft"); expect(after.editor.leave).toBeNull();
        expect(after.navigation).toEqual(before.navigation); expect(after.history).toBe(before.history); expect(after.url).toBe(before.url);
        await page.evaluate(() => Reflect.get(window, "adaptive").show("collection"));
        await expect.poll(() => collection.isVisible()).toBe(true); expect(await draft.isVisible()).toBe(false);
        await page.evaluate(() => Reflect.get(window, "adaptive").show("detail"));
        await expect.poll(() => draft.isVisible()).toBe(true); expect(await draft.inputValue()).toBe("A retained draft");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(errors).toEqual([]);
        const plain = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 900 } });
        try {
          const staticPage = await plain.newPage();
          await staticPage.goto(server.url);
          expect(await staticPage.getByRole("textbox", { name: "Draft" }).isVisible()).toBe(true);
          expect(await staticPage.getByRole("navigation", { name: "Notes" }).isVisible()).toBe(false);
          await staticPage.setViewportSize({ width: 1200, height: 900 });
          await staticPage.getByRole("link", { name: "Garden", exact: true }).click();
          expect(await staticPage.getByRole("heading", { name: "Garden", exact: true }).count()).toBe(1);
        } finally { await plain.close(); }
      } finally { await browser.close(); }
    });
  });
}
