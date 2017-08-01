let express = require('express');
let app = express();
let spawn = require('child_process').spawn;
let ffmpeg = require('fluent-ffmpeg');
let fs = require('fs');
let crypto = require('crypto');

const config = require('./config.json');
const baseUrl = config.baseUrl;
const port = config.port;
const cameraName = config.cameraName;
const keyFileName = config.keyFileName;
const keyInfoFileName = config.keyInfoFileName;

// Create the camera output directory if it doesn't already exist
// Directory contains all of the streaming video files
if (fs.existsSync(cameraName) === false) {
  fs.mkdirSync(cameraName);
}

// Setup encryption
let keyFileContents = crypto.randomBytes(16);
let initializationVector = crypto.randomBytes(16).toString('hex');
let keyInfoFileContents = `${baseUrl}/${cameraName}/${keyFileName}\n./${cameraName}/${keyFileName}\n${initializationVector}`;

// Populate the encryption files, overwrite them if necessary
fs.writeFileSync(`./${cameraName}/${keyFileName}`, keyFileContents);
fs.writeFileSync(keyInfoFileName, keyInfoFileContents);

// Start the camera stream
// Have to do a smaller size otherwise FPS takes a massive hit :(
let cameraStream = spawn('raspivid', ['-o', '-', '-t', '0', '-vf', '-fps', '30']);

// Convert the camera stream to hls
let conversion = new ffmpeg(cameraStream.stdout).noAudio().format('hls').inputOptions('-re').outputOptions(['-vcodec copy', '-g 50', '-hls_wrap 20', `-hls_key_info_file ${keyInfoFileName}`]).output(`${cameraName}/livestream.m3u8`);

// Set up listeners
conversion.on('error', function(err, stdout, stderr) {
  console.log('Cannot process video: ' + err.message);
});

conversion.on('start', function(commandLine) {
  console.log('Spawned Ffmpeg with command: ' + commandLine);
});

conversion.on('stderr', function(stderrLine) {
  console.log('Stderr output: ' + stderrLine);
});

// Start the conversion
conversion.run();

// Allows CORS
let setHeaders = (res, path) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
};

// Set up a fileserver for the streaming video files
app.use(`/${cameraName}`, express.static(cameraName, {'setHeaders': setHeaders}));

console.log(`STARTING CAMERA STREAM SERVER AT PORT ${port}`);
app.listen(port);
