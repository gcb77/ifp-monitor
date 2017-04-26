var winston = require('winston')

//Load environment
require('./env.js')

//Configure logging
winston.add(winston.transports.File, { filename: 'ifpmon.log' });
//winston.remove(winston.transports.Console);

//Star the server
require('./server.js')
