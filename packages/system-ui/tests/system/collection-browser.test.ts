import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApplication, devApplication, previewApplication, type ApplicationServer } from "@threadlabs/markupkit";
import { installPackages, write } from "../fixture.js";

for (const delivery of ["built", "dev"] as const) {
  describe.skipIf(process.env.HTMLNEXT_BROWSER_TEST !== "1")(`${delivery} System UI collection`, () => {
    let root: string, server: ApplicationServer;
    beforeAll(async () => {
      root=await mkdtemp(join(tmpdir(),"markupkit-system-collection-"));
      await installPackages(root);
      await write(root,"package.json",'{"private":true,"type":"module"}');
      await write(root,"app/pages/index.html",'<template component="collection-home"><main><h1>Home</h1></main></template>');
      await write(root,"app/pages/notes/coast.html",'<link rel="component" href="@threadlabs/system-ui/components/collection.html"><link rel="component" href="@threadlabs/looma/components/ui-button/ui-button.html"><template component="collection-page" module="./collection.ts"><defs><state name="view" type="unknown"></state></defs><main><h1>Your notes</h1><mk-collection from:view="$view"><form slot="recovery" id="retry" method="get" action="/notes/coast/"><ui-button type="submit">Reload notes</ui-button></form></mk-collection></main><style>:host {max-inline-size:56rem;margin-inline:auto;padding:1.5rem;font-family:system-ui,sans-serif;}</style></template>');
      await write(root,"app/pages/notes/garden.html",'<template component="garden-page"><main><h1>Garden</h1></main></template>');
      await write(root,"app/pages/notes/coast.server.ts",`import { collectionView } from "@threadlabs/system-ui";
        const items=[{key:'coast',href:'/notes/coast/',label:'Coast',summary:'Sea air and quiet mornings'},{key:'garden',href:'/notes/garden/',label:'Garden',summary:'A little room for something to grow'}];
        const options={id:'notes',label:'Your notes',currentKey:'coast'};
        export const load=()=>({state:{view:collectionView({state:'ready',items},options)}});`);
      await write(root,"app/pages/notes/collection.ts",`import '@threadlabs/system-ui/web.css';
        import { collectionView } from '@threadlabs/system-ui';
        const items=[{key:'coast',href:'/notes/coast/',label:'Coast',summary:'Sea air and quiet mornings'},{key:'garden',href:'/notes/garden/',label:'Garden',summary:'A little room for something to grow'}];
        const options={id:'notes',label:'Your notes',currentKey:'coast'};
        export function connect(host) {
          window.updateCollection=(state,reverse=false)=>host.state.view=collectionView({state,items:state==='ready'&&reverse?[]:reverse?[...items].reverse():items,...(state==='error'?{message:'Offline; your notes remain available'}:{})},options);
          window.reverseCollection=()=>host.state.view=collectionView({state:'ready',items:[...items].reverse()},options);
          window.refreshes=0;
          host.on('submit',event=>{if(event.target.id==='retry'){event.preventDefault();window.refreshes++;window.updateCollection('pending');}});
        }`);
      if(delivery==='built'){await buildApplication({root});server=await previewApplication({root,port:0});}
      else server=await devApplication({root,port:0});
    });
    afterAll(async()=>{await server?.close();if(root)await rm(root,{recursive:true,force:true});});
    for(const engine of [chromium,firefox,webkit]) it(`${engine.name()} preserves linked rows, focus and provider feedback`,async()=>{
      const browser=await engine.launch();
      try {
        for(const width of [1200,375]) {
          const page=await browser.newPage({viewport:{width,height:900}});const errors:string[]=[];page.setDefaultTimeout(5000);
          page.on('pageerror',error=>errors.push(error.message));
          await page.goto(server.url+'notes/coast/');
          await page.waitForFunction(()=>typeof Reflect.get(window,'reverseCollection')==='function',null,{timeout:5000});
          const coast=page.getByRole('link',{name:'Coast',exact:true}), garden=page.getByRole('link',{name:'Garden',exact:true});
          expect(await coast.getAttribute('aria-current')).toBe('page');
          await garden.focus();
          expect(await page.evaluate(()=>document.activeElement?.getAttribute('data-resource-key'))).toBe('garden');
          expect(await garden.getAttribute('aria-current')).toBe(null);expect(page.url()).toBe(server.url+'notes/coast/');
          await page.evaluate(()=>Reflect.set(window,'coastRow',document.querySelector('[data-resource-key="coast"]')));
          await page.evaluate(()=>Reflect.get(window,'reverseCollection')());
          expect(await page.evaluate(()=>Reflect.get(window,'coastRow')===document.querySelector('[data-resource-key="coast"]'))).toBe(true);
          expect(await page.evaluate(()=>document.activeElement?.getAttribute('data-resource-key'))).toBe('garden');
          await page.getByRole('button',{name:'Reload notes'}).click();
          await expect.poll(()=>page.getByRole('navigation',{name:'Your notes'}).getAttribute('aria-busy')).toBe('true');
          expect(await page.getByRole('status').textContent()).toContain('Loading');expect(await coast.count()).toBe(1);
          expect(await page.evaluate(()=>Reflect.get(window,'refreshes'))).toBe(1);
          await page.evaluate(()=>Reflect.get(window,'updateCollection')('error'));
          await expect.poll(()=>page.getByRole('alert').textContent()).toContain('Offline');expect(await coast.count()).toBe(1);
          await page.evaluate(()=>Reflect.get(window,'updateCollection')('ready',true));
          await expect.poll(()=>page.getByRole('status').textContent()).toContain('No items');expect(await coast.count()).toBe(0);
          await page.evaluate(()=>Reflect.get(window,'updateCollection')('ready'));
          expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
          const screenshots=process.env.HTMLKIT_SYSTEM_UI_SCREENSHOTS;
          if(screenshots&&delivery==='built'&&engine===chromium){await mkdir(screenshots,{recursive:true});await page.screenshot({path:join(screenshots,`system-ui-collection-${width}.png`)});}
          await garden.click();await page.getByRole('heading',{name:'Garden',exact:true}).waitFor();
          expect(page.url()).toBe(server.url+'notes/garden/');expect(errors).toEqual([]);await page.close();
        }
        const plain=await browser.newContext({javaScriptEnabled:false});plain.setDefaultTimeout(5000);const page=await plain.newPage();
        await page.goto(server.url+'notes/coast/');await page.getByRole('button',{name:'Reload notes'}).click();
        expect(new URL(page.url()).pathname).toBe('/notes/coast/');await page.getByRole('link',{name:'Garden',exact:true}).click();
        expect(await page.getByRole('heading',{name:'Garden',exact:true}).count()).toBe(1);
      }finally{await browser.close();}
    });
  });
}
