var express = require('express')
var basicAuth = require('express-basic-auth')
var bodyParser = require('body-parser')
var fs = require('fs')
var winston = require('winston')
var debug = require('debug')('ifp-monitor:main')

var monitor = require('./monitor.js')

var user = process.env['SECURE_USER']
var password = process.env['SECURE_PASSWORD']

const dataStore = require('./dataStore')

//Keep track of text messages received
let receivedMessages = dataStore.getDatastore('receivedMessages');


var app = express()

app.set('view engine', 'ejs')

//Use body-parser for messageIn
app.use(['/messageIn', '/setRegistrationResponse'], bodyParser.urlencoded({
  extended: true
}))

if (user && password) {
  winston.info("Authentication enabled with user: " + user)
  var config = {}
  config[user] = password


  //Auto-inject authentication for 'messageIn'
  app.use('/messageIn', function (req, res, next) {
    req.headers['authorization'] = 'Basic ' + Buffer.from(user + ':' + password).toString('base64')
    next()
  })

  app.use(basicAuth({
    users: config,
    challenge: true,
    realm: 'ifpMonitor1',
    unauthorizedResponse: getUnauthorizedResponse
  }))
} else {
  winston.warn("No SECURE_USER or SECURE_PASSWORD provided, running with no authentication!")
}

var port = 8080
if (process.env['HOST_PORT']) {
  port = process.env['HOST_PORT']
}

function getUnauthorizedResponse(req) {
  return req.auth ?
    ('Credentials for user ' + req.auth.user + ' rejected') :
    'No credentials provided'
}

app.get('/', function (req, res) {
  debug('Request for /')
  var send = []
  res.render('main', {
    started: monitor.getStats().started,
    monitorCount: monitor.getStats().monitoredPlayers.length,
    canArchive: !monitor.getStats().started && fs.existsSync('db/notifications.json'),
    registerResponse: monitor.getRegistrationResponse()
  })

})

app.post('/setRegistrationResponse', function (req, res) {
  debug('Request for /setRegistrationResponse: ' + req.body.message)
  monitor.setRegistrationResponse(req.body.message)
  res.redirect('/')
})

app.get('/monitor', function (req, res) {
  debug('Request for /monitor')
  res.render('stats', {
    stats: monitor.getStats()
  })
})

app.get('/setMonitorStatus/:number/:status', function (req, res) {
  debug('Request for /setMonitorStatus for ' + req.params)
  monitor.setMonitorStatusForPlayer(req.params.number, JSON.parse(req.params.status))
  res.redirect('/players')
})

app.get('/remove/:number', function (req, res) {
  debug('Request for /remove for ' + req.params.number)
  monitor.removeMonitorNumber(req.params.number)
  res.redirect('/players')
})

app.get('/log', function (req, res) {
  debug('Request for /log')
  let log = monitor.getStats().notificationLog
  let notifications = log ? log.reverse() : []
  debug("Notifications: ", notifications)
  res.render('log', { notifications })
})

app.get('/players', function (req, res) {
  debug('Request for /players')

  let players = monitor.getMonitoredPlayers()
  let stats = monitor.getStats()

  let sendPlayers = []

  Object.keys(players).forEach(function (number) {
    let o = {
      names: players[number].names,
      number: number,
      enabled: players[number].enabled
    }
    if (stats.notificationsPerNumber[number]) {
      o.notifications = stats.notificationsPerNumber[number]
    }
    sendPlayers.push(o)
  })
  res.render('players', { players: sendPlayers })
})

app.get('/addPlayer', function (req, res) {
  debug('Request for /addPlayer : ', req.query)
  let number = req.query.number
  number = number.replace('+1', '')
  number = number.replace(/\s*/g, '')
  number = number.replace('(', '')
  number = number.replace(')', '')
  monitor.addMonitoredPlayer(req.query.name, number).then(function () {
    res.redirect('/players')
  }, function (err) {
    res.send(err.message)
  })
})

app.get('/start', function (req, res) {
  debug('Request for /start')
  winston.info("START called to monitor users")
  monitor.monitorStart()
  res.redirect('/')
  // res.send("Started<br><a href='/'>Home</a>")
})

app.get('/stop', function (req, res) {
  debug('Request for /stop')
  winston.info("STOP called to monitor users")
  monitor.monitorStop()
  res.redirect('/')
  // res.send("Stopped")
})

app.get('/archive', function (req, res) {
  debug('Request for /archive')
  winston.info("ARCHIVE called")
  monitor.archiveTournament()
  res.redirect('/')
})

