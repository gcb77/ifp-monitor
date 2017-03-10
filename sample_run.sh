#!/bin/sh
export HOST_PORT=8080
export TWILIO_ACCOUNT_SID=<<ID>>
export TWILIO_ACCOUNT_AUTH=<<AUTH>>
export ADMIN_NUMBER=<<TEL_NUM>>

node server.js