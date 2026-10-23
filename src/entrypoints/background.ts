import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import * as model from '../bookmark-model';
import { startContextMenu } from '../context-menu';
import { getHistory, restoreVersion } from '../history';
import { importInto, previewImport } from '../importing';
import { startLockManager } from '../lock-manager';
import {
  AppError,
  pagePortName,
  passiveRequests,
  type BroadcastEvent,
  type RequestEnvelope,
  type RequestType,
  type Requests,
  type ResponseEnvelope,
} from '../messages';
import { addTags, deleteTag, renameTag, setTagColor } from '../tags';
import { Vault } from '../vault';

type Handlers = { [K in RequestType]: (payload: Requests[K][0]) => Promise<Requests[K][1]> };

export default defineBackground(() => {
  const vault = new Vault();
  const ready = vault.loadSettings();
  const locks = startLockManager(vault);
  void ready.then(() => locks.applyIdleSettings());

  // Tell every open page when something changed, so they can refresh.
  const broadcast = (event: BroadcastEvent['event']) => {
    browser.runtime.sendMessage({ event } satisfies BroadcastEvent).catch(() => {}); // no page open is fine
  };
  vault.onEvent(broadcast);
  startContextMenu(vault);

  const handlers: Handlers = {
    status: () => vault.status(),
    setVaultPath: ({ vaultPath }) => vault.setVaultPath(vaultPath),
    setBackupCount: ({ count }) => vault.setBackupCount(count),
    createVault: (secret) => vault.createVault(secret),
    unlock: (secret) => vault.unlock(secret),
    newKeyFile: () => vault.newKeyFile(),
    changePassword: ({ current, next }) => vault.changePassword(current, next),
    lock: () => vault.lock(),
    saveNow: async () => {
      await vault.saveNow().catch(() => {}); // the failure is part of the status
      return vault.status();
    },
    checkFile: () => vault.checkForChanges(),
    mergeConflictCopy: ({ name }) => vault.mergeConflictCopy(name),
    resolveConflict: ({ id, action }) => vault.resolveConflict(id, action),
    listBackups: () => vault.listBackups(),
    restoreBackup: ({ name, password, keyFile }) =>
      vault.restoreBackup(name, password === undefined ? undefined : { password, keyFile }),
    snapshot: () => vault.snapshot(),
    getImage: ({ kind, id }) => vault.image(kind, id),
    addBookmark: ({ input, capture }) =>
      vault.edit((db) => model.addBookmark(db, input, Vault.capture(capture))),
    updateBookmark: ({ id, patch, capture }) =>
      vault.edit((db) => model.updateBookmark(db, id, patch, Vault.capture(capture))),
    moveBookmarks: ({ ids, folderId }) =>
      vault.edit((db) => model.moveBookmarks(db, ids, folderId)),
    setOrder: ({ orders }) => vault.edit((db) => model.setOrders(db, orders)),
    trashBookmarks: ({ ids }) => vault.edit((db) => model.trashBookmarks(db, ids)),
    restoreBookmarks: ({ ids }) => vault.edit((db) => model.restoreBookmarks(db, ids)),
    deleteForever: ({ ids }) => vault.edit((db) => model.deleteForever(db, ids)),
    emptyTrash: () => vault.edit((db) => model.emptyTrash(db)),
    history: ({ id }) => vault.read((db) => getHistory(db, id)),
    restoreVersion: ({ id, time }) => vault.edit((db) => restoreVersion(db, id, time)),
    createFolder: ({ parentId, name, patch }) =>
      vault.edit((db) => model.createFolder(db, parentId, name, Vault.folderPatch(patch))),
    updateFolder: ({ id, patch }) =>
      vault.edit((db) => model.updateFolder(db, id, Vault.folderPatch(patch)!)),
    moveFolder: ({ id, parentId }) => vault.edit((db) => model.moveFolder(db, id, parentId)),
    trashFolder: ({ id }) => vault.edit((db) => model.trashFolder(db, id)),
    renameTag: ({ from, to }) => vault.edit((db) => renameTag(db, from, to)),
    deleteTag: ({ tag }) => vault.edit((db) => deleteTag(db, tag)),
    setTagColor: ({ tag, color }) => vault.edit((db) => setTagColor(db, tag, color)),
    addTags: ({ ids, tags }) => vault.edit((db) => addTags(db, ids, tags)),
    importPreview: ({ parsed, skipDuplicates }) =>
      vault.read((db) => previewImport(db, parsed, skipDuplicates)),
    importBookmarks: ({ parsed, parentId, wrapper, skipDuplicates }) =>
      vault.edit((db) => importInto(db, parsed, parentId, wrapper, skipDuplicates)),
    getSettings: async () => vault.settings,
    setSettings: async (patch) => {
      const settings = await vault.setSettings(patch);
      locks.applyIdleSettings();
      void locks.check();
      return settings;
    },
  };

  async function handle(request: RequestEnvelope): Promise<ResponseEnvelope> {
    await ready;
    try {
      if (!passiveRequests.includes(request.type)) locks.touch();
      const handler = handlers[request.type] as (payload: unknown) => Promise<unknown>;
      return { ok: true, value: await handler(request.payload) };
    } catch (e) {
      if (!(e instanceof AppError)) console.error('BookPass request failed', request.type, e);
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        code: e instanceof AppError ? e.code : undefined,
      };
    }
  }

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (typeof message !== 'object' || message === null || !('type' in message)) return false; // a broadcast, not a request
    void handle(message as RequestEnvelope).then(sendResponse);
    return true; // the answer comes later
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name === pagePortName) locks.addPage(port);
  });
});
