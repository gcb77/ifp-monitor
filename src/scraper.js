var cheerio = require('cheerio')

function findMatches(data) {
  var dt = cheerio.load(data)
  var tbl = dt('#MatchesInProgressDisplay1_dgMatchesProgress')
  var matches = []
  tbl.find('tr').each(function (matchRowNum, matchRow) {
    if (matchRowNum == 0) {
      return
    }
    var event = matchRow.children[1].children[1].children[0].data
    var table = matchRow.children[2].children[1].attribs.value
    var team1 = matchRow.children[5].children[1].children[0].data
    var team2 = matchRow.children[7].children[1].children[0].data
    var forPs = matchRow.children[9].children[1].children[0].data

    event = event.replace(/\n|\r|\t/g, '')
    table = table.replace(/\n|\r|\t/g, '')
    forPs = forPs.replace(/\n|\r|\t/g, '')

    matches.push({
      event: event,
      table: table,
      team1: team1,
      team2: team2,
      forPosition: forPs
    })
    // console.log("MATCH: " + event + ' ' + team1 + " vs " + team2 + ' on table ' + table)
  })
  return matches
}

function findPlayers(matches, players) {
  var playersFound = {}
  matches.forEach(function (match) {
    players.forEach(function (player) {

      //Remove any literal '.' characters from the search
      let cp = player.replace('.', '')

      var re = new RegExp('\\b' + cp + '\\b', 'i')
      if (re.test(match.team1)) {
        playersFound[player] = match
      } else if (re.test(match.team2)) {
        playersFound[player] = match
      }
    })
  })
  return playersFound
}

function parseTournamentName(data) {
  let dt = cheerio.load(data)
  let eventSpan = dt('#lblEventName')
  return eventSpan.text()
}

module.exports = {
  findMatches: findMatches,
  findPlayers: findPlayers,
  parseTournamentName: parseTournamentName
}
