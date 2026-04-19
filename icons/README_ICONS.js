/**
 * generate_icons.js
 * ─────────────────────────────────────────────────────────────────────────
 * Run this ONCE with Node.js to generate the extension icons.
 * 
 * Usage: node generate_icons.js
 * 
 * This creates simple SVG icons converted to PNG-like data URLs.
 * For production, replace with proper PNG files from a designer.
 * ─────────────────────────────────────────────────────────────────────────
 * 
 * ALTERNATIVE (MANUAL):
 * Create a folder named "icons/" inside the extension directory.
 * Add PNG files: icon16.png, icon32.png, icon48.png, icon128.png
 * 
 * You can use any icon editor or generate from the SVG below.
 * 
 * QUICK WORKAROUND:
 * The <svg> below can be pasted into any online SVG-to-PNG converter
 * (e.g., cloudconvert.com) at 16px, 32px, 48px, and 128px.
 * 
 * ICON SVG SOURCE:
 * <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
 *   <defs>
 *     <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
 *       <stop offset="0%" stop-color="#6366f1"/>
 *       <stop offset="100%" stop-color="#8b5cf6"/>
 *     </linearGradient>
 *   </defs>
 *   <rect width="128" height="128" rx="24" fill="url(#g)"/>
 *   <text x="64" y="88" font-size="72" text-anchor="middle" fill="white">🤖</text>
 * </svg>
 */
