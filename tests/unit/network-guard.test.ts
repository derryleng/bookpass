// Which addresses count as "this computer or its local network".
import { describe, expect, it } from "vitest";
import { isPrivateHost } from "../../src/network-guard";

describe("isPrivateHost", () => {
  it.each([
    "http://localhost:3000/",
    "http://LOCALHOST./",
    "http://app.localhost/",
    "http://127.0.0.1/",
    "http://127.1/",
    "http://2130706433/", // 127.0.0.1 written as one number
    "http://0x7f.0.0.1/",
    "http://0.0.0.0/",
    "http://10.1.2.3/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/",
    "http://224.0.0.1/",
    "http://[::1]/",
    "http://[::]/",
    "http://[fd12:3456::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:192.168.1.1]/", // an IPv4 address inside IPv6
    "http://[::ffff:7f00:1]/",
    "http://[64:ff9b::a00:1]/",
    "http://router/",
    "http://nas.local/",
    "http://printer.lan/",
    "https://service.internal/",
    "not a url",
  ])("treats %s as private", (url) => {
    expect(isPrivateHost(url)).toBe(true);
  });

  it.each([
    "https://example.org/",
    "https://www.example.org:8443/a",
    "http://8.8.8.8/",
    "http://172.15.0.1/",
    "http://172.32.0.1/",
    "http://100.128.0.1/",
    "http://192.169.0.1/",
    "http://169.253.0.1/",
    "http://[2606:4700:4700::1111]/",
    "http://[::ffff:8.8.8.8]/",
    "https://locally.example.org/",
    "https://notlocal.com/",
  ])("treats %s as public", (url) => {
    expect(isPrivateHost(url)).toBe(false);
  });
});
