var request = require('request')
var sms = require('./sms.js')
var scraper = require('./scraper.js')

var Promise = require('bluebird')

var fs = require('fs')

var url = 'http://ifp.everguide.com/commander/tour/public/MatchList.aspx'
// var url = 'http://localhost:8082/matches'
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
  return new Promise(function(resolve, reject) {
    if(!name) {
      return reject(new Error("Invalid name: " + name))
    }

    if(serverData.monitoredPlayers[name]) {
      var err = new Error(name + " already monitored by " + serverData.monitoredPlayers[name].number)
      err.showUser = true
      return reject(err)
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
    resolve()
  })
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

function removeMonitoredNumber(number) {
  return new Promise(function(resolve, reject) {
    var removedNames = []
    Object.keys(serverData.monitoredPlayers).forEach(function(name) {
      if(number == serverData.monitoredPlayers[name].number) {
        console.log("Removing " + name + " with number " + number)
        delete serverData.monitoredPlayers[name]
        removedNames.push(name)
      }
    })
    resolve(removedNames)
  })
}

function playerSearch(searchText) {
  return new Promise(function (resolve, reject) {
    //http://ifp.everguide.com/commander/internal/ComboStreamer.aspx?e=users&rcbID=R&rcbServerID=R&text=&comboText=&comboValue=&skin=VSNet&external=true&timeStamp=1492492664193
    //http://ifp.everguide.com/commander/internal/ComboStreamer.aspx?e=users&rcbID=R&rcbServerID=R&text=barta&comboText=barta&comboValue=&skin=VSNet&external=true&timeStamp=1492492673453

    var serverUrl = 'http://ifp.everguide.com'
    // var serverUrl = 'http://localhost:8082'

    var ts = Date.now()
    var url = serverUrl + '/commander/internal/ComboStreamer.aspx?e=users&rcbID=R&rcbServerID=R&text='+searchText+'&comboText=&comboValue=&skin=VSNet&external=true&timeStamp='+ts

    request({
      url: url,
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    }, function (err, response, body) {
      if(err) {
        console.log("Error searching player names: ", err)
        reject(err)
      } else {
        try {
          var resp = JSON.parse(body)

          var matches = []

          searchText = searchText.replace(/\s+/, '\\s+')
          searchText = searchText.replace(/\(..\)/, '')
          var re = new RegExp(searchText, 'i')

          //Iterate over players
          resp.Items.forEach(function(item) {
            // console.log(item.Text)
            if(re.test(item.Text)) {
              matches.push(item.Text)
            }
          })

          resolve(matches)
        } catch(er) {
          console.log("Unable to parse response when searching for player: ", er)
          reject(er)
        }
        //console.log("Result: ", resp)
      }
    })

  })
}

function notifyAdmin(msg) {
  return sms.sendMessage(adminNumber, msg)
}

module.exports = {
  addMonitoredPlayer: addMonitoredPlayer,
  monitorStart: monitorStart,
  monitorStop: monitorStop,
  getStats: getStats,
  getMonitoredPlayers: getMonitoredPlayers,
  setMonitorStatusForPlayer: monitorStatus,
  removeMonitorNumber: removeMonitoredNumber,
  playerSearch: playerSearch,
  notifyAdmin: notifyAdmin
}
