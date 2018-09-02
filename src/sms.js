var winston = require('winston')
// Twilio Credentials
var accountSid = process.env['TWILIO_ACCOUNT_SID']
var authToken = process.env['TWILIO_ACCOUNT_AUTH']

let sendingNumbersStr = process.env['TWILIO_PHONE_NUMBERS']

if(!sendingNumbersStr && !process.env.SMS_DISABLED) {
  throw new Error("Env var TWILIO_PHONE_NUMBERS not set")
} else if(process.env.SMS_DISABLED) {
  sendingNumbersStr = '111,222,333'
}

let sendNumbers = sendingNumbersStr.split(',')

console.log("Sending from the following phone numbers: ", sendNumbers)
winston.info("Sending from the following phone numbers: ", sendNumbers)

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
  let sendNumber = sendNumbers[Math.floor(Math.random()*sendNumbers.length)]
  if (process.env.SMS_DISABLED) {
    return new Promise(function (resolve, reject) {
      console.log(`SENDING from ${sendNumber} to : ${number} : ${message}`)
      resolve()
    })
  } else {
    return new Promise(function (resolve, reject) {
      client.messages.create({
        to: number,
        from: sendNumber,
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
