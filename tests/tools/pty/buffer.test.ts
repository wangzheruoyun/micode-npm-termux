// SKIP: Requires bun-pty with bun:ffi (Bun-specific native API) - skipping on Node.js
// tests/tools/pty/buffer.test.ts
import { describe, expect, it } from "vitest";
import { createRingBuffer } from "../../../src/tools/pty/buffer";

describe.skip("RingBuffer", () => {
  describe("append", () => {
    it("should store appended lines", () => {
      const buffer = createRingBuffer(100);
      buffer.append("line1\nline2\nline3");

      expect(buffer.length).toBe(3);
    });

    it("should evict oldest lines when max reached", () => {
      const buffer = createRingBuffer(3);
      buffer.append("line1\nline2\nline3\nline4\nline5");

      expect(buffer.length).toBe(3);
      const lines = buffer.read(0);
      expect(lines).toEqual(["line3", "line4", "line5"]);
    });
  });

  describe("read", () => {
    it("should return lines from offset", () => {
      const buffer = createRingBuffer(100);
      buffer.append("a\nb\nc\nd\ne");

      const lines = buffer.read(2, 2);
      expect(lines).toEqual(["c", "d"]);
    });

    it("should return all lines when no limit", () => {
      const buffer = createRingBuffer(100);
      buffer.append("a\nb\nc");

      const lines = buffer.read(0);
      expect(lines).toEqual(["a", "b", "c"]);
    });

    it("should normalize negative offset to 0", () => {
      const buffer = createRingBuffer(100);
      buffer.append("a\nb\nc");

      const lines = buffer.read(-5, 2);
      expect(lines).toEqual(["a", "b"]);
    });

    it("should handle empty string input", () => {
      const buffer = createRingBuffer(100);
      buffer.append("");

      expect(buffer.length).toBe(1);
      const lines = buffer.read(0);
      expect(lines).toEqual([""]);
    });

    it("should handle unicode characters", () => {
      const buffer = createRingBuffer(100);
      buffer.append("Hello 世界\n🎉 emoji\nкириллица");

      expect(buffer.length).toBe(3);
      const lines = buffer.read(0);
      expect(lines).toEqual(["Hello 世界", "🎉 emoji", "кириллица"]);
    });
  });

  describe("search", () => {
    it("should find lines matching pattern", () => {
      const buffer = createRingBuffer(100);
      buffer.append("info: starting\nerror: failed\ninfo: done\nerror: timeout");

      const matches = buffer.search(/error/);
      expect(matches).toHaveLength(2);
      expect(matches[0]).toEqual({ lineNumber: 2, text: "error: failed" });
      expect(matches[1]).toEqual({ lineNumber: 4, text: "error: timeout" });
    });

    it("should return empty array when no matches", () => {
      const buffer = createRingBuffer(100);
      buffer.append("line1\nline2");

      const matches = buffer.search(/notfound/);
      expect(matches).toEqual([]);
    });
  });

  describe("clear", () => {
    it("should remove all lines", () => {
      const buffer = createRingBuffer(100);
      buffer.append("line1\nline2");
      buffer.clear();

      expect(buffer.length).toBe(0);
    });
  });
});
