// Identities that the extension, the helper's host manifest and the tests all share.
import { createHash } from 'node:crypto';

// Public half of a development key. It pins the Chrome extension id so the helper
// can name it in allowed_origins before the extension is published. The store
// assigns the real id, which will need adding to the helper manifest then.
export const chromeDevKey =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5q+qF4vPv3uX7O5kL4La+fb3XROFKe6GF+ekfWM3skPJ4jmfJJ5Q3kdXSQilXS+ORslhc+UrCFCZlsAZORfedoDk+IJp2rGZ7DsUfXhxT1QvY98alcw02fZcy9r5mYXKRuczq84vvPo52IFc9Zk7OPFfO9gwQW7yhJGCv4s/UVFew3Pf0w51Ney7QVYHknyiAwu4P/JrdoKAn6GYwXv0wJbzBjSiNbQxFGsDtKZa6x01HUH/y1Tf4/iv2BQYiJJVffVQfmF4hR2yuSlIPQ4lBQnWx8LWvtKgbZKtNnQS5Ij0yfU6zgKlxBUeGTHqjDsiNOCwTXKfs00a1nZWJOMMfQIDAQAB';

// Chrome derives the id from the first 16 bytes of the key's SHA-256, written with the letters a to p.
export const chromeId = [
  ...createHash('sha256').update(Buffer.from(chromeDevKey, 'base64')).digest().subarray(0, 16),
]
  .map((b) => String.fromCharCode(97 + (b >> 4)) + String.fromCharCode(97 + (b & 15)))
  .join('');

export const firefoxId = 'bookpass@derryleng.github.io';
export const hostName = 'com.bookpass.helper';
