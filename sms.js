// Twilio Credentials
var accountSid = 'ACcd10bcb8bb64190c49f7fa976aad14d6';
var authToken = process.env['TWILIO_AUTH']

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
      console.log(message.sid);
    }
  });
}

module.exports = {
  sendMessage: sendMessage
}
