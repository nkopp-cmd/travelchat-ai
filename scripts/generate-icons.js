/**
 * PWA Icon Generator
 *
 * This script generates PNG icons from the SVG source.
 * Run: node scripts/generate-icons.js
 *
 * Requirements: Install sharp first
 * npm install sharp --save-dev
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is available
let sharp;
try {
    sharp = require('sharp');
} catch {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                   PWA Icon Generation                          ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  To generate PNG icons from the SVG, install sharp:            ║
║                                                                ║
║    npm install sharp --save-dev                                ║
║                                                                ║
║  Then run this script again:                                   ║
║                                                                ║
║    node scripts/generate-icons.js                              ║
║                                                                ║
║  Alternatively, use an online tool like:                       ║
║  - https://realfavicongenerator.net/                          ║
║  - https://www.pwabuilder.com/imageGenerator                  ║
║                                                                ║
║  Upload: public/icons/icon.svg                                ║
║  Output sizes needed: 192x192, 512x512                        ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);
    process.exit(0);
}

const sizes = [192, 512];
const inputSvg = path.join(__dirname, '../public/icons/icon.svg');
const outputDir = path.join(__dirname, '../public/icons');

async function generateIcons() {
    console.log('Generating PWA icons...\n');

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Read SVG
    const svgBuffer = fs.readFileSync(inputSvg);

    for (const size of sizes) {
        const outputPath = path.join(outputDir, `icon-${size}x${size}.png`);

        await sharp(svgBuffer)
            .resize(size, size)
            .png()
            .toFile(outputPath);

        console.log(`✓ Generated ${size}x${size} icon`);
    }

    console.log('\n✅ All icons generated successfully!');
    console.log(`   Location: ${outputDir}`);
}

generateIcons().catch(err => {
    console.error('Error generating icons:', err);
    process.exit(1);
});
