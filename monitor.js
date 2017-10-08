var request = require('request')
var sms = require('./sms.js')
var scraper = require('./scraper.js')
var winston = require('winston')

var Promise = require('bluebird')

var fs = require('fs')

var playersFileName = 'tmp/players.json'
var notificationsFileName = 'tmp/notifications.json'

var Datastore = require('nedb')

var serverUrl = 'http://ifp.everguide.com'
var adminNumber = process.env['ADMIN_NUMBER']

var playersDatabase = new Datastore({filename: 'db/players.db', autoload: true})

var matchesInProgress = {}

var stripStateRegEx = /\s*\(.+\)\s*$/

if(process.env.SERVER_URL) {
  serverUrl = process.env.SERVER_URL
}

var serverData = {
  monitoredPlayers: {},
  notifiedPlayers: {},
  registrationResponse: '$player registered, you will receive messages when called for a match. Send REMOVE to be removed from this list.'
}

var monitorInterval = undefined
var notifiedProblems = false
var monitoringInterval = 30000

var stats = {
  monitoredPlayers: [],
  notificationsSent: 0,
  notificationLog: []
}

function loadSavedPlayers() {
  try {
    var savedPlayers = fs.readFileSync(playersFileName)
    serverData.monitoredPlayers = JSON.parse(savedPlayers)
    winston.info("Monitoring: " + JSON.stringify(serverData.monitoredPlayers))
    stats.monitoredPlayers = Object.keys(serverData.monitoredPlayers)

    var promises = []
    Object.keys(serverData.monitoredPlayers).forEach(function(name) {
      promises.push(updatePlayerDb(name, serverData.monitoredPlayers[name].number))
    })
    Promise.all(promises).then(function() {
      winston.info("Saved player list synchronized.")
    })
  } catch(err) {
    winston.warn("Unable to read saved players file")
  }
}

//Load saved players at startup
loadSavedPlayers()

function monitorStatus(name, status) {
  if(serverData.monitoredPlayers[name]) {
    serverData.monitoredPlayers[name].enabled = status
  }
  fs.writeFileSync(playersFileName, JSON.stringify(serverData.monitoredPlayers))
}

function updatePlayerDb(name, number) {
  return new Promise(function(resolve,reject) {
    playersDatabase.findOne({name: name}, function(err, result) {
      if (err) {
        winston.error("Unable to query players database!", err)
        reject("Unable to query players database: " + err)
      } else if (result) {
        if (result.number != number) {
          result.number = number
        }
        playersDatabase.update({_id: result._id}, result, {}, function (err, res) {
          resolve(res)
        })
      } else {
        playersDatabase.insert({
          name: name,
          number: number
        }, function (err, res) {
          resolve(res)
        })
      }
    })
  })
}


function addMonitoredPlayer(name, number) {
  if(!name) {
    return Promise.reject(new Error("Invalid name: " + name))
  }

  let addToMonitor = new Promise(function(resolve, reject) {
    if(serverData.monitoredPlayers[name]) {
      var err = new Error(name + " already monitored by " + serverData.monitoredPlayers[name].number)
      err.showUser = true
      return reject(err)
    }

    //Send message to admin
    var responseStr = serverData.registrationResponse.replace('$player', name)
    sms.sendMessage(adminNumber, "Added " + name + " to monitor, sending notifications to " + number)

    //Send message to subscriber
    sms.sendMessage(number, responseStr)

    //Track the monitored player
    serverData.monitoredPlayers[name] = {
      number: number,
      enabled: true
    }
    fs.writeFileSync(playersFileName, JSON.stringify(serverData.monitoredPlayers))
    stats.monitoredPlayers = Object.keys(serverData.monitoredPlayers)
    resolve()
  })

  return updatePlayerDb(name, number).then(function() {
    return addToMonitor
  })
}

// Keep track of when matches start/end
function trackMatchProgress(matches_list) {
  Object.keys(matchesInProgress).forEach(function(key) {
    matchesInProgress[key].flaggedForRemove = true
  })

  //Utility to make a key from the match to find it in the current list
  let makeKey = function(match) {
    return [match.event, match.table, match.team1, match.team2, match.forPosition].join(', ')
  }

  //Flag matches still in progress and add new matches
  matches_list.forEach(function(currentMatch) {
    let key = makeKey(currentMatch)
    if(matchesInProgress[key]) {
      matchesInProgress[key].flaggedForRemove = false
    } else {
      currentMatch.startTime = Date.now()
      matchesInProgress[key] = currentMatch
    }
  })

  //Remove finished matches
  Object.keys(matchesInProgress).forEach(function(key) {
    if(matchesInProgress[key].flaggedForRemove) {
      var m = matchesInProgress[key]
      winston.info("MATCH TRACK " + key + ', ' + m.startTime + ', ' + Date.now())
      delete matchesInProgress[key]
    }
  })

}

