/** Native component identity: a present canonical attribute, including empty, takes precedence. */
export const componentRoots = ':is([component]:not(template), [data-component]:not([component]))';
export function componentNames(element: Element): string {
  return element.getAttribute("component") ?? element.getAttribute("data-component") ?? "";
}
