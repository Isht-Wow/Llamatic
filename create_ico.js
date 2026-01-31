const pngToIcoModule = require('png-to-ico');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const pngToIco = pngToIcoModule.default || pngToIcoModule;

const src = process.argv[2] || 'Llamatic.png';
const dest = process.argv[3] || 'Llamatic.ico';

if (!fs.existsSync(src)) {
    console.error(`Source not found: ${src}`);
    process.exit(1);
}

let buffer;
if (src.toLowerCase().endsWith('.png')) {
    buffer = fs.readFileSync(src);
} else {
    // Convert to PNG buffer using sips (Mac specific, but this is a Mac app)
    console.log(`Converting ${src} to PNG buffer...`);
    const tmpPng = `tmp_icon_${Date.now()}.png`;
    try {
        execSync(`sips -s format png "${src}" --out "${tmpPng}" > /dev/null`);
        buffer = fs.readFileSync(tmpPng);
        fs.unlinkSync(tmpPng);
    } catch (e) {
        console.error('Failed to convert image to PNG:', e);
        process.exit(1);
    }
}

pngToIco(buffer)
    .then(buf => {
        fs.writeFileSync(dest, buf);
        console.log(`Created ${dest} from ${src}`);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
