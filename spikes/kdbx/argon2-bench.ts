// How long does hash-wasm Argon2id take at different settings? Run: node spikes/kdbx/argon2-bench.ts
import { argon2id } from 'hash-wasm';

const password = new Uint8Array(32).fill(1);
const salt = new Uint8Array(32).fill(2);
for (const [memMiB, iterations] of [
  [19, 2],
  [64, 3],
  [128, 3],
  [256, 3],
  [512, 3],
  [64, 10],
  [64, 20],
] as const) {
  const t0 = performance.now();
  await argon2id({
    password,
    salt,
    memorySize: memMiB * 1024,
    iterations,
    parallelism: 2,
    hashLength: 32,
    outputType: 'binary',
  });
  console.log(`${memMiB} MiB x${iterations}: ${(performance.now() - t0).toFixed(0)} ms`);
}
