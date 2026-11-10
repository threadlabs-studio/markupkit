import type { BrowserType } from "playwright";

/** Run the same cases against an optional remote Firefox with access to local fixture servers. */
export function launchBrowser(type: BrowserType) {
  const endpoint = process.env.MARKUPKIT_FIREFOX_ENDPOINT;
  return type.name() === "firefox" && endpoint
    ? type.connect(endpoint, { exposeNetwork: "<loopback>" })
    : type.launch({ headless: true });
}
