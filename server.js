var express = require('express')
var fs = require('fs')

var scraper = require('./scraper.js')
var monitor = require('./monitor.js')

var app = express()

app.get('/', function(req, res) {

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


app.listen('8081')

exports = module.exports = app;
