/**
 * Cross-platform binary lookup — mirrors proxy.find_binary() in Python SDK.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Returns the absolute path to `name` on PATH, or null if not found.
 * Uses `which` on Unix and `where` on Windows.
 */
export async function which(name: string): Promise<string | null> {
  const cmd = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await execFileAsync(cmd, [name]);
    return stdout.trim().split("\n")[0]?.trim() ?? null;
  } catch {
    return null;
  }
}
