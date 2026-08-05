/**
 * Ambient module declaration for the side-effect `import '../global.css'` in
 * app/_layout.tsx. Metro (via NativeWind's metro plugin) resolves this at
 * bundle time; TypeScript just needs to know the specifier is valid.
 */
declare module '*.css';
