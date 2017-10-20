const Promise = require('bluebird')
const winston = require('winston')
const dataStore = require('./dataStore')

//Keep track of matches in progress
let matches = dataStore.getDatastore('matchesInProgress');

//Keep track of players that are playing in the tournament
let players = dataStore.getDatastore('playersInTournament');

let tournamentStats = dataStore.getDatastore('tournamentStats')

const doublesMatchRegEx = /^([^&]+) & (.*)$/

function archiveTournament() {
  return dataStore.archiveDataFiles()
}

function incrementPlayerCount(name) {
  return new Promise(function(resolve, reject) {
    players.findOne({_id: name}, function(err, doc) {
      if(err) {
        reject(err);
      } else if(doc) {
        doc.matchCount += 1
        players.update({_id: name}, doc, {}, function(err, newDoc) {
          if(err) {
            reject(err)
          } else {
            resolve(newDoc)
          }
        })
      } else {
        players.insert({_id: name, name: name, matchCount: 1}, function(err, newDoc) {
          if(err) {
            reject(err);
          } else {
            resolve(newDoc)
          }
        })
      }
    })
  }).catch(function(err) {
    winston.error("Unable to increment player match count: " + err);
  })
}

function getActiveMatches() {
  return new Promise(function(resolve, reject) {
    matches.find({status: 'active'}, function (err, docs) {
      if(err) {
        reject(err)
      } else {
        resolve(docs)
      }
    })
  }).catch(function(err) {
    winston.error("Unable to retrieve active matches!: " + err)
    return []
  })
}

// Keep track of when matches start/end
function trackMatchProgress(matches_list) {
  let matchesInProgress = {}

  //Utility to make a key from the match to find it in the current list
  let makeKey = function(match) {
    return [match.event, match.table, match.team1, match.team2, match.forPosition].join(', ')
  }

  //Build keys for matches in progress
  matches_list.forEach(function(currentMatch) {
    let key = makeKey(currentMatch)
    matchesInProgress[key] = currentMatch
  })

  //Get previous list of active matches
  getActiveMatches().then(function(activeMatches) {
    activeMatches.forEach(function(match) {
      if(matchesInProgress[match._id]) {
        //This match is still in progress
        delete matchesInProgress[match._id]
      } else {
        //This match has finished
        match.endTime = Date.now()
        match.status = 'finished'
        winston.info("MATCH TRACK " + match._id + ', ' + match.startTime + ', ' + match.endTime)
        matches.update({_id: match._id}, match)
      }
    })

    //Anything left in matchesInProgress is a new match that just started
    Object.keys(matchesInProgress).forEach(function(key) {
      let currentMatch = matchesInProgress[key]
      currentMatch.startTime = Date.now()
      currentMatch.status = 'active'
      currentMatch._id = key
      matches.insert(currentMatch)

      //Track players
      let t1 = doublesMatchRegEx.exec(currentMatch.team1)
      if(t1) {
        //This is a team
        incrementPlayerCount(t1[1])
        incrementPlayerCount(t1[2])
      } else {
        incrementPlayerCount(currentMatch.team1)
      }
      let t2 = doublesMatchRegEx.exec(currentMatch.team2)
      if(t2) {
        //This is a team
        incrementPlayerCount(t2[1])
        incrementPlayerCount(t2[2])
      } else {
        incrementPlayerCount(currentMatch.team2)
      }
    })
  })
}


//Update tournament name in stats
function doStart(tournamentName) {
  //Initiate stats
  return new Promise(function(resolve, reject) {
    tournamentStats.findOne({}, function(err, doc) {
      if(err) {
        reject(err)
      } else if(doc) {
        if(doc.tournament_name === tournamentName) {
          //All good
          resolve()
        } else {
          tournamentStats.update({}, {tournament_name: tournamentName})
          resolve()
        }
      } else {
        tournamentStats.insert({}, {tournament_name: tournamentName})
        resolve()
      }
    })
  })
}

function getTournamentInfo() {
  return Promise.all([
    //Get tournament info and players
    new Promise(function(resolve, reject) {
      tournamentStats.findOne({}, function(err, doc) {
        if(err) {
          reject(err)
        } else {
          resolve({stats: doc})
        }
      })
    }),
    new Promise(function(resolve, reject) {
      players.find({}, function(err, docs) {
        if(err) {
          reject(err)
        } else {
          let plMap = {}
          docs.forEach(function(doc) {
            plMap[doc._id] = doc
          })
          resolve({players: plMap})
        }
      })
    }),
  ]).then(function(dataArray) {
    //Combine the results into a return hash
    let ret = {}
    dataArray.forEach(function(dt) {
      Object.keys(dt).forEach(function(k) {
        ret[k] = dt[k]
      })
    })
    return ret
  }).catch(function(err) {
    winston.error("Unable to retrieve tournament info! " + err)
  })
}

module.exports = {
  trackMatchProgress: trackMatchProgress,
  archiveTournament: archiveTournament,
  getTournamentInfo: getTournamentInfo,
  doStart: doStart
}