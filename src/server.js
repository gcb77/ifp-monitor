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

var port = 8081
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
  send.push(fs.readFileSync('views/head.html'))
  send.push(fs.readFileSync('views/nav.html'))
  if (monitor.getStats().started) {
    send.push("<a href='/stop' class='btn btn-danger'>Stop</a><br>")
  } else {
    send.push("<a href='/start' class='btn btn-success'>Start</a><br>")
  }
  send.push("<hr>Monitoring: ")
  send.push(JSON.stringify(monitor.getStats().monitoredPlayers.length))
  send.push(" players")

  send.push('<hr>')
  send.push('<form method="POST" action="/setRegistrationResponse">')
  send.push('<div class="row">')

  send.push('<div class="col col-sm-8">')
  // send.push('<textarea name="message" style="width: 100%" rows="5">')
  send.push('<input type="text" style="width: 100%" name="message" value="')
  send.push(monitor.getRegistrationResponse())
  send.push('">')
  // send.push('</textarea>')
  send.push('</div>')

  send.push('<div class="col col-sm-4">')
  send.push('<input type="submit" class="btn btn-primary" value="Update">')
  send.push('</div>')

  send.push('</div>')

  if (!monitor.getStats().started && fs.existsSync('db/notifications.json')) {
    send.push("<hr><a href='/archive' class='btn btn-warning'>Archive</a><br>")
  }
  send.push('</form>')
  res.send(send.join(''))
})

app.post('/setRegistrationResponse', function (req, res) {
  debug('Request for /setRegistrationResponse: ' + req.body.message)
  monitor.setRegistrationResponse(req.body.message)
  res.redirect('/')
})

app.get('/monitor', function (req, res) {
  debug('Request for /monitor')
  var send = []
  send.push(fs.readFileSync('views/head.html'))
  send.push(fs.readFileSync('views/nav.html'))
  var stats = monitor.getStats()
  send.push("<ul>")
  send.push("<li><b>Monitoring " + stats.monitoredPlayers.length + " players </b>")
  send.push("<li><b>Notifications Sent: </b>" + stats.notificationsSent)
  if (stats.started) {
    send.push("<li><b>Running for: </b>" + Math.round((Date.now() - stats.started) / 1000 / 60) + " minutes")
  }
  send.push("</ul>")
  send.push("</hr>")
  // send.push(JSON.stringify(stats))
  res.send(send.join('\n'))
})

app.get('/setMonitorStatus/:name/:status', function (req, res) {
  debug('Request for /setMonitorStatus for ' + req.params)
  monitor.setMonitorStatusForPlayer(req.params.name, JSON.parse(req.params.status))
  res.redirect('/players')
})

app.get('/remove/:number', function (req, res) {
  debug('Request for /remove for ' + req.params.number)
  monitor.removeMonitorNumber(req.params.number)
  res.redirect('/players')
})

app.get('/log', function (req, res) {
  debug('Request for /log')
  var send = []

  send.push(fs.readFileSync('views/head.html'))
  send.push(fs.readFileSync('views/nav.html'))

  send.push('<b>Notification Log</b><br><br>')

  var stats = monitor.getStats()

  //Show last 100 notifications in reverse order
  send.push('<div class="list-group">')
  var len = stats.notificationLog.length
  for (var i = 1; i < 100; i += 1) {
    if (len - i >= 0) {
      send.push('<div class="list-item">' + stats.notificationLog[len - i] + '</div><br>')
    }
  }
  send.push('</div>')

  res.send(send.join('\n'))
})

app.get('/players', function (req, res) {
  debug('Request for /players')
  var send = []

  send.push(fs.readFileSync('views/head.html'))
  send.push(fs.readFileSync('views/nav.html'))

  send.push('<form method="GET" action="addPlayer">')
  send.push('  <div class="form-inline">')
  send.push('    <div class="form-group">')
  send.push('      <div class="col-sm-5 text-nowrap">')
  send.push('NAME: <input type=text name="name">')
  send.push('      </div><div class="col-sm-5 text-nowrap">')
  send.push('NUMBER: <input type=text name="number">')
  send.push('      </div><div class="col-sm-2">')
  send.push('<input type="submit" value="Add" class="btn btn-primary"/>')
  send.push('      </div>')
  send.push('    </div>')
  send.push('  </div>')
  send.push('</form><br><hr>')

  let players = monitor.getMonitoredPlayers()
  let stats = monitor.getStats()

  Object.keys(players).forEach(function (player) {
    send.push('<div class="row">')
    send.push('<div class="col col-xs-3">')
    send.push(player)
    if (stats.notificationsPerPlayer[player]) {
      send.push('<span class="badge">' + stats.notificationsPerPlayer[player] + '</span>')
    }
    send.push('</div>')
    send.push('<div class="col col-xs-3">')
    send.push(players[player].number)
    send.push('</div>')
    send.push('<div class="col col-xs-3">')
    if (players[player].enabled) {
      send.push("<a href='/setMonitorStatus/" + encodeURIComponent(player) + "/false'><span class='glyphicon glyphicon-stop'></span> </a>")
    } else {
      send.push("<a href='/setMonitorStatus/" + encodeURIComponent(player) + "/true'><span class='glyphicon glyphicon-play'></span></a>")
    }
    send.push('</div>')
    send.push('<div class="col col-xs-3">')
    send.push("<a href='/remove/" + encodeURIComponent(players[player].number) + "'><span class='glyphicon glyphicon-remove'></span> </a>")
    send.push('</div>')
    send.push('</div>')
    send.push('<br>')
  })

  send.push('</body>')
  res.send(send.join('\n'))
})

app.get('/addPlayer', function (req, res) {
  debug('Request for /addPlayer : ', req.query)
  monitor.addMonitoredPlayer(req.query.name, req.query.number).then(function () {
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

  send.push(fs.readFileSync('views/head.html'))
  send.push(fs.readFileSync('views/nav.html'))

  var monitoredPlayers = monitor.getMonitoredPlayers()
  var playerNames = Object.keys(monitoredPlayers)

  monitor.getPlayerDb().then(function (data) {
    send.push("<div class='list-group'>")
    data.forEach(function (player) {
      send.push("<div class='list-group-item row'>")

      send.push(" <div class='col col-xs-4'>")
      send.push(player.name)
      send.push(" </div>")

      send.push(" <div class='col col-xs-4'>")
      send.push(player.number)
      send.push(" </div>")

      send.push(" <div class='col col-xs-4'>")
      if (!playerNames.includes(player.name)) {
        send.push(
          "<a href='/addPlayer?name=" +
          encodeURIComponent(player.name) +
          "&number=" +
          encodeURIComponent(player.number) +
          "'><span class='glyphicon glyphicon-plus'></span> </a>")
      }
      if (player.beingMonitored) {
        send.push("<span class='glyphicon glyphicon-eye-open'>&nbsp</span>")
      }
      if (player.inTournament) {
        send.push("<span class='glyphicon glyphicon-tower'>&nbsp</span>")
      }
      send.push(" </div>")

      send.push("</div>")
    })
    send.push("</div>")
    res.send(send.join(''))
    res.end()
  }, function (err) {
    winston.error("Failed to query player database: ", err)
    send.push('ERROR!')
    res.send(send.join(''))
    res.end()
  })
})

app.listen(port)

winston.info("Program running on " + port + ", monitor currently stopped...")
console.log("Program running on " + port + ", monitor currently stopped...")

exports = module.exports = app;
