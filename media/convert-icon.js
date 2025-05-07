const fs = require('fs');
const { exec } = require('child_process');

// Check if any conversion tools are available
function checkConversionTools() {
  return new Promise(resolve => {
    exec('which convert', (err, stdout) => {
      if (!err && stdout) {
        // ImageMagick is available
        resolve('imagemagick');
        return;
      }

      exec('which inkscape', (err, stdout) => {
        if (!err && stdout) {
          // Inkscape is available
          resolve('inkscape');
          return;
        }

        // No tools available
        resolve(null);
      });
    });
  });
}

// Create a simple HTML file that can be opened in a browser to save as PNG
function createHtmlExporter() {
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>DataMorph Icon Export</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      background-color: #f5f5f5;
    }
    h1 { margin-bottom: 30px; }
    .icon { margin-bottom: 20px; }
    .instructions {
      max-width: 600px;
      line-height: 1.5;
      background-color: #fff;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    ol { padding-left: 20px; }
    li { margin-bottom: 10px; }
  </style>
</head>
<body>
  <h1>DataMorph Icon Export</h1>
  <div class="icon">
    ${fs.readFileSync('./datamorph-icon.svg', 'utf-8')}
  </div>
  <div class="instructions">
    <h2>Instructions to save as PNG:</h2>
    <ol>
      <li>Right-click on the icon above and select "Save Image As..."</li>
      <li>Save the file as "datamorph-icon.png" in this same directory</li>
      <li>Make sure the image is saved at 128x128 pixels</li>
    </ol>
  </div>
</body>
</html>
  `;

  fs.writeFileSync('./icon-export.html', htmlContent);
  console.log('Created HTML export file at ./icon-export.html');
  console.log(
    'Please open this file in a browser and follow the instructions to save as PNG'
  );
}

async function convertToPng() {
  const tool = await checkConversionTools();

  if (tool === 'imagemagick') {
    console.log('Converting SVG to PNG using ImageMagick...');
    exec(
      'convert -background none -size 128x128 datamorph-icon.svg datamorph-icon.png',
      err => {
        if (err) {
          console.error('Error converting SVG to PNG:', err);
          createHtmlExporter();
        } else {
          console.log('Successfully created datamorph-icon.png');
        }
      }
    );
  } else if (tool === 'inkscape') {
    console.log('Converting SVG to PNG using Inkscape...');
    exec(
      'inkscape --export-filename=datamorph-icon.png -w 128 -h 128 datamorph-icon.svg',
      err => {
        if (err) {
          console.error('Error converting SVG to PNG:', err);
          createHtmlExporter();
        } else {
          console.log('Successfully created datamorph-icon.png');
        }
      }
    );
  } else {
    console.log('No SVG to PNG conversion tools found.');
    createHtmlExporter();
  }
}

// Start the conversion process
convertToPng();
