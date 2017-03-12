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
  notificationsSent: 0,
  notificationLog: []
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

  //Send message to admin
  sms.sendMessage(adminNumber, "Added " + name + " to monitor, sending notifications to " + number)

  //Send message to subscriber
  sms.sendMessage(number, name + " has been added to the IFP events monitor.  Respond with STOP if you wish to be removed.")

  //Track the monitored player
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

        //Notify after a failure that we are back online
        if(notifiedProblems) {
          notifiedProblems = false
          sms.sendMessage(adminNumber, "Functionality restored")
        }

        //For testing, allow an override html file
        if(process.env['IFPMON_DATA_OVERRIDE']){
          console.log("USING OVERRIDE: " + process.env['IFPMON_DATA_OVERRIDE'])
          html = fs.readFileSync(process.env['IFPMON_DATA_OVERRIDE'])
        }

        //Flag all current notifications as potentially ready to remove
        Object.keys(serverData.notifiedPlayers).forEach(function(key) {
          serverData.notifiedPlayers[key] = 0
        })

        //Find the matches we are interested in
        var currentMatches = scraper.findMatches(html)
        stats.currentMatches = currentMatches

        //Use the scraping utility to find the players currently called up
        var players = scraper.findPlayers(currentMatches, Object.keys(serverData.monitoredPlayers))

        //Notify each player
        Object.keys(players).forEach(function(player) {
          var match = players[player]
          //Make a unique key for this notification so we don't repeat it: player, event, team1 and team2
          var key = player+'_'+match.event+'_'+match.team1+'_'+match.team2+'_'+match.forPosition+'_'+match.table
          if(serverData.notifiedPlayers[key] != undefined) {
            // console.log("Already notified: " + key)

            //Flag this notification as still active
            serverData.notifiedPlayers[key] = 1
          } else {
            serverData.notifiedPlayers[key] = 1
            var message = "Table " + match.table + " " + match.event + " " + match.team1 + " vs " + match.team2 + ' for ' + match.forPosition
            if(serverData.monitoredPlayers[player].enabled) {
              var dt = new Date()
              console.log(dt + " notifying " + player + "(" + serverData.monitoredPlayers[player].number + ") " + message)
              sms.sendMessage(serverData.monitoredPlayers[player].number, message)
              stats.notificationsSent += 1
              stats.notificationLog.push(
                ("00" + dt.getHours()).slice(-2) +':'+
                ("00" + dt.getMinutes()).slice(-2) +':'+
                ("00" + dt.getSeconds()).slice(-2) + ' ' +
                player + " (" + serverData.monitoredPlayers[player].number + ") - " +
                message)
            } else {
              console.log("Player " + player + " is disabled, not sending notification")
            }
          }
        })

        //Remove all notifications that are no longer active
        Object.keys(serverData.notifiedPlayers).forEach(function(key) {
          if(serverData.notifiedPlayers[key] == 0) {
            // console.log("Removing notify key: " + key)
            delete serverData.notifiedPlayers[key]
          }
        })

        //Save the notifications so we don't resend
        fs.writeFileSync('./.notifications', JSON.stringify(serverData.notifiedPlayers))
      } else {
        //We've had a failure

        //First time failure, notify admin of problem
        if (!notifiedProblems) {
          var status = response ? response.status : '?'
          var msg = "Request failed.. status: " + status
          if(err) {
            msg += ' error: ' + err
          }
          sms.sendMessage(adminNumber, msg)
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
