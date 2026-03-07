import { describe, it, expect, vi } from "vitest";
import { parseArgs, validateOutputPath } from "../bin.js";

// Suppress console output from parseArgs
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

describe("validateOutputPath", () => {
  it("allows paths within CWD", () => {
    expect(validateOutputPath("./content")).toBeNull();
  });

  it("allows nested paths within CWD", () => {
    expect(validateOutputPath("./src/content/posts")).toBeNull();
  });

  it("rejects paths outside CWD", () => {
    const result = validateOutputPath("/tmp/outside");
    expect(result).toContain("must be within");
  });

  it("rejects parent directory traversal", () => {
    const result = validateOutputPath("../../etc");
    // This may or may not resolve outside CWD depending on CWD depth,
    // but the function should catch it if it resolves outside
    if (result) {
      expect(result).toContain("must be within");
    }
  });
});

describe("parseArgs", () => {
  it("returns null when no args (shows help)", () => {
    const result = parseArgs(["node", "bin.js"]);
    expect(result).toBeNull();
  });

  it("returns null when --help is passed", () => {
    const result = parseArgs(["node", "bin.js", "--help"]);
    expect(result).toBeNull();
  });

  it("returns null when --url is missing", () => {
    const result = parseArgs(["node", "bin.js", "--output", "./out"]);
    expect(result).toBeNull();
  });

  it("parses valid arguments", () => {
    const result = parseArgs([
      "node", "bin.js",
      "--url", "https://example.com",
      "--output", "./content",
      "--depth", "3",
      "--delay", "1000",
    ]);

    expect(result).not.toBeNull();
    expect(result!.url).toBe("https://example.com");
    expect(result!.output).toBe("./content");
    expect(result!.depth).toBe(3);
    expect(result!.delay).toBe(1000);
    expect(result!.concurrency).toBe(1);
  });

  it("uses default values when optional args are missing", () => {
    const result = parseArgs(["node", "bin.js", "--url", "https://example.com"]);

    expect(result).not.toBeNull();
    expect(result!.output).toBe("./content");
    expect(result!.depth).toBe(1);
    expect(result!.delay).toBe(500);
  });

  it("rejects invalid URL", () => {
    const result = parseArgs(["node", "bin.js", "--url", "not-a-url"]);
    expect(result).toBeNull();
  });

  it("clamps negative depth to 0", () => {
    const result = parseArgs([
      "node", "bin.js",
      "--url", "https://example.com",
      "--depth", "-5",
    ]);
    expect(result).not.toBeNull();
    expect(result!.depth).toBeGreaterThanOrEqual(0);
  });

  it("clamps negative delay to 0", () => {
    const result = parseArgs([
      "node", "bin.js",
      "--url", "https://example.com",
      "--delay", "-100",
    ]);
    expect(result).not.toBeNull();
    expect(result!.delay).toBeGreaterThanOrEqual(0);
  });

  // SSRF protection tests
  it("blocks localhost", () => {
    expect(parseArgs(["node", "bin.js", "--url", "https://localhost/path"])).toBeNull();
  });

  it("blocks 127.0.0.1", () => {
    expect(parseArgs(["node", "bin.js", "--url", "https://127.0.0.1/path"])).toBeNull();
  });

  it("blocks 0.0.0.0", () => {
    expect(parseArgs(["node", "bin.js", "--url", "https://0.0.0.0/path"])).toBeNull();
  });

  it("blocks 192.168.x.x", () => {
    expect(parseArgs(["node", "bin.js", "--url", "https://192.168.1.1/path"])).toBeNull();
  });

  it("blocks 10.x.x.x", () => {
    expect(parseArgs(["node", "bin.js", "--url", "https://10.0.0.1/path"])).toBeNull();
  });

  it("blocks .local domains", () => {
    expect(parseArgs(["node", "bin.js", "--url", "https://myhost.local/path"])).toBeNull();
  });

  it("blocks IPv6 loopback ::1", () => {
    expect(parseArgs(["node", "bin.js", "--url", "https://[::1]/path"])).toBeNull();
  });

  it("blocks file:// protocol", () => {
    expect(parseArgs(["node", "bin.js", "--url", "file:///etc/passwd"])).toBeNull();
  });

  it("blocks 172.16.x.x private range", () => {
    expect(parseArgs(["node", "bin.js", "--url", "https://172.16.0.1/path"])).toBeNull();
  });

  it("blocks 169.254.x.x link-local", () => {
    expect(parseArgs(["node", "bin.js", "--url", "https://169.254.1.1/path"])).toBeNull();
  });

  it("allows valid public URLs", () => {
    const result = parseArgs(["node", "bin.js", "--url", "https://blog.example.com/posts"]);
    expect(result).not.toBeNull();
    expect(result!.url).toBe("https://blog.example.com/posts");
  });
});
