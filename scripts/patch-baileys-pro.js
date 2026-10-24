import fs from 'node:fs';
import path from 'node:path';

const newsletterPath = path.join(
    process.cwd(),
    'node_modules',
    'baileys-pro',
    'lib',
    'Types',
    'Newsletter.js'
);

if (!fs.existsSync(newsletterPath)) {
    fs.writeFileSync(newsletterPath, '', 'utf8');
}