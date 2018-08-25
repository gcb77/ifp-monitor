# IFP Monitor

A node.js service that scrapes information from the current matches in progress at an IFP (International Foosball 
Promotions) event and sends registered users an SMS message to notify them to show up at their table.

#### How to use
Set up a twilio account (you can use a trial one for testing or just personal notifications)

Copy `sample_run.sh` to `run.sh`, and add your twilio credentials, and optionally, your username/password.

#### Testing

npm run debugServer
npm run debug

Access the UI at http://localhost:8080
Send POST requests (x-www-form-urlencoded) to http://localhost:8080/messageIn using PostMan with:
* Body: user
* From: number

