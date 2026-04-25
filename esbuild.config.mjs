import esbuild from 'esbuild';

esbuild.build({
  entryPoints: ['./main.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: './main.js',
  external: [], // Bundle everything, including cron-parser
  sourcemap: true,
  target: 'node18',
}).catch(() => process.exit(1));
