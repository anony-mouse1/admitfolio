// pdfjs-dist's package.json points "types" at the package root and has no
// "exports" map, so a deep import into build/ resolves to raw JS and would come
// back implicitly `any` under strict mode. Re-export the package's own types
// under the subpath specifier we actually import.
//
// See the comment in components/EssayReader.tsx for why the reader imports the
// minified build rather than the bare package.
declare module 'pdfjs-dist/build/pdf.min.mjs' {
  export * from 'pdfjs-dist';
}
