let request = require('request')
let sms = require('./sms.js')
const scraper = require('./scraper.js')
const tournamentUtils = require('./tournamentUtils')
const winston = require('winston')
const debug = require('debug')('ifp-monitor:monitor')

const Promise = require('bluebird')

const fs = require('fs')

const playersFileName = 'db/players.json'
const notificationsFileName = 'db/notifications.json'

const Datastore = require('nedb')
const stripStateRegEx = /\s*\(.+\)\s*$/

let serverUrl = 'http://ifp.everguide.com'
let adminNumber = process.env['ADMIN_NUMBER']

let playersDatabase = new Datastore({
  filename: 'db/players.db',
  autoload: true
})

if (process.env.SERVER_URL) {
  serverUrl = process.env.SERVER_URL
}

/**
 * Structure to keep internal data
 * @type {{monitoredPlayers: {}, notifiedPlayers: {}, registrationResponse: string}}
 */
function newInternalServerData() {
  return {
    monitoredPlayers: {},
    notifiedPlayers: {},
    registrationResponse: '$player registered, you will receive messages when called for a match. Send REMOVE to be removed from this list.'
  }
}

let internalServerData = newInternalServerData()

let monitorInterval = undefined
let notifiedProblems = false
let monitoringInterval = 30000


let stats = newStats()

function newStats() {
  return {
    monitoredPlayers: [],
    notificationsSent: 0,
    notificationLog: [],
    notificationsPerPlayer: {},
    notificationsPerNumber: {}
  }
}


function loadSavedPlayers() {
  try {
    let savedPlayers = fs.readFileSync(playersFileName)
    internalServerData.monitoredPlayers = JSON.parse(savedPlayers)
    winston.info("Monitoring: " + JSON.stringify(internalServerData.monitoredPlayers))
    stats.monitoredPlayers = Object.keys(internalServerData.monitoredPlayers)

    let promises = []
    Object.keys(internalServerData.monitoredPlayers).forEach(function (name) {
      //TODO: add multiple numbers
      promises.push(updatePlayerDb(name, internalServerData.monitoredPlayers[name].number))
    })
    Promise.all(promises).then(function () {
      winston.info("Saved player list synchronized.")
    })
  } catch (err) {
    winston.warn("Unable to read saved players file")
  }
}

//Load saved players at startup
loadSavedPlayers()

function monitorStatus(number, status) {
  if (internalServerData.monitoredPlayers[number]) {
    internalServerData.monitoredPlayers[number].enabled = status
  }
  fs.writeFileSync(playersFileName, JSON.stringify(internalServerData.monitoredPlayers))
}

