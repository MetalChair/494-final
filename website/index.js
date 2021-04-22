const SerialPort = require('serialport');
const WebSocket = require('ws');
const path = require('path');
const express = require('express')
const app = express()
const port = 3000
const server = app.listen(port);
const open = require("open");
const wsServer = new WebSocket.Server({
  server: server
});
app.use(express.static("assets"));

let duinoPort;
let sockets = [];

//Defintions for websocket listener
wsServer.on('connection', function(socket) {
  sockets.push(socket);

  // When you receive a message, send that message to every socket.
  socket.on('message', function(msg) {
    sockets.forEach(s => s.send(msg));
  });

  // When a socket closes, or disconnects, remove it from the array.
  socket.on('close', function() {
    sockets = sockets.filter(s => s !== socket);
  });
});

//Definitions for express api
app.get('/*', (req, res) => res.sendFile( path.join(__dirname, "/index.html")));


//Defintions for serial getter
//Finds and returns the path of the port with
// an Arduino board. This is usally consistent accross most systems but is
// imperfect
async function getArduinoPort() {
    const list = await SerialPort.list();
    const path = list.find(element => element.manufacturer.indexOf("Arduino") != -1);
    return path.path || null;
}

//Write all data to our sockets
function onSerialData(data){
    sockets.forEach(s => {
        s.send(data.toString());
    });
}

//Sets up arduino board for serial listening
async function setupSerial(){
   var path =  await getArduinoPort().catch(() =>{
     console.warn("No serial devices found")
     process.exit()
   });
   if(!path){
       console.warn("Could not find Arduino device");
       process.exit();
   }
   console.log("Arduino is at:", path)
   //open serial port to arduino
   duinoPort = new SerialPort(path, {baudRate: 115200});
   duinoPort.on('data', onSerialData);
    open("http://localhost:3000");
}
setupSerial();
console.log('Websocket server listening at port 3000')
