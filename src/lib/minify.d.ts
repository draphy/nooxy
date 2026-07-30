/**
 * Type definitions for minify.js
 */

/**
 * Supported file types for minification
 */
export type FileType = 'js' | 'css' | 'html';

/**
 * Result object returned by minifyFile function
 */
export interface MinifyResult {
  /** Original file size in characters */
  originalSize: number;
  /** Processed file size in characters */
  processedSize: number;
}

/**
 * Converts JavaScript, CSS, or HTML file to TypeScript constant
 * @param inputFilePath - Path to the input file
 * @param outputFilePath - Path to the output TypeScript file
 * @param constantName - Name of the constant to create
 * @param minify - Whether to minify the code
 * @param fileType - Type of file: 'js', 'css', or 'html'
 * @returns Object containing original and processed file sizes
 * @throws Error if the input cannot be read, or if the minified output fails its
 *   sanity check — a malformed asset must not be written. Callers are expected to
 *   report and continue with the remaining assets; this used to call
 *   process.exit(1), which abandoned them.
 */
export declare function minifyFile(
  inputFilePath: string,
  outputFilePath: string,
  constantName: string,
  minify: boolean,
  fileType: FileType,
): MinifyResult;
