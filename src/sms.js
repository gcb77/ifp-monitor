var winston = require('winston')
// Twilio Credentials
var accountSid = process.env['TWILIO_ACCOUNT_SID']
var authToken = process.env['TWILIO_ACCOUNT_AUTH']

var Promise = require('bluebird')

//require the Twilio module and create a REST client
var client
if (process.env.SMS_DISABLED) {
  //We're not sending SMS
} else {
  client = require('twilio')(accountSid, authToken);
}

/**
 * @param number
 * @param message
 * @return Promise
 */
var sendMessage = function (number, message) {
  if (process.env.SMS_DISABLED) {
    return new Promise(function (resolve, reject) {
      console.log("SENDING to : " + number + " : " + message)
      resolve()
    })
  } else {
    return new Promise(function (resolve, reject) {
      client.messages.create({
        to: number,
        from: '4252303559',
        body: message,
      }, function (err, message) {
        if (err) {
          winston.error("Error sending SMS message: ", err)
          reject(err)
        } else {
          resolve()
          // console.log(message.sid);
        }
      });
    })
  }
}

module.exports = {
  sendMessage: sendMessage
}
