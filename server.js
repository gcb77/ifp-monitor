var express = require('express')
var basicAuth = require('express-basic-auth')
var fs = require('fs')

var scraper = require('./scraper.js')
var monitor = require('./monitor.js')

var user = process.env['SECURE_USER']
var password = process.env['SECURE_PASSWORD']

var app = express()
if(user && password) {
  console.log("Authentication enabled with user: " + user )
  var config={}
  config[user] = password
  app.use(basicAuth({
    users: config,
    challenge: true,
    realm: 'ifpMonitor1',
    unauthorizedResponse: getUnauthorizedResponse
  }))
} else {
  console.warn("No SECURE_USER or SECURE_PASSWORD provided, running with no authentication!")
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
  send.push("<a href='/monitor'>Server Status</a><br>")
  send.push("<a href='/players'>Players Monitored</a><br>")
  if(monitor.getStats().started) {
    send.push("<a href='/stop'>Stop</a><br>")
  } else {
    send.push("<a href='/start'>Start</a><br>")
  }
  send.push("<hr>Monitoring: ")
  send.push(JSON.stringify(monitor.getStats().monitoredPlayers))
  res.send(send.join(''))
})

app.get('/monitor', function(req,res) {
  res.send(monitor.getStats())
})

app.get('/setMonitorStatus/:name/:status', function(req, res) {
  monitor.setMonitorStatusForPlayer(req.params.name, JSON.parse(req.params.status))
  res.redirect('/players')
})

app.get('/players', function(req, res) {
  var retBuf = []

  retBuf.push('<a href="/">Home</a>')

  retBuf.push('<form method="GET" action="addPlayer">')
  retBuf.push('NAME: <input type=text name="name">')
  retBuf.push('NUMBER: <input type=text name="number">')
  retBuf.push('<input type="submit">')
  retBuf.push('</form>')

  var players = monitor.getMonitoredPlayers()
  Object.keys(players).forEach(function(player) {
    retBuf.push(player)
    if(players[player].enabled) {
      retBuf.push("<a href='/setMonitorStatus/" + encodeURIComponent(player) + "/false'>Disable</a>")
    } else {
      retBuf.push("<a href='/setMonitorStatus/" + encodeURIComponent(player) + "/true'>Enable</a>")
    }
    retBuf.push('<br>')
  })

  res.send(retBuf.join('\n'))
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
  monitor.monitorStart()
  res.send("Started<br><a href='/'>Home</a>")
})

app.get('/stop', function(req,res) {
  monitor.monitorStop()
  res.send("Stopped")
})

app.listen(port)

console.log("Running...")

exports = module.exports = app;
