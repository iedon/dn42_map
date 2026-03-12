import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { minify } from 'html-minifier';

const dist = 'dist';
let html = readFileSync(resolve(dist, 'index.html'), 'utf8');

// Inline all <link rel="stylesheet" href="...">
html = html.replace(/<link\s[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi, (_, href) => {
  const css = readFileSync(resolve(dist, href.replace(/^\//, '')), 'utf8');
  return `<style>${css}</style>`;
});

// Inline all <script ... src="..."></script>
html = html.replace(/<script\s[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi, (tag, src) => {
  const js = readFileSync(resolve(dist, src.replace(/^\//, '')), 'utf8');
  const type = tag.includes('type="module"') ? ' type="module"' : '';
  return `<script${type}>${js}<\/script>`;
});

// Minify the resulting HTML, including inlined CSS and JS.
html = minify(html, {
  collapseWhitespace: true,
  removeComments: true,
  minifyCSS: true,
  minifyJS: true
});

writeFileSync(resolve(dist, 'index.html'), html, 'utf8');

// Remove inlined asset files
for (const f of readdirSync(resolve(dist, 'assets'))) {
  if (f.endsWith('.js') || f.endsWith('.css')) {
    unlinkSync(resolve(dist, 'assets', f));
  }
}

console.log('✅ Packed and minified successfully. Output: dist/index.html (' + Math.round(html.length / 1024) + ' KB)');
