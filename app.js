const fs = require('fs')
const winston = require('winston')

//Load environment
require('./env.js')

//Make required folders
if (!fs.existsSync('./log')) {
  fs.mkdirSync('./log')
}

//Configure logging
winston.add(winston.transports.File, {
  filename: 'log/ifpmon.log'
});
winston.remove(winston.transports.Console);

//Start the server
require('./src/server.js')
