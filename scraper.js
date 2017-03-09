var cheerio = require('cheerio')

var findMatches = function(data) {
  var dt = cheerio.load(data)
  var tbl = dt('#MatchesInProgressDisplay1_dgMatchesProgress')
  var matches = []
  tbl.find('tr').each(function(matchRowNum, matchRow) {
    if(matchRowNum == 0) {
      return
    }
    var event = matchRow.children[1].children[1].children[0].data
    var table = matchRow.children[2].children[1].attribs.value
    var team1 = matchRow.children[5].children[1].children[0].data
    var team2 = matchRow.children[7].children[1].children[0].data

    event = event.replace(/\n|\r|\t/g, '')

    matches.push({
      event: event,
      table: table,
      team1: team1,
      team2: team2
    })
    // console.log("MATCH: " + event + ' ' + team1 + " vs " + team2 + ' on table ' + table)
  })
  return matches
}

var findPlayers = function(matches, players) {
  var playersFound = {}
  matches.forEach(function(match) {
    players.forEach(function(player) {
      if(match.team1.indexOf(player) >= 0) {
        playersFound[player] = match
      } else if(match.team2.indexOf(player) >= 0) {
        playersFound[player] = match
      }
    })
  })
  return playersFound
}

module.exports = {
  findMatches: findMatches,
  findPlayers: findPlayers
}
