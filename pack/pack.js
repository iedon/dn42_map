const fs = require('fs');
const inlineSource = require('inline-source');
const { minify } = require('html-minifier');

(async () => {
  try {
    // Read the original index.html file.
    const html = fs.readFileSync('index.html', 'utf8');

    // Inline external CSS and JS assets.
    // The 'inline' attribute in your HTML file marks assets to inline.
    const inlinedHtml = await inlineSource.inlineSource(html, {
      rootpath: '.', // Base directory
      compress: false      // We will minify later; you can set true if desired.
    });

    // Minify the resulting HTML, including inlined CSS and JS.
    const minifiedHtml = minify(inlinedHtml, {
      collapseWhitespace: true,
      removeComments: true,
      minifyCSS: true,
      minifyJS: true
    });

    // Write the final single-file HTML to a new location.
    fs.writeFileSync('dist/index.html', minifiedHtml);
    console.log("Packed and minified successfully.");
  } catch (err) {
    console.error("Error during build:", err);
  }
})();
