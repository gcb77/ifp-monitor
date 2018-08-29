var express = require('express')

var app = express()
var port = 8082

var fs = require('fs')

app.get('/commander/tour/public/MatchList.aspx', function(req, res) {
  console.log("LOCAL SERVER: returning match page test2")
  res.send(fs.readFileSync('./test2.html'))
  res.end()
})

app.get('/commander/internal/ComboStreamer.aspx', function(req, res) {
  console.log("LOCAL SERVER: received player query, sending canned message from ./users_sample_data.txt")
  res.send(fs.readFileSync('./users_sample_data.txt'))
  res.end()
})

app.get('/commander/tour/public/welcome.aspx', function(req, res) {
  console.log("LOCAL SERVER: received welcome query, sending canned message form welcome.html")
  res.send(fs.readFileSync('./welcome.html'))
  res.end()
})

app.listen(port)

exports = module.exports = app;
