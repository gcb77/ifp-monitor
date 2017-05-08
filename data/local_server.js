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
  console.log("LOCAL SERVER: received player query for " + req.body)
  res.send(fs.readFileSync('./users_sample_data.txt'))
  res.end()
})

app.listen(port)

exports = module.exports = app;
