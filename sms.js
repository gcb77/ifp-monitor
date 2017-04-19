// Twilio Credentials
var accountSid = process.env['TWILIO_ACCOUNT_SID']
var authToken = process.env['TWILIO_ACCOUNT_AUTH']

var Promise = require('bluebird')

//require the Twilio module and create a REST client
var client = require('twilio')(accountSid, authToken);

/**
 * @param number
 * @param message
 * @return Promise
 */
var sendMessage = function(number, message) {
  // return new Promise(function(resolve, reject) {
  //   console.log("SENDING to : " + number + " : " + message)
  // })
  /* */
  return new Promise(function(resolve, reject) {
    client.messages.create({
      to: number,
      from: '4252303559',
      body: message,
    }, function (err, message) {
      if(err) {
        console.log("Error sending SMS message: ", err)
        reject(err)
      } else {
        resolve()
        // console.log(message.sid);
      }
    });
  })
  /* */
}

module.exports = {
  sendMessage: sendMessage
}