function updatePlayerDb(name, number) {
  return new Promise(function (resolve, reject) {
    playersDatabase.findOne({
      name: name
    }, function (err, result) {
      if (err) {
        winston.error("Unable to query players database!", err)
        reject("Unable to query players database: " + err)
      } else if (result) {
        if (result.number !== number) {
          result.number = number
        }
        playersDatabase.update({
          _id: result._id
        }, result, {}, function (err, res) {
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

function enableExtraFeatures(number) {
  return new Promise(function (resolve, reject) {
    if (internalServerData.monitoredPlayers[number]) {
      //Update the current number to include 'extras'
      internalServerData.monitoredPlayers[number].extras = true
    } else {
      //Create a new object for the number so when the user registers 'extras' will be enabled
      internalServerData.monitoredPlayers[number] = {
        enabled: true,
        extras: true,
        names: []
      }
    }

    //Send message to subscriber
    sms.sendMessage(number, 'Multiple player monitoring has been enabled for this device.')

    //Write the changes to disk
    fs.writeFileSync(playersFileName, JSON.stringify(internalServerData.monitoredPlayers))

    resolve()
  })
}

function addMonitoredPlayer(name, number) {
  if (!name) {
    return Promise.reject(new Error("Invalid name: " + name))
  } if (!number) {
    return Promise.reject(new Error('Number is required to monitor'))
  }

  return new Promise(function (resolve, reject) {
    if (internalServerData.monitoredPlayers[number]) {
      if (internalServerData.monitoredPlayers[number].names.includes(name)) {
        let msg = `You have already registered ${name} on this device`
        let err = new Error(msg)
        err.showUser = true
        return reject(err)
      }
    } else {
      // Assuming that since this is the first name requested on this number it should be the user
      updatePlayerDb(name, number)
      internalServerData.monitoredPlayers[number] = {
        enabled: true,
        names: []
      }
    }

    internalServerData.monitoredPlayers[number].names.push(name)

    //Send message to admin
    // sms.sendMessage(adminNumber, "Added " + name + " to monitor, sending notifications to " + number)

    if(internalServerData.monitoredPlayers[number].names.length <= 1) {
      //Send message to first time subscriber
      let responseStr = internalServerData.registrationResponse.replace('$player', name)
      sms.sendMessage(number, responseStr)
    } else {
      let responseStr = `${name} added`
      sms.sendMessage(number, responseStr)
    }

    //Track the monitored player
    // internalServerData.monitoredPlayers[number][name] = 0
    fs.writeFileSync(playersFileName, JSON.stringify(internalServerData.monitoredPlayers))
    stats.monitoredPlayers = getMonitoredPlayerNames()
    resolve()
  })
}


/**
 * Returns a list of all currently monitored players across all devices
 */
function getMonitoredPlayerNames() {
  let internalMonitorObj = internalServerData.monitoredPlayers
  let players = {}
  for (const device in internalMonitorObj) {
    for (name of internalMonitorObj[device].names) {
      players[name] = true
    }
  }
  return Object.keys(players)
}


function findNumbersToNotifyFor(player) {
  let db = internalServerData.monitoredPlayers
  let numbers = {}
  for(const device in db) {
    if(db[device].enabled) {
      for(name of db[device].names) {
        if(name === player) {
          numbers[device] = true
        }
      }
    }
  }
  return Object.keys(numbers)
}

function localErrorHandler(err) {
  winston.error(err)
}

function processMatchPage(html) {
  debug("Processing the current match page")
  //Flag all current notifications as potentially ready to clean up.  Notifications are removed when
  // the match is no longer found on the matches-in-progress page
  Object.keys(internalServerData.notifiedPlayers).forEach(function (key) {
    internalServerData.notifiedPlayers[key] = 0
  })

  //Find the matches we are interested in
  let currentMatches = scraper.findMatches(html)
  tournamentUtils.trackMatchProgress(currentMatches)
  stats.currentMatches = currentMatches

  //matchUtils.notifyActivePlayers(currentMatches)

  //Use the scraping utility to find the players currently called up
  let players = scraper.findPlayers(currentMatches, getMonitoredPlayerNames())

  //Notify each player
  Object.keys(players).forEach(function (player) {
    let match = players[player]
    //Make a unique key for this notification so we don't repeat it: player, event, team1 and team2
    findNumbersToNotifyFor(player).forEach(number => {
      let key = number + '_' + match.event + '_' + match.team1 + '_' + match.team2 + '_' + match.forPosition + '_' + match.table
      if (internalServerData.notifiedPlayers[key] !== undefined) {

        //Flag this notification as still active
        internalServerData.notifiedPlayers[key] = 1

        //Check if team the player is in is on recall
        if (
          (match.team1Recall && match.team1.indexOf(player) > -1) ||
          (match.team2Recall && match.team2.indexOf(player) > -1)
        ) {
          //Send recall message to player
          const recallMsgKey = `${number}_${match.event}_${match.team1}_${match.team2}_${match.forPosition}_recall`
          if (internalServerData.notifiedPlayers[recallMsgKey] !== undefined) {
            // Already notified, don't send again
            internalServerData.notifiedPlayers[recallMsgKey] = 1
          } else {
            const recallMessage = `Recall for ${match.team1Recall ? match.team1 : ''} ${match.team2Recall ? match.team2 : ''} at table ${match.table}`
            let dt = new Date()
            winston.info(dt + " notifying " + player + "(" + number + ") " + recallMessage)
            sms.sendMessage(number, recallMessage).catch(localErrorHandler)
            internalServerData.notifiedPlayers[recallMsgKey] = 1
            stats.notificationsSent += 1
            stats.notificationLog.push(
              ("00" + dt.getHours()).slice(-2) + ':' +
              ("00" + dt.getMinutes()).slice(-2) + ':' +
              ("00" + dt.getSeconds()).slice(-2) + ' ' +
              player + " (" + number + ") - " +
              recallMessage)
          }
        }
      } else {
        internalServerData.notifiedPlayers[key] = 1
        let msgFor = internalServerData.monitoredPlayers[number].names.length > 1 ? `(${player}) ` : ''
        let message = `Table ${match.table} ${msgFor}${match.event} ${match.team1} vs ${match.team2} for ${match.forPosition}`
        let dt = new Date()
        winston.info(dt + " notifying " + player + "(" + number + ") " + message)
        sms.sendMessage(number, message).catch(localErrorHandler)
        stats.notificationsSent += 1
        stats.notificationLog.push(
          ("00" + dt.getHours()).slice(-2) + ':' +
          ("00" + dt.getMinutes()).slice(-2) + ':' +
          ("00" + dt.getSeconds()).slice(-2) + ' ' +
          player + " (" + number + ") - " +
          message)

        //keep counts of notifications per player and number
        stats.notificationsPerPlayer[player] = (1 + stats.notificationsPerPlayer[player]) || 1
        stats.notificationsPerNumber[number] = (1 + stats.notificationsPerNumber[number]) || 1
      }
    })
  })

  //Remove all notifications that are no longer active
  Object.keys(internalServerData.notifiedPlayers).forEach(function (key) {
    if (internalServerData.notifiedPlayers[key] === 0) {
      delete internalServerData.notifiedPlayers[key]
    }
  })

  //Save the notifications so we don't resend
  fs.writeFileSync(notificationsFileName, JSON.stringify(internalServerData.notifiedPlayers))
}

/**
 * Main driver to perform monitoring.  Expected to be called at a regular interval.
 */
function monitorFunction() {
  debug('Monitor function running')

  //Only run if there are players to monitor
  if (Object.keys(internalServerData.monitoredPlayers).length > 0) {

    //Make request to page
    request(serverUrl + '/commander/tour/public/MatchList.aspx', function (err, response, html) {

      //Check return status
      if (!err && response.statusCode === 200) {

        //Notify after a failure that we are back online
        if (notifiedProblems) {
          notifiedProblems = false
          sms.sendMessage(adminNumber, "Functionality restored").catch(localErrorHandler)
        }
        try {
          processMatchPage(html)
        } catch (err) {
          winston.error("Failed to process matches page: " + err)
        }
      } else {
        //We've had a failure

        //First time failure, notify admin of problem
        if (!notifiedProblems) {
          let status = response ? response.status : '?'
          let msg = "Request failed.. status: " + status
          if (err) {
            msg += ' error: ' + err
          }
          sms.sendMessage(adminNumber, msg).catch(localErrorHandler)
          notifiedProblems = true
        }
      }
    })
  } else {
    //winston.info("No players to monitor...")
  }
}

/**
 * Enable monitoring
 */
function monitorStart() {
  //Check to make sure we're not monitoring already
  if (monitorInterval) {
    return
  }

  try {
    //Read current notifications from file
    let notifications = fs.readFileSync(notificationsFileName)
    internalServerData.notifiedPlayers = JSON.parse(notifications)
  } catch (err) {
    //We might possibly send duplicate notifications here if we fail to read the notification file
  }

  stats.started = Date.now()
  stats.stopped = undefined

  request(serverUrl + '/commander/tour/public/welcome.aspx', function (err, response, html) {
    //Check return status
    if (!err && response.statusCode === 200) {
      let name = scraper.parseTournamentName(html)
      tournamentUtils.doStart(name).then(function () {
        debug('Starting monitoring interval with ', monitoringInterval)
        //Set up a monitoring interval
        monitorInterval = setInterval(monitorFunction, monitoringInterval)
      })
    } else {
      winston.error("Unable to extract tournament information: " + err)
    }
  })
}

function archiveTournament() {
  return tournamentUtils.archiveTournament().then(function () {
    stats = newStats()
    internalServerData = newInternalServerData()
  })
}

function monitorStop() {
  delete stats.started
  stats.stopped = Date.now()
  if (monitorInterval) {
    clearInterval(monitorInterval)
  }
  monitorInterval = undefined
}

function getStats() {
  return stats
}

function getMonitoredPlayers() {
  return internalServerData.monitoredPlayers
}

function removeMonitoredNumber(numberToRemove) {
  debug('removing number from monitoring: ', numberToRemove)
  return new Promise(function (resolve, reject) {
      let removedNames = internalServerData.monitoredPlayers[numberToRemove].names
      winston.info("Removing " + removedNames + " from number " + numberToRemove)
      //Keep the object to preserve information but remove names associated with it
      internalServerData.monitoredPlayers[numberToRemove].names = []
      stats.monitoredPlayers = getMonitoredPlayerNames()

      //Persist the new player structure
      fs.writeFileSync(playersFileName, JSON.stringify(internalServerData.monitoredPlayers))

      resolve(removedNames)
    }).then(function (names) {
    if (names && names.length > 0) {
      let msg = 'No longer monitoring: ' + names.join(', ');
      sms.sendMessage(numberToRemove, msg)
      sms.sendMessage(adminNumber, "Removed " + numberToRemove + " from monitor (" + names.join(', ') + ')')
    }
    return names;
  })
}

function playerSearch(searchText) {
  return new Promise(function (resolve, reject) {
    //http://ifp.everguide.com/commander/internal/ComboStreamer.aspx?e=users&rcbID=R&rcbServerID=R&text=&comboText=&comboValue=&skin=VSNet&external=true&timeStamp=1492492664193
    //http://ifp.everguide.com/commander/internal/ComboStreamer.aspx?e=users&rcbID=R&rcbServerID=R&text=barta&comboText=barta&comboValue=&skin=VSNet&external=true&timeStamp=1492492673453

    //Remove the state part since we can't search for it
    let originalSearchText = searchText.trim()
    searchText = searchText.replace(stripStateRegEx, '')

    //Don't perform a search on anything that's 3 characters or less
    if (originalSearchText.length < 4) {
      return resolve([])
    }

    let ts = Date.now()
    let url = serverUrl + '/commander/internal/ComboStreamer.aspx?e=users&rcbID=R&rcbServerID=R&text=' + searchText + '&comboText=&comboValue=&skin=VSNet&external=true&timeStamp=' + ts

    request({
      url: url,
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    }, function (err, response, body) {
      if (err) {
        winston.error("Error searching player names: ", err)
        reject(err)
      } else {
        try {
          let resp = JSON.parse(body)

          let matches = []

          //Replace any whitespace with the regular expression whitespace
          searchText = searchText.replace(/\s+/, '\\s+')

          //Create a regular expression from it
          let re = new RegExp(searchText, 'i')

          //Use a hash to deal with duplicates
          let namesHash = {}

          //Iterate over players
          resp.Items.forEach(function (item) {
            if (re.test(item.Text)) {
              //Strip the state from the matched name and add it to the names hash
              namesHash[item.Text.replace(stripStateRegEx, '')] = true;
            }
          })
          //Get the object keys of the hash as the name
          matches = Object.keys(namesHash)


          //If multiple matches, but one matches exactly, use it
          let exactMatcExp = new RegExp('^' + originalSearchText.replace(stripStateRegEx, '') + '$', 'i')
          matches.forEach(function (thisMatch) {
            if (exactMatcExp.test(thisMatch)) {
              matches = [thisMatch]
            }
          })

          //If nothing matched attempt to break down the name and try again
          if (matches.length === 0) {
            let parts = originalSearchText.split(/\s+/)

            // If its a bunch of words its probably not a name
            if (parts.length > 1 && parts.length < 4) {

              // Strip the last word and try again
              playerSearch(originalSearchText.replace(/\s+[^\s*]+$/, '')).then(function (res) {
                if (res.length === 0) {
                  // Since stripping the last word didn't work, try stripping the first word out and try searching again
                  playerSearch(originalSearchText.replace(/^[^\s*]+/, '')).then(function (res) {
                    resolve(res)
                  }, function (err) {
                    reject(err)
                  })
                } else {
                  resolve(res)
                }
              }, function (err) {
                reject(err)
              })
            } else {
              resolve([])
            }
          } else if (matches.length === 1) {
            //Since we've found the matching player, strip the state information from the name
            matches[0] = matches[0].replace(stripStateRegEx, '');
            resolve(matches)
          } else {
            resolve(matches)
          }

        } catch (er) {
          winston.error("Unable to parse response when searching for player: ", er)
          reject(er)
        }
      }
    })

  })
}

function getPlayerDb() {
  return new Promise(function (resolve, reject) {
    playersDatabase.find({}, function (err, data) {
      if (err) {
        reject(err)
      } else {
        // sort the players alphabetically by name
        data.sort(function (a, b) {
          if (a.name < b.name) {
            return -1
          }
          if (a.name > b.name) {
            return 1
          }
          return 0
        })
        tournamentUtils.getTournamentInfo().then(function (td) {
          data.forEach(function (player) {
            if (td.players[player.name]) {
              player.inTournament = true
            }
            if (internalServerData.monitoredPlayers[player.name]) {
              player.beingMonitored = true
            }
          })
          resolve(data)
        })
      }
    })
  })
}

function notifyAdmin(msg) {
  return sms.sendMessage(adminNumber, msg)
}

function notifyAll(msg) {
  for(let number in internalServerData.monitoredPlayers) {
    let monitored = internalServerData.monitoredPlayers[number]
    if(monitored.enabled && monitored.names && monitored.names.length) {
      sms.sendMessage(number, msg)
    }
  }
}

module.exports = {
  addMonitoredPlayer: addMonitoredPlayer,
  monitorStart: monitorStart,
  monitorStop: monitorStop,
  archiveTournament: archiveTournament,
  getStats: getStats,
  getMonitoredPlayers: getMonitoredPlayers,
  setMonitorStatusForPlayer: monitorStatus,
  removeMonitorNumber: removeMonitoredNumber,
  playerSearch: playerSearch,
  getPlayerDb: getPlayerDb,
  notifyAdmin: notifyAdmin,
  notifyAll: notifyAll,
  enableExtraFeatures: enableExtraFeatures,
  getRegistrationResponse: function () {
    return internalServerData.registrationResponse
  },
  setRegistrationResponse: function (msg) {
    internalServerData.registrationResponse = msg
  }
}
