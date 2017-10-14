const assert = require('assert');
const rewire = require('rewire');

let monitor

process.env.TWILIO_ACCOUNT_SID='null'
process.env.TWILIO_AUTH_TOKEN='null'

monitor = rewire('../src/monitor.js')
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

    it('should properly match CAN players', function() {
      requestMockData.error = null
      requestMockData.body = JSON.stringify({Items: [
        {Text: 'PLAYER ONE (CAN)'},
        {Text: 'first2 last'}]})
      return monitor.playerSearch('PLAYER').then(function (res) {
        assert.equal(res.length, 1)
        assert.equal(res[0], 'PLAYER ONE')
      }, function (err) {
        assert.equal(err.message, 'null')
      })
    })

    it('should work for Michael Everton Jr.', function() {
      requestMockData.error = null
      requestMockData.body = JSON.stringify({Items: [
        {Text: 'Michael Everton Jr. (DE)'},
        {Text: 'first2 last'}]})
      return monitor.playerSearch('Micael Everton').then(function (res) {
        assert.equal(res.length, 1)
        assert.equal(res[0], 'Michael Everton Jr.')
      }, function (err) {
        assert.equal(err.message, 'null')
      })
    })

    it('should select the right player when multiple are found', function() {
      requestMockData.error = null
      requestMockData.body = JSON.stringify({Items: [
        {Text: 'George Barta (WA)'},
        {Text: 'George Barta (CO)'},
        ]})
      monitor.playerSearch('George Barta').then(function (res) {
        assert.equal(res.length, 2)
        assert.equal(res[0], 'George Barta (WA)')
        assert.equal(res[1], 'George Barta (CO)')
      }, function (err) {
        assert.equal(err.message, 'null')
      })
      monitor.playerSearch('George Barta (WA)').then(function (res) {
        console.log(res)
        assert.equal(res.length, 1)
        assert.equal(res[0], 'George Barta')
      }, function (err) {
        assert.equal(err.message, 'null')
      })

    })
  })
})
