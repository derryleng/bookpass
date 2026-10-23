// Numbers and addresses that more than one part of BookPass needs.

/** Where people get the helper. Release builds attach it here. */
export const helperDownloadUrl = 'https://github.com/derryleng/bookpass/releases/latest';

const MiB = 1024 * 1024;

/** The vault is read, decrypted and rewritten whole, so a big one is slow. Past this the manager warns. */
export const warnVaultBytes = 50 * MiB;
/** Past this no new cover pictures are stored. */
export const stopCoversVaultBytes = 150 * MiB;

/** A cover picture is squeezed until it is no bigger than this. */
export const maxCoverBytes = 20 * 1024;