function monitorFunction() {

  //Only run if there are players to monitor
  if(Object.keys(serverData.monitoredPlayers).length > 0) {

    //Make request to page
    request(serverUrl + '/commander/tour/public/MatchList.aspx', function (err, response, html) {

      //Check return status
      if (!err && response.statusCode == 200) {

        //Notify after a failure that we are back online
        if(notifiedProblems) {
          notifiedProblems = false
          sms.sendMessage(adminNumber, "Functionality restored")
        }

        //Flag all current notifications as potentially ready to remove
        Object.keys(serverData.notifiedPlayers).forEach(function(key) {
          serverData.notifiedPlayers[key] = 0
        })

        //Find the matches we are interested in
        var currentMatches = scraper.findMatches(html)
        trackMatchProgress(currentMatches)
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
              winston.info(dt + " notifying " + player + "(" + serverData.monitoredPlayers[player].number + ") " + message)
              sms.sendMessage(serverData.monitoredPlayers[player].number, message)
              stats.notificationsSent += 1
              stats.notificationLog.push(
                ("00" + dt.getHours()).slice(-2) +':'+
                ("00" + dt.getMinutes()).slice(-2) +':'+
                ("00" + dt.getSeconds()).slice(-2) + ' ' +
                player + " (" + serverData.monitoredPlayers[player].number + ") - " +
                message)
            } else {
              winston.warn("Player " + player + " is disabled, not sending notification")
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
        fs.writeFileSync(notificationsFileName, JSON.stringify(serverData.notifiedPlayers))
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
    //winston.info("No players to monitor...")
  }
}

function monitorStart() {
  if(monitorInterval) {
    return
  }

  try {
    var notifications = fs.readFileSync(notificationsFileName)
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
        winston.info("Removing " + name + " with number " + number)
        delete serverData.monitoredPlayers[name]
        var idx = stats.monitoredPlayers.indexOf(name)
        if(idx >= 0) {
          stats.monitoredPlayers.splice(idx,1)
        }
        removedNames.push(name)
      }
    })
    
    //Persist the new player structure
    fs.writeFileSync(playersFileName, JSON.stringify(serverData.monitoredPlayers))
    
    resolve(removedNames)
  })
}

function playerSearch(searchText) {
  return new Promise(function (resolve, reject) {
    //http://ifp.everguide.com/commander/internal/ComboStreamer.aspx?e=users&rcbID=R&rcbServerID=R&text=&comboText=&comboValue=&skin=VSNet&external=true&timeStamp=1492492664193
    //http://ifp.everguide.com/commander/internal/ComboStreamer.aspx?e=users&rcbID=R&rcbServerID=R&text=barta&comboText=barta&comboValue=&skin=VSNet&external=true&timeStamp=1492492673453

    //Remove the state part since we can't search for it
    let originalSearchText = searchText.trim()
    searchText = searchText.replace(stripStateRegEx, '')

    var ts = Date.now()
    var url = serverUrl + '/commander/internal/ComboStreamer.aspx?e=users&rcbID=R&rcbServerID=R&text='+searchText+'&comboText=&comboValue=&skin=VSNet&external=true&timeStamp='+ts

    request({
      url: url,
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    }, function (err, response, body) {
      if(err) {
        winston.error("Error searching player names: ", err)
        reject(err)
      } else {
        try {
          var resp = JSON.parse(body)

          var matches = []

          //Replace any whitespace with the regular expression whitespace
          searchText = searchText.replace(/\s+/, '\\s+')

          //Create a regular expression from it
          var re = new RegExp(searchText, 'i')

          //Iterate over players
          resp.Items.forEach(function(item) {
            // console.log(item.Text)
            if(re.test(item.Text)) {
              matches.push(item.Text)
            }
          })


          //If multiple matches, but one matches exactly, use it
          if(matches.indexOf(originalSearchText) >= 0) {
            matches = [originalSearchText.replace(stripStateRegEx,'')]
          }

          //If nothing matched attempt to break down the name and try again
          if(matches.length === 0) {
            let parts = originalSearchText.split(/\s+/)
            // If its a bunch of words its probably not a name
            if (parts.length > 1 && parts.length < 4) {

              // parts.pop()
              // console.log("Searching for " + parts.join(' '))
              playerSearch(originalSearchText.replace(/^[^\s*]+/, '')).then(function (res) {
                resolve(res)
              }, function (err) {
                reject(err)
              })
            } else {
              resolve([])
            }
          } else if(matches.length === 1) {
            //Since we've found the matching player, strip the state information from the name
            matches[0] = matches[0].replace(stripStateRegEx, '');
            resolve(matches)
          } else {
            resolve(matches)
          }

        } catch(er) {
          winston.error("Unable to parse response when searching for player: ", er)
          reject(er)
        }
        //console.log("Result: ", resp)
      }
    })

  })
}

function getPlayerDb() {
  return new Promise(function(resolve, reject) {
    playersDatabase.find({}, function(err, data) {
      if(err) {
        reject(err)
      } else {
        // sort the players alphabetically by name
        resolve(data.sort(function(a, b) {
          if(a.name < b.name) {
            return -1
          }
          if(a.name > b.name) {
            return 1
          }
          return 0
        }))
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
  getPlayerDb: getPlayerDb,
  notifyAdmin: notifyAdmin,
  getRegistrationResponse: function() {
    return serverData.registrationResponse
  },
  setRegistrationResponse: function(msg) {
    serverData.registrationResponse = msg
  }
}
