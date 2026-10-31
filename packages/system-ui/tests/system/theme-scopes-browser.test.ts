// Qualifies actual Looma CSS and independent editor ownership through public package entries.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApplication, devApplication, previewApplication, type ApplicationServer } from "@threadlabs/markupkit";
import { createEditingSession, textEditorView } from "@threadlabs/system-ui";
import { installPackages, write } from "../fixture.js";

for (const delivery of ["built", "dev"] as const) {
  describe.skipIf(process.env.HTMLNEXT_BROWSER_TEST !== "1")(`${delivery} System UI theme scopes`, () => {
    let root: string, server: ApplicationServer;
    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), "system-ui-theme-scopes-"));
      await installPackages(root);
      const initial = Object.fromEntries(["a", "b", "c"].map(id => [id, textEditorView(createEditingSession({ resource: id, value: id.toUpperCase(), version: 1, operation: "save", copy: value => value, equal: Object.is }).snapshot(), { id, label: id.toUpperCase() })]));
      await write(root, "package.json", '{"private":true,"type":"module"}');
      await write(root, "app/pages/index.html", `<link rel="component" href="@threadlabs/system-ui/components/text-editor.html"><template component="scope-page" module="./index.ts"><defs><state name="a" type="unknown"></state><state name="b" type="unknown"></state><state name="c" type="unknown"></state></defs><main><h1>Independent theme scopes</h1><section id="scope-a" $ref="scopeA"><mk-text-editor $ref="editorA" from:view="$a"></mk-text-editor><section id="scope-c" $ref="scopeC"><mk-text-editor $ref="editorC" from:view="$c"></mk-text-editor></section></section><section id="scope-b" $ref="scopeB"><mk-text-editor $ref="editorB" from:view="$b"></mk-text-editor></section></main></template>`);
      await write(root, "app/pages/index.server.ts", `export const load=()=>({state:${JSON.stringify(initial)}});`);
      await write(root, "app/pages/index.ts", `import '@threadlabs/system-ui/web.css';
        import {createEditingModel} from '@threadlabs/system-ui';
        import {bindTextEditor,createWebThemeScope} from '@threadlabs/system-ui/web';
        export function create(){
          const effects={a:[],b:[],c:[]};
          const models=Object.fromEntries(['a','b','c'].map(id=>[id,createEditingModel({resource:id,value:id.toUpperCase(),version:1,operation:'save',copy:v=>v,equal:Object.is,effect:e=>effects[id].push(e)})]));
          return {connect(host){
            const themes={a:createWebThemeScope(host.refs.scopeA,{accent:{light:'#35684f',dark:'#a4dfba'}}),b:createWebThemeScope(host.refs.scopeB,{accent:{light:'#333399',dark:'#bbbcff'}}),c:createWebThemeScope(host.refs.scopeC,{colorScheme:'dark',accent:{light:'#a83d1a',dark:'#ffb082'}})};
            const unbind={};
            const attach=id=>{unbind[id]?.();unbind[id]=bindTextEditor(host.refs['editor'+id.toUpperCase()],{model:models[id],theme:themes[id],view:{id,label:id.toUpperCase()},render:view=>{host.state[id]=view;}});};
            for(const id of ['a','b','c'])attach(id);
            window.scopes={effects,snapshot:id=>models[id].snapshot(),themeSnapshot:id=>themes[id].snapshot(),theme:(id,input)=>themes[id].update(input),reconnect:attach,finish:id=>{const effect=effects[id].find(e=>e.kind==='commit');models[id].dispatch({type:'commit-result',operationId:effect.operationId,result:{kind:'ok',value:'Canonical '+id,version:2}});}};
            return ()=>{for(const id of ['a','b','c']){unbind[id]();themes[id].dispose();}};
          }};
        }`);
      if (delivery === "built") { await buildApplication({ root }); server = await previewApplication({ root, port: 0 }); }
      else server = await devApplication({ root, port: 0 });
    });
    afterAll(async () => { await server?.close(); if (root) await rm(root, { recursive: true, force: true }); });
    for (const engine of [chromium, firefox, webkit]) it(`${engine.name()} keeps sibling and nested themes independent of editor ownership`, async () => {
      const browser = await engine.launch();
      try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, colorScheme: "light" });
        const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
        await page.goto(server.url);
        const a = page.getByRole("textbox", { name: "A", exact: true });
        const b = page.getByRole("textbox", { name: "B", exact: true });
        const editor = (label: string) => page.locator('[data-component~="mk-text-editor"]').filter({ has: page.getByRole("textbox", { name: label, exact: true }) });
        for (const label of ["A", "B", "C"]) await expect.poll(() => page.getByRole("textbox", { name: label, exact: true }).getAttribute("readonly")).toBe(null);
        const snapshot = (id: string) => page.evaluate(id => Reflect.get(window, "scopes").snapshot(id), id);
        const sessions = await Promise.all(["a", "b", "c"].map(snapshot));
        expect(new Set(sessions.map(value => value.sessionId)).size).toBe(3);
        await a.fill("Alpha draft"); await b.fill("Beta draft");
        for (const label of ["A", "B"]) await expect.poll(() => editor(label).getByRole("button", { name: "Save", exact: true }).isEnabled()).toBe(true);
        // Normalize seed colors in the browser and read Looma's derived roles, without copying its mixing formula.
        const colors = async (id: string, accent: string) => page.evaluate(({ id, accent }) => {
          const scope = document.getElementById("scope-" + id)!;
          const button = scope.querySelector('[data-editor-intent="save"]')!;
          const reference = document.createElement("span");
          scope.append(reference);
          const color = (value: string) => {
            reference.style.backgroundColor = value;
            return getComputedStyle(reference).backgroundColor;
          };
          const result = { action: getComputedStyle(button).backgroundColor, accent: color(accent),
            hover: color("var(--ui-accent-hover)"), focus: color("var(--ui-focus-ring)") };
          reference.remove();
          return result;
        }, { id, accent });
        const themed = async (id: string, accent: string) => {
          const expected = await colors(id, accent);
          // Binding updates and native CSS transitions can briefly show the preceding disabled/action surface.
          await expect.poll(async () => (await colors(id, accent)).action).toBe(expected.accent);
          const resolved = await colors(id, accent);
          expect(resolved.focus).toBe(resolved.accent);
          return resolved;
        };
        const initialA = await themed("a", "#35684f");
        const initialB = await themed("b", "#333399");
        expect(initialA.hover).not.toBe(initialB.hover);
        const c = page.getByRole("textbox", { name: "C", exact: true });
        await c.fill("Nested draft");
        await expect.poll(() => editor("C").getByRole("button", { name: "Save", exact: true }).isEnabled()).toBe(true);
        const initialC = await themed("c", "#ffb082");
        expect(initialC.hover).not.toBe(initialA.hover);
        await c.fill("C");

        await a.focus();
        await a.evaluate(element => {
          if (!(element instanceof HTMLTextAreaElement)) throw new Error("Expected native textarea");
          element.setSelectionRange(2, 8, "backward");
          Reflect.set(window, "retainedScopeInput", element);
        });
        const retained = () => a.evaluate(element => ({ same: element === Reflect.get(window, "retainedScopeInput"),
          focused: element === document.activeElement, start: (element as HTMLTextAreaElement).selectionStart,
          end: (element as HTMLTextAreaElement).selectionEnd }));
        const before = await retained();
        expect(before).toEqual({ same: true, focused: true, start: 2, end: 8 });
        await page.evaluate(() => Reflect.get(window, "scopes").theme("b", {
          colorScheme: "dark", accent: { light: "#a83d1a", dark: "#ffb082" },
        }));
        expect(await retained()).toEqual(before);
        expect(await a.inputValue()).toBe("Alpha draft");
        expect(await colors("a", "#35684f")).toEqual(initialA);
        const changedB = await themed("b", "#ffb082");
        expect(changedB.hover).not.toBe(initialB.hover);
        const nested = await colors("c", "#ffb082");
        expect(nested.hover).toBe(initialC.hover);
        expect(nested.focus).toBe(initialC.focus);
        expect(await page.locator("#scope-c").getAttribute("data-theme")).toBe("dark");

        await page.evaluate(() => Reflect.get(window, "scopes").theme("a", { accent: { light: "#245599", dark: "#bbccff" } }));
        expect(await retained()).toEqual(before);
        const changedA = await themed("a", "#245599");
        expect(changedA.hover).not.toBe(initialA.hover);
        expect(await colors("b", "#ffb082")).toEqual(changedB);
        expect((await colors("c", "#ffb082")).hover).toBe(initialC.hover);

        await editor("A").getByRole("button", { name: "Save", exact: true }).click();
        await a.fill("Alpha later");
        const pendingFocus = await retained();
        await page.evaluate(() => Reflect.get(window, "scopes").theme("b", {
          accent: { light: "#663388", dark: "#ddaaff" }, shape: { action: "round" },
        }));
        await themed("b", "#663388");
        expect(await snapshot("a")).toMatchObject({ value: "Alpha later", pending: true });
        await page.evaluate(() => Reflect.get(window, "scopes").reconnect("b"));
        expect(await retained()).toEqual(pendingFocus);
        expect(await b.inputValue()).toBe("Beta draft");
        expect(await snapshot("b")).toMatchObject({ sessionId: sessions[1].sessionId, value: "Beta draft", version: 1, pending: false });
        expect(await snapshot("c")).toMatchObject({ sessionId: sessions[2].sessionId, value: "C", version: 1, dirty: false, pending: false });
        expect(await page.evaluate(() => Reflect.get(window, "scopes").effects.a.filter((effect: { kind: string }) => effect.kind === "commit").length)).toBe(1);
        const pending = await snapshot("a");
        const themeSnapshot = () => page.evaluate(() => Reflect.get(window, "scopes").themeSnapshot("a"));
        const actionMotion = () => editor("A").getByRole("button", { name: "Save", exact: true }).evaluate(element => getComputedStyle(element).transitionDuration);
        await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
        await expect.poll(themeSnapshot).toMatchObject({ colorScheme: "dark", accent: { kind: "custom", fill: "#bbccff" }, motion: "reduced" });
        await expect.poll(actionMotion).toMatch(/^0s(?:, 0s)*$/);
        expect(await retained()).toEqual(pendingFocus);
        expect(await snapshot("a")).toEqual(pending);
        // Chromium provides actual forced-colors emulation; do not infer OS high-contrast coverage.
        if (engine === chromium) {
          await page.emulateMedia({ forcedColors: "active" });
          expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
          await expect.poll(themeSnapshot).toMatchObject({ colorScheme: "dark", accent: { kind: "system" }, motion: "reduced" });
          const forced = await editor("A").getByRole("button", { name: "Save", exact: true }).evaluate(element => {
            const reference = document.createElement("button");
            reference.disabled = (element as HTMLButtonElement).disabled;
            document.body.append(reference);
            const actual = getComputedStyle(element), native = getComputedStyle(reference);
            const result = { adjustment: actual.forcedColorAdjust, background: actual.backgroundColor,
              foreground: actual.color, nativeBackground: native.backgroundColor, nativeForeground: native.color };
            reference.remove();
            return result;
          });
          expect(forced.adjustment).toBe("auto");
          expect(forced.background).toBe(forced.nativeBackground);
          expect(forced.foreground).toBe(forced.nativeForeground);
          expect(await retained()).toEqual(pendingFocus);
          expect(await snapshot("a")).toEqual(pending);
        }
        await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference", forcedColors: "none" });
        await expect.poll(themeSnapshot).toMatchObject({ colorScheme: "light", accent: { kind: "custom", fill: "#245599" }, motion: "full" });
        await expect.poll(actionMotion).not.toMatch(/^0s(?:, 0s)*$/);
        expect(await retained()).toEqual(pendingFocus);
        expect(await snapshot("a")).toEqual(pending);
        // An application may reduce motion even when the environment has no preference.
        await page.evaluate(() => Reflect.get(window, "scopes").theme("b", { accent: "#663388", motion: "reduced" }));
        await expect.poll(() => editor("B").getByRole("button", { name: "Save", exact: true }).evaluate(element => getComputedStyle(element).transitionDuration)).toMatch(/^0s(?:, 0s)*$/);
        await page.evaluate(() => Reflect.get(window, "scopes").finish("a"));
        expect(await a.inputValue()).toBe("Alpha later");
        expect(await retained()).toEqual(pendingFocus);
        expect(await snapshot("a")).toMatchObject({ sessionId: sessions[0].sessionId, value: "Alpha later", version: 2, dirty: true, pending: false });
        expect(await b.inputValue()).toBe("Beta draft");
        expect(await snapshot("c")).toMatchObject({ value: "C", dirty: false });
        expect(await page.evaluate(() => ({ b: Reflect.get(window, "scopes").effects.b.length,
          c: Reflect.get(window, "scopes").effects.c.length }))).toEqual({ b: 0, c: 0 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(errors).toEqual([]);
      } finally { await browser.close(); }
    });
  });
}
