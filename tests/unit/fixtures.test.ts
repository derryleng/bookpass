// Makes the golden vault files in tests/fixtures. They are committed, so a change in how BookPass reads or
// writes the format fails a test (see kdbx.test.ts). Run this only when the format deliberately changes:
//
//   UPDATE_FIXTURES=1 npx vitest run tests/unit/fixtures.test.ts
//
// golden-bookpass.kdbx comes from BookPass. golden-keepassxc.kdbx comes from KeePassXC's own command line tool.
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import * as model from "../../src/bookmark-model";
import {
  credentialsFromPassword,
  newDatabase,
  saveDatabase,
} from "../../src/kdbx";

const dir = fileURLToPath(new URL("../fixtures/", import.meta.url));
const password = "golden";

describe.skipIf(!process.env.UPDATE_FIXTURES)("golden files", () => {
  it("writes the BookPass vault", async () => {
    const db = newDatabase(await credentialsFromPassword(password), {
      memoryMiB: 1,
      iterations: 1,
      parallelism: 1,
    });
    const folder = model.createFolder(db, null, "Reading", {
      icon: "fa-solid:book",
      color: "#3e63dd",
    });
    await model.addBookmark(
      db,
      {
        folderId: folder,
        title: "The Rust Book",
        url: "https://doc.rust-lang.org/book/",
        note: "ownership chapter",
        excerpt: "Learn Rust",
        type: "article",
        favorite: true,
        tags: ["rust", "learning"],
      },
      {
        favicon: {
          site: "https://doc.rust-lang.org",
          png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
        },
      },
    );
    await model.addBookmark(db, {
      folderId: null,
      title: "Loose",
      url: "https://example.com/",
    });
    writeFileSync(dir + "golden-bookpass.kdbx", await saveDatabase(db));
  });

  it("writes the KeePassXC vault", () => {
    const xc = "C:/Program Files/KeePassXC/keepassxc-cli.exe";
    const file = dir + "golden-keepassxc.kdbx";
    rmSync(file, { force: true });
    execFileSync(xc, ["db-create", "-q", "-p", file], {
      input: `${password}\n${password}\n`,
    });
    execFileSync(
      xc,
      ["add", "-q", file, "--url", "https://keepassxc.org/", "KeePassXC site"],
      {
        input: `${password}\n`,
      },
    );
  });
});
