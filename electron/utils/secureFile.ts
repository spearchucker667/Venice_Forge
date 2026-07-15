import fs from "fs";
import { constants as fsConstants } from "fs";

/**
 * Reads a regular file through the descriptor opened with no-follow semantics.
 * Validation and consumption therefore operate on the same filesystem object.
 */
export async function readRegularFileNoFollow(filePath: string): Promise<Buffer> {
  const handle = await fs.promises.open(
    filePath,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("Not a regular file");
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
