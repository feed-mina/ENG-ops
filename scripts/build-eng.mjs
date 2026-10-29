import {mkdir,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'dist','eng');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const file of ['index.html','styles.css','app.js'])await copyFile(path.join(root,'apps','construction',file),path.join(out,file));
await copyFile(path.join(root,'packages','construction','conditions.js'),path.join(out,'conditions.js'));
console.log('Built ENG-ops: 4 static assets, no API/D1/service binding or personal data.');
