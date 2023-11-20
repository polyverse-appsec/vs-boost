const { execSync } = require('child_process');

const maximumPackageSize = 3.0;

// Run the vsce package command and capture the output
const output = execSync('vsce package --allow-missing-repository --baseContentUrl "https://polyverse.com" --baseImagesUrl "https://polyverse.com/images" --out ./out/').toString();

console.log(output);  // Print the original output

// Extract the size of the package from the output
const match = output.match(/(\d+\.\d+)MB/);
if (match && match[1]) {
    const size = parseFloat(match[1]);
    const maxSize = maximumPackageSize; // The maximum allowable size
    if (size > maxSize) {
        console.error(`\x1b[31mERROR: Package size exceeds the threshold: (${size}MB > ${maxSize}MB)\n` +
        'Check package contents for unexpected files.\n' + 
        'Or increase maximum threshold size in build script.\x1b[0m');
        process.exit(1); // Fail the process
    }
} else {
    console.error('\x1b[31mFailed to determine package size from vsce output.\x1b[0m');
    process.exit(1); // Fail the process because of inability to parse the size
}
