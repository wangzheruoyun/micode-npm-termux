import { vi } from "vitest";

// Mock bun:test globals
globalThis.describe = describe;
globalThis.it = it;
globalThis.expect = expect;
globalThis.beforeEach = beforeEach;
globalThis.afterEach = afterEach;
globalThis.spyOn = vi.spyOn;

// Mock console methods
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});
vi.spyOn(console, "debug").mockImplementation(() => {});

// Mock process.env for tests
process.env.NODE_ENV = "test";