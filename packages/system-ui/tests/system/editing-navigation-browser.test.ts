// Public package wiring: the authored module is projected separately from MarkupKit's client.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApplication, devApplication, previewApplication, type ApplicationServer } from "@threadlabs/markupkit";
import { installPackages, write } from "../fixture.js";
import { createEditingSession } from "../../src/editor.js";
import { textEditorView } from "../../src/text-editor.js";

for (const delivery of ["built", "dev"] as const) {
  describe.skipIf(process.env.HTMLNEXT_BROWSER_TEST !== "1")(`${delivery} System UI page departure`, () => {
    let root: string, server: ApplicationServer;
    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), "markupkit-editing-navigation-"));
      await installPackages(root);
      await write(root, "package.json", '{"private":true,"type":"module"}');
      await write(root, "app/pages/index.html", `<link rel="component" href="@threadlabs/system-ui/components/text-editor.html"><template component="departure-editor" module="./index.ts"><defs><state name="view" type="unknown"></state></defs><main><h1>Editor</h1><mk-text-editor $ref="editor" from:view="$view"></mk-text-editor><a href="/next/">Next page</a><form action="/next/" method="post"><button id="post">Submit page</button></form></main></template>`);
      const initial = textEditorView(createEditingSession({resource:"record/1",value:"Initial",version:1,operation:"save",copy:v=>v,equal:Object.is}).snapshot(),{id:"record",label:"Description"});
      await write(root, "app/pages/index.server.ts", `export const load = () => ({state:{view:${JSON.stringify(initial)}}});`);
      await write(root, "app/pages/index.ts", `import '@threadlabs/system-ui/web.css';
        import { createEditingModel } from '@threadlabs/system-ui';
        import { bindTextEditor } from '@threadlabs/system-ui/web';
        import { bindEditingNavigation } from '@threadlabs/system-ui/markupkit';
        export function connect(host) {
          let departure, held;
          window.commits = [];
          const model = createEditingModel({resource:'record/1', value:'Initial', version:1, operation:'save', copy:v=>v, equal:Object.is,
            effect(effect) { if(effect.kind==='navigate') departure.approve(effect); else { held=effect; window.commits.push(effect); } }
          });
          window.editorModel = model;
          window.finishSave = () => model.dispatch({type:'commit-result',operationId:held.operationId,result:{kind:'ok',value:held.value,version:2}});
          departure = bindEditingNavigation(host.root, model);
          const stop = bindTextEditor(host.refs.editor, {model,view:{id:'record',label:'Description'},render(view){host.state.view=view;}});
          return () => { departure.dispose(); stop(); };
        }`);
      await write(root, "app/pages/next.html", '<template component="departure-next"><main><h1>Next page</h1><a href="/">Editor</a></main></template>');
      if (delivery === "built") { await buildApplication({root}); server=await previewApplication({root,port:0}); }
      else server=await devApplication({root,port:0});
    });
    afterAll(async () => { await server?.close(); if(root) await rm(root,{recursive:true,force:true}); });
    for (const engine of [chromium,firefox,webkit]) it(`${engine.name()} keeps URL and draft until the approved page actually commits`, async () => {
      const browser=await engine.launch();
      try {
        const page=await browser.newPage(); page.setDefaultTimeout(5000); const errors:string[]=[];
        page.on('pageerror',error=>errors.push(error.message));
        // WebKit's driver retains a navigation wait after native precommit rejection. Pointer
        // input still reaches the visible document; inspect the native transition independently.
        const click = async (selector: string) => {
          await expect.poll(() => page.evaluate(selector => !!document.querySelector(selector), selector)).toBe(true);
          const point = await page.evaluate(selector => { const box = document.querySelector(selector)!.getBoundingClientRect(); return {x:box.x+box.width/2,y:box.y+box.height/2}; }, selector);
          await page.mouse.click(point.x,point.y);
        };
        const choose = (choice: string) => click(`button[data-editor-choice="${choice}"]`);
        await page.goto(server.url);
        const input=page.getByRole('textbox',{name:'Description',exact:true});
        await expect.poll(()=>input.getAttribute('readonly')).toBe(null);
        await input.fill('Draft');
        await click('a[href="/next/"]');
        await expect.poll(()=>page.evaluate(()=>!!document.querySelector('dialog[open]'))).toBe(true);
        expect(page.url()).toBe(server.url);
        await choose('stay');
        await expect.poll(()=>page.evaluate(()=>!!document.querySelector('dialog[open]'))).toBe(false);

        expect(page.url()).toBe(server.url); expect(await input.inputValue()).toBe('Draft');
        expect(await page.evaluate(()=>navigation.transition===null)).toBe(true);
        const warning = page.waitForEvent('dialog');
        const submitting = click('#post');
        const nativeWarning = await warning;
        expect(nativeWarning.type()).toBe('beforeunload');
        await nativeWarning.dismiss(); await submitting;
        expect(page.url()).toBe(server.url);
        expect(await input.inputValue()).toBe('Draft');
        // Preparation must not let a newer edit inherit an earlier discard approval.
        let release!:()=>void, requested!:()=>void;
        const waiting=new Promise<void>(done=>{release=done;});
        const seen=new Promise<void>(done=>{requested=done;});
        await page.route('**/next/payload.json*',async route=>{requested();await waiting;await route.continue().catch(()=>{});});
        await click('a[href="/next/"]');
        await choose('discard');
        await seen;
        expect(page.url()).toBe(server.url);
        await page.evaluate(()=>{const model=Reflect.get(window,'editorModel');model.dispatch({type:'edit',sessionId:model.snapshot().sessionId,value:'Newer draft'});});
        release();
        await expect.poll(()=>page.locator('html').getAttribute('data-mk-navigating')).toBe(null);
        expect(page.url()).toBe(server.url); expect(await input.inputValue()).toBe('Newer draft');
        await page.unroute('**/next/payload.json*');
        // A destination stylesheet may finish after native cancellation. Its preparation still
        // owns cleanup even though the host has already acknowledged the cancellation.
        let releaseStyle!: () => void, requestedStyle!: () => void;
        const stylesheet = new Promise<void>(done => {releaseStyle=done;});
        const styleSeen = new Promise<void>(done => {requestedStyle=done;});
        await page.route('**/next/payload.json*',route=>route.fulfill({status:503,body:'Use HTML'}));
        await page.route(server.url+'next/',route=>route.fulfill({contentType:'text/html',body:'<html><head><link rel="stylesheet" href="/held-style.css"></head><body><main data-mk-layer="0" data-component="departure-next"><h1>Next page</h1></main></body></html>'}));
        await page.route('**/held-style.css',async route=>{requestedStyle();await stylesheet;await route.fulfill({contentType:'text/css',body:'body { background: red; }'});});
        await click('a[href="/next/"]'); await choose('discard'); await styleSeen;
        expect(await page.evaluate(()=>!!document.querySelector('link[href="/held-style.css"]'))).toBe(true);
        await page.evaluate(()=>{const result=navigation.navigate('/?replacement=1');void result.committed!.catch(()=>{});void result.finished!.catch(error=>{Reflect.set(window,'replacementCancellation',error.name);});});
        await choose('stay');
        releaseStyle();
        await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'replacementCancellation'))).toBe('AbortError');
        await expect.poll(()=>page.evaluate(()=>!!document.querySelector('link[href="/held-style.css"]'))).toBe(false);
        expect(page.url()).toBe(server.url);
        expect(await input.inputValue()).toBe('Newer draft');
        await page.unroute('**/next/payload.json*');
        await page.unroute(server.url+'next/');
        await page.unroute('**/held-style.css');
        await click('a[href="/next/"]');
        await choose('save');
        expect(page.url()).toBe(server.url);
        expect(await page.evaluate(()=>Reflect.get(window,'commits').length)).toBe(1);
        await page.evaluate(()=>Reflect.get(window,'finishSave')());
        await page.getByRole('heading',{name:'Next page',exact:true}).waitFor();
        expect(page.url()).toBe(server.url+'next/');
        expect(await page.evaluate(()=>Reflect.get(window,'editorModel').snapshot().active)).toBe(false);
        await click('a[href="/"]');
        await page.getByRole('heading',{name:'Editor',exact:true}).waitFor();
        await expect.poll(()=>input.getAttribute('readonly')).toBe(null);
        expect(await input.inputValue()).toBe('Initial');
        await click('a[href="/next/"]');
        await page.getByRole('heading',{name:'Next page',exact:true}).waitFor();
        expect(await page.evaluate(()=>Reflect.get(window,'editorModel').snapshot().active)).toBe(false);
        expect(errors).toEqual([]);
      } finally {await browser.close();}
    });
  });
}
