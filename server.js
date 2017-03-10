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
  res.send("<a href='/monitor'>Monitor</a><br>" +
  "<a href='/start'>Start</a><br>" +
  "<a href='/stop'>Stop</a><br>" +
  "<hr>Monitoring: " +

  JSON.stringify(monitor.getStats().monitoredPlayers)
  )
})

app.get('/monitor', function(req,res) {
  res.send(monitor.getStats())
})

app.get('/addPlayer/:name/:number', function(req,res) {
  monitor.addMonitoredPlayer(req.params.name, req.params.number)
  res.send(monitor.getStats().monitoredPlayers)
})

app.get('/start', function(req,res) {
  monitor.monitorStart()
  res.send("Started")
})

app.get('/stop', function(req,res) {
  monitor.monitorStop()
  res.send("Stopped")
})

app.listen(port)

console.log("Running...")

exports = module.exports = app;
