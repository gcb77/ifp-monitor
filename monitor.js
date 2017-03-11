var request = require('request')
var sms = require('./sms.js')
var scraper = require('./scraper.js')

var fs = require('fs')

var url = 'http://ifp.everguide.com/commander/tour/public/MatchList.aspx'
var adminNumber = process.env['ADMIN_NUMBER']

var serverData = {
  monitoredPlayers: {},
  notifiedPlayers: {}
}

var monitorInterval = undefined
var notifiedProblems = false
var monitoringInterval = 30000

var stats = {
  monitoredPlayers: [],
  notificationsSent: 0
}

function monitorStatus(name, status) {
  if(serverData.monitoredPlayers[name]) {
    serverData.monitoredPlayers[name].enabled = status
  }
  fs.writeFileSync('./.players', JSON.stringify(serverData.monitoredPlayers))
}

function addMonitoredPlayer(name, number) {
  if(!stats.started) {
    throw new Error("Not Started!<br><a href='/'>Back</a>")
  }
  sms.sendMessage(adminNumber, "Added " + name + " to monitor, sending notifications to " + number)
  serverData.monitoredPlayers[name] = {
    number: number,
    enabled: true
  }
  fs.writeFileSync('./.players', JSON.stringify(serverData.monitoredPlayers))
  stats.monitoredPlayers = Object.keys(serverData.monitoredPlayers)
}

function monitorFunction() {

  //Only run if there are players to monitor
  if(Object.keys(serverData.monitoredPlayers).length > 0) {

    //Make request to page
    request(url, function (err, response, html) {

      //Check return status
      if (!err && response.statusCode == 200) {
        // console.log(html)

        //For testing
        html = fs.readFileSync('data/test2.html')

        //Find the matches we are interested in
        var currentMatches = scraper.findMatches(html)
        stats.currentMatches = currentMatches
        // console.log(currentMatches.length + " matches in progress")
        // console.log("Current matches: " + currentMatches)
        var players = scraper.findPlayers(currentMatches, Object.keys(serverData.monitoredPlayers))
        // console.log("Players: " + JSON.stringify(players))

        //Notify each player
        Object.keys(players).forEach(function(player) {
          var match = players[player]
          //Make a unique key for this notification so we don't repeat it: player, event, team1 and team2
          var key = player+'_'+match.event+'_'+match.team1+'_'+match.team2+'_'+match.forPosition
          if(serverData.notifiedPlayers[key]) {
            // console.log("Already notified: " + key)
          } else {
            serverData.notifiedPlayers[key] = true
            var message = "Table " + match.table + " " + match.event + " " + match.team1 + " vs " + match.team2 + ' for ' + match.forPosition
            if(serverData.monitoredPlayers[player].enabled) {
              console.log(new Date() + " notifying " + player + "(" + serverData.monitoredPlayers[player].number + ") " + message)
              sms.sendMessage(serverData.monitoredPlayers[player].number, message)
              stats.notificationsSent += 1
            } else {
              console.log("Player " + player + " is disabled, not sending notification")
            }
            fs.writeFileSync('./.notifications', JSON.stringify(serverData.notifiedPlayers))
          }
        })
      } else {
        if (!notifiedProblems) {
          sms.sendMessage(adminNumber, 'Request failed')
          notifiedProblems = true
        }
      }
    })
  } else {
    console.log("No players to monitor...")
  }
}

function monitorStart() {
  if(monitorInterval) {
    return
  }
  try {
    var savedPlayers = fs.readFileSync('./.players')
    serverData.monitoredPlayers = JSON.parse(savedPlayers)
    console.log("Monitoring: " + JSON.stringify(serverData.monitoredPlayers))
    stats.monitoredPlayers = Object.keys(serverData.monitoredPlayers)
  } catch(err) { }

  try {
    var notifications = fs.readFileSync('./.notifications')
    serverData.notifiedPlayers = JSON.parse(notifications)
  } catch(err) { }

  stats.started = Date.now()
  stats.stopped = undefined
  monitorInterval = setInterval(monitorFunction, monitoringInterval)
}

function monitorStop() {
  delete stats.started
  stats.stopped = Date.now()
  if(monitorInterval) {
    clearInterval(monitorInterval)
  }
  monitorInterval = undefined
}

function getStats() {
  return stats
}

function getMonitoredPlayers() {
  return serverData.monitoredPlayers
}

module.exports = {
  addMonitoredPlayer: addMonitoredPlayer,
  monitorStart: monitorStart,
  monitorStop: monitorStop,
  getStats: getStats,
  getMonitoredPlayers: getMonitoredPlayers,
  setMonitorStatusForPlayer: monitorStatus
}
