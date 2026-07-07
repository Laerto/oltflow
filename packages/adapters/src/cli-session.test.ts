import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSingleCliLine } from "./cli-session.js";

// SEC-01 second layer: the transport must refuse any command carrying an embedded newline,
// no matter how it was built, so a future unvalidated field can't inject OLT commands.

test("assertSingleCliLine allows a normal command", () => {
  assert.doesNotThrow(() => assertSingleCliLine("onu 1 type F660 sn ZTEGC0FFEE01"));
});

test("assertSingleCliLine rejects an embedded LF", () => {
  assert.throws(() => assertSingleCliLine("name x\nno onu 1"));
});

test("assertSingleCliLine rejects an embedded CR", () => {
  assert.throws(() => assertSingleCliLine("name x\rno onu 1"));
});
