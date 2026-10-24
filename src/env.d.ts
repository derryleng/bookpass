/**
 * True only in the build the Firefox end to end test uses (see tests/e2e/firefox.ts). That build can open its own
 * pages and read any tab, because a script cannot press the toolbar button in Firefox. It is never shipped.
 */
declare const __E2E__: boolean;
