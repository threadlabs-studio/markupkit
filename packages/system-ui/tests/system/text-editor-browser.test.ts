// Exercises the public package exports; build the workspace before browser qualification.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApplication, devApplication, previewApplication, type ApplicationServer } from "@threadlabs/markupkit";
import { createEditingSession } from "../../src/editor.js";
import { textEditorView } from "../../src/text-editor.js";
import { installPackages, write } from "../fixture.js";

for (const delivery of ["built", "dev"] as const) {
  describe.skipIf(process.env.HTMLNEXT_BROWSER_TEST !== "1")(`${delivery} System UI text editor`, () => {
    let root: string, server: ApplicationServer;
    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), "markupkit-system-editor-"));
      await installPackages(root);
      const initial = textEditorView(createEditingSession({ resource: "records/1", value: "Initial", version: 1, operation: "save", copy: value => value, equal: Object.is }).snapshot(), { id: "record", label: "Description" });
      await write(root, "package.json", '{"name":"system-ui-fixture","private":true,"type":"module"}');
      await write(root, "app/pages/index.html", `<link rel="component" href="@threadlabs/system-ui/components/text-editor.html"><template component="editor-page" module="./index.ts"><defs><title>System UI editor</title><state name="view" type="unknown"></state></defs><main><h1>Edit record</h1><mk-text-editor $ref="editor" from:view="$view"></mk-text-editor><button id="leave" type="button">Leave editor</button><button id="unbind" type="button">Detach presentation</button><button id="bind" type="button">Attach presentation</button></main></template>`);
      await write(root, "app/pages/index.server.ts", `export const load = () => ({ state: { view: ${JSON.stringify(initial)} } });`);
      await write(root, "app/pages/index.ts", `import "@threadlabs/system-ui/web.css";
        import { createEditingModel } from '@threadlabs/system-ui';
        import { bindTextEditor, createWebThemeScope } from '@threadlabs/system-ui/web';
        export function create() {
          let model, held, root;
          model = createEditingModel({ resource: 'records/1', value: 'Initial', version: 1, operation: 'save', copy: value => value, equal: Object.is,
            effect(effect) { if (effect.kind === 'commit') { held = effect; window.commits.push(effect); } else { root.dataset.destination = effect.destination; model.dispatch({ type: 'navigation-result', sessionId: model.snapshot().sessionId, navigationId: effect.navigationId, result: 'committed' }); } }
          });
          return { connect(host) {
            root = host.root; window.commits = []; window.editorModel = model;
            window.finishSave = (kind = 'ok') => model.dispatch({ type: 'commit-result', operationId: held.operationId, result: kind === 'ok' ? {kind, value: held.value, version: 2} : {kind, message: 'Save failed'} });
            const theme = createWebThemeScope(host.root, { accent: { light: '#35684f', dark: '#a4dfba' } });
            let unbind = () => {};
            const attach = () => { unbind(); unbind = bindTextEditor(host.refs.editor, { model, theme, view: { id: 'record', label: 'Description' }, render(view) { host.state.view = view; } }); };
            attach();
            window.setEditorTheme = () => theme.update({ colorScheme: 'dark', accent: {light:'#a83d1a',dark:'#ffb082'}, shape:{action:'round'}, typography:'serif', spacing:'comfortable' });
            host.on('click', event => { if (event.target.id === 'leave') model.dispatch({ type: 'leave', destination: '/next/' }); if(event.target.id==='unbind') unbind(); if(event.target.id==='bind') attach(); });
            return () => { unbind(); theme.dispose(); };
          } };
        }`);
      if (delivery === "built") { await buildApplication({ root }); server = await previewApplication({ root, port: 0 }); }
      else server = await devApplication({ root, port: 0 });
    });
    afterAll(async () => { await server?.close(); if (root) await rm(root, { recursive: true, force: true }); });

    for (const engine of [chromium, firefox, webkit]) it(`${engine.name()} preserves the shared editor through actions and presentation replacement`, async () => {
      const browser = await engine.launch();
      try {
        for (const width of [1200, 375]) {
          const page = await browser.newPage({ viewport: { width, height: 1000 } });
          const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
          await page.goto(server.url); const input = page.getByRole("textbox", { name: "Description", exact: true });
          await expect.poll(() => input.getAttribute("readonly")).toBe(null);
          expect(await input.inputValue()).toBe("Initial");
          await input.fill("Submitted"); await page.getByRole("button", { name: "Save", exact: true }).click();
          await input.fill("Later edits"); await page.evaluate(() => Reflect.get(window, "finishSave")());
          await expect.poll(() => input.inputValue()).toBe("Later edits");
          expect(await page.evaluate(() => Reflect.get(window, "commits").length)).toBe(1);
          await page.evaluate(() => Reflect.get(window, "setEditorTheme")());
          expect(await input.inputValue()).toBe("Later edits");
          await expect.poll(() => page.getByRole("button", { name: "Save", exact: true }).evaluate(element => getComputedStyle(element).borderRadius)).toBe("999px");
          expect(await input.evaluate(element => getComputedStyle(element).fontFamily)).toContain("ui-serif");
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.getByRole("button", { name: "Detach presentation" }).click();
          await expect.poll(() => input.getAttribute("readonly")).not.toBe(null);
          await page.getByRole("button", { name: "Attach presentation" }).click();
          await expect.poll(() => input.getAttribute("readonly")).toBe(null);
          expect(await input.inputValue()).toBe("Later edits");
          await page.getByRole("button", { name: "Leave editor" }).click();
          const dialog = page.getByRole("alertdialog"); await dialog.waitFor();
          await page.getByRole("button", { name: "Keep editing", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
          expect(await input.inputValue()).toBe("Later edits");
          await page.getByRole("button", { name: "Leave editor" }).click();
          await page.getByRole("button", { name: "Save and leave", exact: true }).click();
          expect(await page.evaluate(() => document.querySelector("main")?.getAttribute("data-destination"))).toBe(null);
          await page.evaluate(() => Reflect.get(window, "finishSave")());
          await expect.poll(() => page.locator("main").getAttribute("data-destination")).toBe("/next/");
          expect(errors).toEqual([]); await page.close();
        }
      } finally { await browser.close(); }
    });
  });
}
