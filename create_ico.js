const pngToIcoModule = require('png-to-ico');
const fs = require('fs');
const path = require('path');

// Handle default export from ES module
const pngToIco = pngToIcoModule.default || pngToIcoModule;

const pngPath = path.join(__dirname, 'Llamatic.png');
const pngBuffer = fs.readFileSync(pngPath);

pngToIco(pngBuffer)
    .then(buf => {
        fs.writeFileSync('Llamatic.ico', buf);
        console.log('Created Llamatic.ico');
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
