const assert = require('assert');
const rewire = require('rewire');

let monitor

process.env.TWILIO_ACCOUNT_SID='null'
process.env.TWILIO_AUTH_TOKEN='null'

monitor = rewire('../monitor.js')
monitor.__set__('request', requestMock)
monitor.__set__('sms', {})

let requestMockData = {}

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
      return monitor.playerSearch('first').then(function (res) {
        assert.equal(res.length, 2)
      }, function (err) {
        assert.equal(err.message, 'null')
      })
    })

    it('should select exact from multiple names names', function () {
      requestMockData.error = null
      requestMockData.body = JSON.stringify({Items: [{Text: 'first last'}, {Text: 'first last2'}]})
      return monitor.playerSearch('first last').then(function (res) {
        assert.equal(res.length, 1)
      }, function (err) {
        assert.equal(err.message, 'null')
      })
    })

    it('should offer suggestions based on part of name if nothing matches', function() {
      requestMockData.error = null
      requestMockData.body = JSON.stringify({Items: [
        {Text: 'first b last2'},
        {Text: 'first a last'},
        {Text: 'john q user'},
        {Text: 'first2 last'}]})
      return monitor.playerSearch('first last').then(function (res) {
        assert.equal(res.length, 3)
      }, function (err) {
        assert.equal(err.message, 'null')
      })
    })
  })
})
