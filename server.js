var express = require('express')
var fs = require('fs')

var scraper = require('./scraper.js')
var monitor = require('./monitor.js')

var app = express()

var port = 8081
if(process.env['HOST_PORT']) {
  port = process.env['HOST_PORT']
}

app.get('/', function(req, res) {
  res.send("<a href='/monitor'>Monitor</a><br>" +
  "<a href='/start'>Start</a><br>" +
  "<a href='/stop'>Stop</a><br>" +
  "<hr>" +

  monitor.getStats()
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

exports = module.exports = app;
