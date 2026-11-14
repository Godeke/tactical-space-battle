import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await build({entryPoints:['client/main.tsx'],bundle:true,minify:true,format:'esm',target:'es2022',outfile:'dist/app.js',define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked'});
for(const file of ['index.html','style.css'])await copyFile(`client/${file}`,`dist/${file}`);
