import { promises as fs } from 'fs';
import { inlineSource } from 'inline-source';
import { minify } from 'html-minifier';

(async () => {
  try {
    // Read the original index.html file.
    const html = await fs.readFile('dist/index.html', 'utf8');

    // Inline external CSS and JS assets.
    // The 'inline' attribute in your HTML file marks assets to inline.
    const inlinedHtml = await inlineSource(html, {
      rootpath: './dist', // Base directory
      compress: false // We will minify later; you can set true if desired.
    });

    // Minify the resulting HTML, including inlined CSS and JS.
    const minifiedHtml = minify(inlinedHtml, {
      collapseWhitespace: true,
      removeComments: true,
      minifyCSS: true,
      minifyJS: false
    });

    // Write the final single-file HTML to a new location.
    await fs.writeFile('dist/index.html', minifiedHtml, { encoding: 'utf8', flag: 'w' });
    console.log("✅ Packed and minified successfully. Output artifact: dist/index.html");
  } catch (err) {
    console.error("Error during build:", err);
  }
})();
