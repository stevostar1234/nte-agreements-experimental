import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const directory=new URL('../tests/',import.meta.url);
const files=fs.readdirSync(directory).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>fileURLToPath(new URL(name,directory)));
if(!files.length)throw new Error('No test files found.');
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status ?? 1);