app.post('/messageIn', function (req, res) {
  debug('Received SMS message')
  debug('SMS message body: ', req.body)
  /*
   if REMOVE track number and remove from monitor
     monitor.removeMonitorNumber(number)
   else monitor.playerSearch(req.body)
     none: respond with error
     > 5: indicate number of matches
     > 1: show list
     1: monitor.addMonitoredPlayer(name, number)
   */

  //Save the incoming text message for later auditing
  receivedMessages.insert({
    time: Date.now(),
    body: req.body
  })
  var msg = req.body.Body
  var number = req.body.From

  if (!number || !msg) {
    res.send('<Response><Message>Invalid Request</Message></Response>')
  }

  //Remove whitespace before and after the message
  if (msg) {
    msg = msg.trim()
  }

  number = number.replace('+1', '')
  number = number.replace(/\s*/g, '')
  number = number.replace('(', '')
  number = number.replace(')', '')
 
  if (!msg || msg.length < 4) {
    res.send("<Response><Message>\nInvalid request. Send 'REMOVE' or 'Player Name'\n</Message></Response>")
  } else if (msg.match(/^REMOVE/i)) {
    monitor.removeMonitorNumber(number).then(function (names) {
      if (names && names.length > 0) {
        res.send('<Response><Message/></Response>')
      } else {
        res.send('<Response><Message>No players being monitored with number ' + number + '</Message></Response>')
      }
    }).catch(function (err) {
      res.send('<Response><Message>Service error... admin has been notified.</Message></Response>')
      monitor.notifyAdmin("Error trying to remove notifications for " + number + ": " + err.message)
    })
  } else if(monitor.getMonitoredPlayers()[number] && monitor.getMonitoredPlayers()[number].names && monitor.getMonitoredPlayers()[number].names.length === 1) {
    res.send(`<Response><Message>\nYou are currently monitoring ${monitor.getMonitoredPlayers()[number].names}.  This application supports monitoring for only one person per number.  Send a message of REMOVE if you want to reset and monitor someone else.\n</Message></Response>`)
  } else {
    monitor.playerSearch(msg).then(function (players) {
      if (!players || players.length <= 0) {
        monitor.notifyAdmin("From " + number + " Not Found : " + msg)
        res.send("<Response><Message>Your message could not be matched to a player in the IFP system, please verify the name and try again.</Message></Response>")
        res.end()
      } else if (players.length > 5) {
        //Notify too many matches
        res.send("<Response><Message>Your search for " + msg + " produced " + players.length + " results, try again with a more specific name.</Message></Response>")
        res.end()
      } else if (players.length > 1) {
        res.send("<Response><Message>Your search for " + msg + " found " + players.join(", ") + " try again with a more specific name.</Message></Response>")
        res.end()
        //Notify multiple matches
      } else {
        //Subscribe
        var playerName = players[0]
        monitor.addMonitoredPlayer(playerName, number).then(function () {
          res.send('<Response/>')
          res.end()
        }, function (err) {
          winston.warn("Message: " + msg + " caused error " + err.message)
          monitor.notifyAdmin(number + " message '" + msg + "' caused error: " + err.message)
          if (err.showUser) {
            res.send('<Response><Message>Error: ' + err.message + '</Message></Response>')
          } else {
            res.send('<Response><Message>Service error... unable to subscribe at this time.</Message></Response>')
          }
        })
      }
    }, function (err) {
      winston.error("Error searching for players matching '" + msg + "': ", err)
      monitor.notifyAdmin(number + " message '" + msg + "' caused error: " + err.message)
      res.send('<Response><Message>Service error... unable to subscribe at this time.</Message></Response>')
      res.end()
    })
  }
})

app.get('/playerDb', function (req, res) {
  debug('Request for playerDb')
 var send = []

  var monitoredPlayers = monitor.getMonitoredPlayers()
  var playerNames = Object.keys(monitoredPlayers)

  monitor.getPlayerDb().then(function (data) {
  res.render('playerDb', {
    data,
    playerNames
  })}, function (err) {
    winston.error("Failed to query player database: ", err)
    res.send('ERROR!')
  })
})

app.listen(port)

winston.info("Program running on " + port + ", monitor currently stopped...")
console.log("Program running on " + port + ", monitor currently stopped...")

winston.info("Starting up")
console.log("Started!")
monitor.monitorStart()

exports = module.exports = app;
