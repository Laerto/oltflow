import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizeOnuSchema, authorizeEponSchema, pppoeSchema, replaceOnuSchema } from "./schemas.js";

// SEC-01 regression suite: every field that reaches a ZTE CLI command must reject values
// that could break out of their command (embedded newline = injection), while still
// accepting the values the office actually uses.

test("authorizeOnuSchema accepts a clean payload", () => {
  const r = authorizeOnuSchema.safeParse({ oltId: 1, onuSerial: "ZTEGC0FFEE01", ponPort: "gpon-onu_1/15/1:1" });
  assert.equal(r.success, true);
});

test("authorizeOnuSchema rejects a newline-injected serial", () => {
  const r = authorizeOnuSchema.safeParse({
    oltId: 1,
    onuSerial: "ZTEG\nsecurity-mgmt 999 state disable",
    ponPort: "gpon-onu_1/15/1:1",
  });
  assert.equal(r.success, false);
});

test("authorizeOnuSchema rejects a newline in onuName", () => {
  const r = authorizeOnuSchema.safeParse({
    oltId: 1, onuSerial: "ZTEGC0FFEE01", ponPort: "gpon-onu_1/15/1:1",
    onuName: "Client\nno onu 1",
  });
  assert.equal(r.success, false);
});

test("authorizeOnuSchema allows spaces in onuName", () => {
  const r = authorizeOnuSchema.safeParse({
    oltId: 1, onuSerial: "ZTEGC0FFEE01", ponPort: "gpon-onu_1/15/1:1",
    onuName: "Filan Fisteku",
  });
  assert.equal(r.success, true);
});

test("authorizeOnuSchema rejects an injected traffic profile", () => {
  const r = authorizeOnuSchema.safeParse({
    oltId: 1, onuSerial: "ZTEGC0FFEE01", ponPort: "gpon-onu_1/15/1:1",
    trafficProfile: "1G\nreboot",
  });
  assert.equal(r.success, false);
});

test("pppoeSchema rejects a newline-injected password", () => {
  const r = pppoeSchema.safeParse({
    oltId: 1, ponPort: "gpon-onu_1/15/1:1",
    pppoeUsername: "user1", pppoePassword: "p\nreboot",
  });
  assert.equal(r.success, false);
});

test("pppoeSchema rejects whitespace in credentials", () => {
  const r = pppoeSchema.safeParse({
    oltId: 1, ponPort: "gpon-onu_1/15/1:1",
    pppoeUsername: "user 1", pppoePassword: "secret",
  });
  assert.equal(r.success, false);
});

test("pppoeSchema accepts symbol-rich single-token credentials", () => {
  const r = pppoeSchema.safeParse({
    oltId: 1, ponPort: "gpon-onu_1/15/1:1",
    pppoeUsername: "user@isp", pppoePassword: "P@ss!w0rd#2026",
  });
  assert.equal(r.success, true);
});

test("authorizeEponSchema accepts the field-verified MAC + type", () => {
  const r = authorizeEponSchema.safeParse({
    oltId: 1, ponPort: "epon-onu_1/2/3:1", onuMac: "bcf8.8b45.ebcc", onuType: "ZTE-F460",
  });
  assert.equal(r.success, true);
});

test("authorizeEponSchema rejects an injected MAC", () => {
  const r = authorizeEponSchema.safeParse({
    oltId: 1, ponPort: "epon-onu_1/2/3:1", onuMac: "bcf8.8b45.ebcc\nreboot", onuType: "ZTE-F460",
  });
  assert.equal(r.success, false);
});

test("authorizeEponSchema rejects an unknown ONU type", () => {
  const r = authorizeEponSchema.safeParse({
    oltId: 1, ponPort: "epon-onu_1/2/3:1", onuMac: "bcf8.8b45.ebcc", onuType: "EVIL; reboot",
  });
  assert.equal(r.success, false);
});

test("replaceOnuSchema rejects a newline-injected serial", () => {
  const r = replaceOnuSchema.safeParse({ onuId: 1, onuSerial: "AA\nBB" });
  assert.equal(r.success, false);
});
