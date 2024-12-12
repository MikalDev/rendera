import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import { writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { basename, join } from 'path';

// Plugin to generate .d.ts reference file
const dtsReferencePlugin = () => ({
  name: 'dts-reference',
  writeBundle: () => {
    const typesDir = './dist';
    
    // Ensure types directory exists
    if (!existsSync(typesDir)) {
      mkdirSync(typesDir);
    }

    const files = readdirSync(typesDir)
      .filter(file => file.endsWith('.d.ts'))
      .filter(file => file !== 'index.d.ts');

    const content = files.map(file => {
      const baseName = basename(file, '.d.ts');
      return [
        `/// <reference path="./${file}" />`,
        `export * from './${baseName}';`
      ].join('\n');
    }).join('\n\n');

    writeFileSync(join(typesDir, 'index.d.ts'), content);
    console.log('Generated index.d.ts');
  }
});

export default {
  input: 'src/main.ts',
  output: {
    file: 'dist/index.js',
    format: 'es',
    name: 'Rendra'
  },
  plugins: [
    resolve(),
    typescript({
      tsconfig: './tsconfig.json',
      declarationDir: './dist',
    }),
    dtsReferencePlugin()
  ]
};