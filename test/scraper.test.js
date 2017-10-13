const assert = require('assert')
const fs = require('fs')
const scraper = require('../scraper')

let test1data = fs.readFileSync('data/test1.html')
let test2data = fs.readFileSync('data/test2.html')
let welcomeData = fs.readFileSync('data/welcome.html')

describe('Scraper', function() {
  describe('findPlayers()', function() {
    it('should find me', function() {
      let matches = scraper.findMatches(test2data)
      let playersToSearch = [
        'George Barta'
      ]
      let playersFound = scraper.findPlayers(matches, playersToSearch)
      assert(playersFound)
      assert.equal(Object.keys(playersFound).length, 1 ) //Ensure 1 match was found
      assert(playersFound['George Barta']) //Ensure its a match under the player
    })
    it('should find Jr. players', function() {
      let matches = scraper.findMatches(test2data)
      let playersToSearch = [
        'JENNY ONG Jr.'
      ]
      let playersFound = scraper.findPlayers(matches, playersToSearch)
      assert(playersFound)
      assert.equal(Object.keys(playersFound).length, 1 ) //Ensure 1 match was found
    })
  })

  describe('getTournamentInfo()', function() {
    it('should parse out the tournament name', function() {
      let name = scraper.getTournamentInfo(welcomeData)
      assert.equal(name, '2017 Pennsylvania State')
    })
  })
})