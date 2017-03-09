// Twilio Credentials
var accountSid = process.env['TWILIO_ACCOUNT_SID']
var authToken = process.env['TWILIO_ACCOUNT_AUTH']

//require the Twilio module and create a REST client
var client = require('twilio')(accountSid, authToken);

var sendMessage = function(number, message) {
  client.messages.create({
    to: number,
    from: '4252303559',
    body: message,
  }, function (err, message) {
    if(err) {
      console.log("Error: ", err)
    } else {
      // console.log(message.sid);
    }
  });
}

module.exports = {
  sendMessage: sendMessage
}
