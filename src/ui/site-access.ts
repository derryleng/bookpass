// Fetching pictures from the sites themselves needs permission to reach them. BookPass asks only when the person
// presses a button that needs it, and hands the permission back afterwards, so it is not left standing.
import { browser } from "wxt/browser";

const sites = { origins: ["*://*/*"] };

export async function withSiteAccess<T>(job: () => Promise<T>): Promise<T> {
  const already = await browser.permissions.contains(sites);
  if (!already && !(await browser.permissions.request(sites))) {
    throw new Error(
      "Without permission to reach the sites, BookPass cannot fetch pictures from them.",
    );
  }
  try {
    return await job();
  } finally {
    if (!already) await browser.permissions.remove(sites).catch(() => {});
  }
}
