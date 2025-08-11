import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/workers/AnimationWorker.ts',
  output: {
    file: 'dist/workers/AnimationWorker.js',
    format: 'iife',
    name: 'AnimationWorker',
    intro: '(function() {',
    outro: '})();'
  },
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.worker.json',
      compilerOptions: {
        declaration: false,
        declarationMap: false
      }
    })
  ]
};