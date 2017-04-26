var express = require('express')
var basicAuth = require('express-basic-auth')
var bodyParser = require('body-parser')
var fs = require('fs')
var winston = require('winston')

var scraper = require('./scraper.js')
var monitor = require('./monitor.js')

var user = process.env['SECURE_USER']
var password = process.env['SECURE_PASSWORD']

var app = express()

//Use body-parser for messageIn
app.use('/messageIn', bodyParser.urlencoded({
  extended: true
}))

if(user && password) {
  winston.info("Authentication enabled with user: " + user )
  var config={}
  config[user] = password


  //Auto-inject authentication for 'messageIn'
  app.use('/messageIn', function(req,res,next) {
    req.headers['authorization'] = 'Basic ' + Buffer.from(user+':'+password).toString('base64')
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
if(process.env['HOST_PORT']) {
  port = process.env['HOST_PORT']
}

function getUnauthorizedResponse(req) {
  return req.auth ?
    ('Credentials for user ' + req.auth.user + ' rejected') :
    'No credentials provided'
}

app.get('/', function(req, res) {
  var send = []
  send.push(fs.readFileSync('head.html'))
  send.push(fs.readFileSync('nav.html'))
  if(monitor.getStats().started) {
    send.push("<a href='/stop' class='btn'>Stop</a><br>")
  } else {
    send.push("<a href='/start' class='btn'>Start</a><br>")
  }
  send.push("<hr>Monitoring: ")
  send.push(JSON.stringify(monitor.getStats().monitoredPlayers))
  res.send(send.join(''))
})

app.get('/monitor', function(req,res) {
  var send = []
  send.push(fs.readFileSync('head.html'))
  send.push(fs.readFileSync('nav.html'))
  var stats = monitor.getStats()
  send.push("<ul>")
  send.push("<li><b>Monitoring "+stats.monitoredPlayers.length + " players </b>")
  send.push("<li><b>Notifications Sent: </b>"+stats.notificationsSent)
  if(stats.started) {
    send.push("<li><b>Running for: </b>"+Math.round((Date.now() - stats.started)/1000/60) + " minutes")
  }
  send.push("</ul>")
  send.push("</hr>")
  // send.push(JSON.stringify(stats))
  res.send(send.join('\n'))
})

app.get('/setMonitorStatus/:name/:status', function(req, res) {
  monitor.setMonitorStatusForPlayer(req.params.name, JSON.parse(req.params.status))
  res.redirect('/players')
})

app.get('/log', function(req, res) {
  var send = []

  send.push(fs.readFileSync('head.html'))
  send.push(fs.readFileSync('nav.html'))

  send.push('<b>Notification Log</b><br><br>')

  var stats = monitor.getStats()

  stats.notificationLog.forEach(function(log) {
    send.push('<div class="well well-sm">'+log+'</div><br>')
  })

  res.send(send.join('\n'))
})

app.get('/players', function(req, res) {
  var send = []

  send.push(fs.readFileSync('head.html'))
  send.push(fs.readFileSync('nav.html'))

  send.push('<form method="GET" action="addPlayer">')
  send.push('<div class="col-xs-5">')
  send.push('NAME: <input type=text name="name">')
  send.push('</div><div class="col-xs-5">')
  send.push('NUMBER: <input type=text name="number">')
  send.push('</div><div class="col-xs-2">')
  send.push('<input type="submit" class="btn">')
  send.push('</div>')
  send.push('</form><br><hr>')

  var players = monitor.getMonitoredPlayers()
  Object.keys(players).forEach(function(player) {
    send.push('<div class="row">')
    send.push('<div class="col col-xs-3">')
    send.push(player)
    send.push('</div>')
    send.push('<div class="col col-xs-3">')
    send.push(players[player].number)
    send.push('</div>')
    send.push('<div class="col col-xs-6">')
    if(players[player].enabled) {
      send.push("<a href='/setMonitorStatus/" + encodeURIComponent(player) + "/false'>Disable</a>")
    } else {
      send.push("<a href='/setMonitorStatus/" + encodeURIComponent(player) + "/true'>Enable</a>")
    }
    send.push('</div>')
    send.push('</div>')
    send.push('<br>')
  })

  send.push('</body>')
  res.send(send.join('\n'))
})

app.get('/addPlayer', function(req,res) {
  try {
    monitor.addMonitoredPlayer(req.query.name, req.query.number)
  } catch (err) {
    res.send(err.message)
    return
  }
  res.redirect('/players')
})

app.get('/start', function(req,res) {
  winston.info("START called to monitor users")
  monitor.monitorStart()
  res.redirect('/')
  // res.send("Started<br><a href='/'>Home</a>")
})

app.get('/stop', function(req,res) {
  winston.info("STOP called to monitor users")
  monitor.monitorStop()
  res.redirect('/')
  // res.send("Stopped")
})


app.post('/messageIn', function(req, res) {
  /*
   if REMOVE track number and remove from monitor
     monitor.removeMonitorNumber(number)
   else monitor.playerSearch(req.body)
     none: respond with error
     > 5: indicate number of matches
     > 1: show list
     1: monitor.addMonitoredPlayer(name, number)
   */
  fs.writeFileSync('./messages/'+Date.now()+'.txt', JSON.stringify(req.body))
  var msg = req.body.Body
  var number = req.body.From
  if(!msg || msg.length < 4) {
    res.send("<Response><Message>\nInvalid request. Send 'REMOVE' or 'Player Name'\n</Message></Response>")
  } else if(msg.match(/^REMOVE/i)) {
    monitor.removeMonitorNumber(number).then(function(names) {
      if(names && names.length > 0) {
        res.send('<Response><Message>No longer monitoring: ' + names.join(' ') + '</Message></Response>')
      } else {
        res.send('<Response><Message>No players being monitored with number '+number+'</Message></Response>')
      }
    }).catch(function(err) {
      res.send('<Response><Message>Service error... admin has been notified.</Message></Response>')
      monitor.notifyAdmin("Error trying to remove notifications for " + number + ": " + err.message)
    })
  } else {
    monitor.playerSearch(msg).then(function(players) {
      if(!players || players.length <= 0) {
        monitor.notifyAdmin("From " + number + ": " + msg)
        res.send("<Response><Message>Your message has been forwarded to the administrator</Message></Response>")
        res.end()
      } else if (players.length > 5) {
        //Notify too many matches
        res.send("<Response><Message>Your search for "+msg+" produced " + players.length + " results, try again with a more specific name.</Message></Response>")
        res.end()
      } else if (players.length > 1) {
        res.send("<Response><Message>Your search for " + msg + " found " + players.join(", ") + " try again with a more specific name.</Message></Response>")
        res.end()
        //Notify multiple matches
      } else {
        //Subscribe
        var playerName = players[0]
        playerName = playerName.replace(/\s*\(..\)$/,'')
        monitor.addMonitoredPlayer(playerName, number).then(function() {
          res.send('<Response/>')
          res.end()
        }, function(err) {
          monitor.notifyAdmin(number + " message '"+msg+"' caused error: " + err.message)
          if(err.showUser) {
            res.send('<Response><Message>Error: '+err.message+'</Message></Response>')
          } else {
            res.send('<Response><Message>Service error... unable to subscribe at this time.</Message></Response>')
          }
        })
      }
    }, function(err) {
      winston.error("Error searching for players matching '"+msg+"': ", err)
      monitor.notifyAdmin(number + " message '"+msg+"' caused error: " + err.message)
      res.send('<Response><Message>Service error... unable to subscribe at this time.</Message></Response>')
      res.end()
    })
  }
})

app.listen(port)

winston.info("Program running, monitor currently stopped...")

exports = module.exports = app;
