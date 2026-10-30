// Telling addresses on this computer or its local network from addresses on the internet. A page or an imported file
// can name any address as a picture, and BookPass holds the permission to reach every site while it fetches
// pictures, so those requests must not be aimed at the person's own devices.
//
// This looks at the address as written. A public name that points at a private address (DNS rebinding, or a name
// such as 127.0.0.1.nip.io) cannot be told apart without a lookup, which an extension cannot make.

/** A name that only makes sense on a local network. */
const localSuffixes = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".intranet",
  ".lan",
  ".home.arpa",
];

/** Four numbers 0 to 255 in the ranges that are not reachable from the internet. */
function privateIPv4([a, b, c]: number[]): boolean {
  return (
    a === 0 || // this network
    a === 10 ||
    (a === 100 && b! >= 64 && b! <= 127) || // carrier grade NAT
    a === 127 ||
    (a === 169 && b === 254) || // link local, including cloud metadata services
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a! >= 224 // multicast and reserved
  );
}

/** The eight 16 bit groups of an IPv6 address, or undefined if it is not one. */
function groups(address: string): number[] | undefined {
  const [head, tail, extra] = address.split("::");
  if (extra !== undefined) return undefined;
  const part = (text: string | undefined) =>
    text ? text.split(":").map((g) => parseInt(g, 16)) : [];
  const first = part(head);
  const last = part(tail);
  const fill = 8 - first.length - last.length;
  if (tail === undefined ? fill !== 0 : fill < 1) return undefined;
  const all = [
    ...first,
    ...new Array<number>(Math.max(fill, 0)).fill(0),
    ...last,
  ];
  return all.length === 8 && all.every((g) => g >= 0 && g <= 0xffff)
    ? all
    : undefined;
}

function privateIPv6(address: string): boolean {
  const g = groups(address);
  if (!g) return true; // not something to trust
  const [first] = g as [number];
  const embedsIPv4 =
    g.slice(0, 5).every((x) => x === 0) && (g[5] === 0 || g[5] === 0xffff); // ::a.b.c.d and ::ffff:a.b.c.d
  const nat64 =
    g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0);
  if (embedsIPv4 || nat64) {
    const v4 = [g[6]! >> 8, g[6]! & 255, g[7]! >> 8, g[7]! & 255];
    return privateIPv4(v4);
  }
  return (
    g.every((x) => x === 0) || // ::
    (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) || // ::1
    (first & 0xfe00) === 0xfc00 || // unique local
    (first & 0xffc0) === 0xfe80 || // link local
    (first & 0xff00) === 0xff00 // multicast
  );
}

/** Whether the address is on this computer or a local network, or cannot be read as an address at all. */
export function isPrivateHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return true;
  }
  if (host.startsWith("[")) return privateIPv6(host.slice(1, -1));
  // The URL parser has already turned forms such as 2130706433 or 0x7f.1 into four numbers.
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (v4) return privateIPv4(v4.slice(1).map(Number));
  return (
    !host.includes(".") || // a bare name such as "router" or "localhost"
    localSuffixes.some((suffix) => host.endsWith(suffix))
  );
}
