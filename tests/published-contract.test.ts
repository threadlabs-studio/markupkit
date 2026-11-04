import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createApplication } from "../dist/index.js";
import { write } from "./fixture.js";

it("preserves the published mk metadata, navigation component and layer contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "markupkit-contract-"));
  await write(root, "app/pages/index.html", '<meta name="mk:page" content="contract-page"><template component="contract-helper"><strong>Selected helper</strong></template><template component="contract-page"><defs><meta name="mk:label" content="Published contract"><prop name="links" type="list(object({ href: string, label: string, current: string, depth: number, pageName: string }))" required>Links</prop></defs><main><contract-helper></contract-helper><mk-nav from:items="$links"></mk-nav></main></template>');
  await write(root, "app/pages/index.server.ts", 'export const load = async ({ navigation }) => ({ props: { links: await navigation() } });');
  try {
    const application = await createApplication({ root });
    try {
      expect(application.routes[0]?.pageName).toBe("contract-page");
      const page = await application.render("/");
      expect(page.body).toContain("Selected helper");
      expect(page.body).toContain(' component="mk-nav"');
      expect(page.body).toContain('data-mk-layer="0"');
      expect(page.body).toContain('aria-current="page"');
      expect(page.body).toContain("Published contract");
    } finally { await application.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
