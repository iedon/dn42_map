// rollup.config.js

import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";
import copy from "rollup-plugin-copy";

export default {
  input: "src/index.js",
  output: {
    file: "dist/map.js",
    format: "esm",
    sourcemap: false,
  },
  plugins: [
    resolve(),
    commonjs(),
    terser({
      toplevel: true,
      ecma: 2016,
      sourceMap: false,
      mangle: {
        toplevel: true,
        module: true,
        eval: true
      }
    }),
    copy({
      targets: [
        { src: "src/flags", dest: "dist" },
        { src: "src/index.html", dest: "dist" }, // Copy index.html to dist folder for pack.js to inline
        { src: "src/style.css", dest: "dist" } // Copy CSS to dist folder for pack.js to inline
      ]
    })
  ],
};
