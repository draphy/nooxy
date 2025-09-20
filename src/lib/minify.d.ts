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
 * Escapes code for safe inclusion in template literals
 * @param code - The code to escape
 * @returns Escaped code
 */
export declare function escapeForTemplateLiteral(code: string): string;

/**
 * CSS minifier that preserves functionality
 * @param code - The CSS code to minify
 * @returns Minified CSS code
 */
export declare function minifyCSS(code: string): string;

/**
 * HTML minifier that preserves functionality
 * @param code - The HTML code to minify
 * @returns Minified HTML code
 */
export declare function minifyHTML(code: string): string;

/**
 * Advanced JavaScript minifier with better regex handling
 * @param code - The JavaScript code to minify
 * @returns Minified JavaScript code
 */
export declare function advancedMinifyJavaScript(code: string): string;

/**
 * Converts JavaScript, CSS, or HTML file to TypeScript constant
 * @param inputFilePath - Path to the input file
 * @param outputFilePath - Path to the output TypeScript file
 * @param constantName - Name of the constant to create
 * @param minify - Whether to minify the code
 * @param fileType - Type of file: 'js', 'css', or 'html'
 * @returns Object containing original and processed file sizes
 */
export declare function minifyFile(
  inputFilePath: string,
  outputFilePath: string,
  constantName: string,
  minify: boolean,
  fileType: FileType,
): MinifyResult;
