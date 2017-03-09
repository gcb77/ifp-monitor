var request = require('request')
var sms = require('./sms.js')
var scraper = require('./scraper.js')

var fs = require('fs')

var url = 'http://ifp.everguide.com/commander/tour/public/MatchList.aspx'
var adminNumber = process.env['ADMIN_NUMBER']

var monitoredPlayers = {}
var notifiedPlayers = {}
var monitorInterval = undefined
var notifiedProblems = false
var monitoringInterval = 30000

var stats = {
  monitoredPlayers: [],
  notificationsSent: 0
}

function addMonitoredPlayer(name, number) {
  sms.sendMessage(adminNumber, "Added " + name + " to monitor, sending notifications to " + number)
  monitoredPlayers[name] = {
    number: number
  }
  stats.monitoredPlayers = Object.keys(monitoredPlayers)
}

function monitorFunction() {

  //Only run if there are players to monitor
  if(Object.keys(monitoredPlayers).length > 0) {

    //Make request to page
    request(url, function (err, response, html) {

      //Check return status
      if (!err && response.statusCode == 200) {
        // console.log(html)

        //For testing
        // html = fs.readFileSync('data/test1.html')

        //Find the matches we are interested in
        var currentMatches = scraper.findMatches(html)
        stats.currentMatches = currentMatches
        // console.log(currentMatches.length + " matches in progress")
        // console.log("Current matches: " + currentMatches)
        var players = scraper.findPlayers(currentMatches, Object.keys(monitoredPlayers))
        // console.log("Players: " + JSON.stringify(players))

        //Notify each player
        Object.keys(players).forEach(function(player) {
          var match = players[player]
          //Make a unique key for this notification so we don't repeat it: player, event, team1 and team2
          var key = player+'_'+match.event+'_'+match.team1+'_'+match.team2
          if(notifiedPlayers[key]) {
            // console.log("Already notified: " + key)
          } else {
            notifiedPlayers[key] = true
            var message = "Table " + match.table + " " + match.event + " " + match.team1 + " vs " + match.team2
            console.log(new Date() + " notifying " + player + "(" + monitoredPlayers[player].number+") " + message)
            sms.sendMessage(monitoredPlayers[player].number, message)
            stats.notificationsSent += 1
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
  stats.started = Date.now()
  stats.stopped = undefined
  monitorInterval = setInterval(monitorFunction, monitoringInterval)
}

function monitorStop() {
  stats.stopped = Date.now()
  if(monitorInterval) {
    clearInterval(monitorInterval)
  }
  monitorInterval = undefined
}

function getStats() {
  return stats
}

module.exports = {
  addMonitoredPlayer: addMonitoredPlayer,
  monitorStart: monitorStart,
  monitorStop: monitorStop,
  getStats: getStats
}
