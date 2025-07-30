import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'node_modules/gl-matrix/esm/index.js',
  output: {
    file: 'src/gl-matrix.js',
    format: 'es'
  },
  plugins: [
    resolve()
  ]
};