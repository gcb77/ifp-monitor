const assert = require('assert');
const rewire = require('rewire');

let monitor

process.env.TWILIO_ACCOUNT_SID='null'
process.env.TWILIO_AUTH_TOKEN='null'
process.env.TWILIO_PHONE_NUMBERS='123,456'

monitor = rewire('../src/monitor.js')
monitor.__set__('request', requestMock)
monitor.__set__('sms', {})

let requestMockData = {}

//Fancy utility method to check a bunch of names
let namesCheck = function(monitor, searches) {
  let promises = []
  searches.forEach(function(srch) {
    promises.push(monitor.playerSearch(srch.search).then(function(res) {
      assert.equal(res.length, srch.expect.length, "Search for '" + srch.search + "'")
      srch.expect.forEach(function(expect, idx) {
        assert.equal(res[idx], expect, "Search for '" + srch.search + "'")
      })
      return res
    }, function(err) {
      throw new Error("Search for " + srch.search + " caused error: " + err )
    }))
  })
  return Promise.all(promises)
}

function requestMock(options, cb) {
  // console.log("HERE")
  // cb(new Error("HERE"))
  // cb(null, null, JSON.stringify({Items: []}))
  cb(requestMockData.error, requestMockData.response, requestMockData.body)
}

beforeEach(function() {
  requestMockData = {
    error: new Error("Not prepped!"),
    response: null,
    body: null
  }
})

describe('Monitor', function() {
  describe('playerSearch()', function () {
    it('should match exact name', function () {
      requestMockData.error = null
      requestMockData.body = JSON.stringify({Items: [{Text: 'first last'}]})
      return monitor.playerSearch('first last').then(function (res) {
        assert.equal(res.length, 1)
      }, function (err) {
        assert.equal(err.message, 'null')
      })
    })

    it('should match multiple names', function () {
      requestMockData.error = null
      requestMockData.body = JSON.stringify({Items: [{Text: 'first last'}, {Text: 'first last2'}]})
      return namesCheck(monitor, [
        {search: 'first', expect: ['first last', 'first last2']}
      ])
    })

    it('should select exact from multiple names names', function () {
      requestMockData.error = null
      requestMockData.body = JSON.stringify({Items: [{Text: 'first last'}, {Text: 'first last2'}]})
      return namesCheck(monitor, [
        {search: 'first last', expect: ['first last']}
      ])
    })

    it('should offer suggestions based on part of name if nothing matches', function() {
      requestMockData.error = null
      requestMockData.body = JSON.stringify({Items: [
        {Text: 'first b last2'},
        {Text: 'first a last'},
        {Text: 'john q user'},
        {Text: 'first2 last'}]})
      return namesCheck(monitor, [
        {search: 'first last', expect: [ 'first b last2', 'first a last', 'first2 last' ]},
      ])
    })

    it('should properly match CAN players', function() {
      requestMockData.error = null
      requestMockData.body = JSON.stringify({Items: [
        {Text: 'PLAYER ONE (CAN)'},
        {Text: 'first2 last'}]})
      return namesCheck(monitor, [
        {search: 'PLAYER', expect: ['PLAYER ONE']}
      ])
    })

    it('should work for Michael Everton Jr.', function() {
      requestMockData.error = null
      requestMockData.body = JSON.stringify({Items: [
        {Text: 'Michael Everton Jr. (DE)'},
        {Text: 'first2 last'}]})
      return namesCheck(monitor, [{search: 'Micael Everton', expect: ['Michael Everton Jr.']}])
    })

    it('should do complex matching when a name is not found', function() {
      requestMockData.error = null
      requestMockData.body = JSON.stringify({Items: [
        {Text: 'Thirty Five'},
        {Text: 'Five Over And Over'},
        {Text: 'Over Thirty'},
        {Text: 'Over Forty'},
        {Text: 'Over Five'},
      ]})
      return namesCheck(monitor, [
        {search: 'Over Five', expect: ['Over Five']},
        {search: 'blah blah', expect: []},
        {search: 'Over', expect: ['Five Over And Over', 'Over Thirty', 'Over Forty', 'Over Five']},
        {search: 'Over Foy', expect: ['Five Over And Over', 'Over Thirty', 'Over Forty', 'Over Five']},
        {search: 'Foy Over', expect: ['Five Over And Over']},
        {search: 'Thirty', expect: ['Thirty Five', 'Over Thirty']},
        {search: 'Or Thirty', expect: ['Over Thirty']},
      ])
    })


    it('should match name in multiple states', function() {
      requestMockData.error = null
      requestMockData.body = JSON.stringify({Items: [
        {Text: 'George Barta (WA)'},
        {Text: 'George Barta (CO)'},
      ]})
      return namesCheck(monitor, [
        {search: 'George Barta', expect: ['George Barta']}
      ])
    })

    it('should select the right player when multiple are found', function() {
      requestMockData.error = null
      requestMockData.body = JSON.stringify({Items: [
        {Text: 'George Barta One'},
        {Text: 'George Barta Two'},
        ]})
      return namesCheck(monitor, [
        {search: 'George Barta', expect: ['George Barta One', 'George Barta Two']},
        {search: 'George Barta One', expect: ['George Barta One']}
      ])
    })

    it('should select the exact player when multiple are found', function() {
      requestMockData.error = null
      requestMockData.body = JSON.stringify({Items: [
        {Text: 'George Barta'},
        {Text: 'George Barta Sr'},
        ]})
      return namesCheck(monitor, [
        {search: 'GEORGE BARTA', expect: ['George Barta']},
      ])
    })
  })
})
