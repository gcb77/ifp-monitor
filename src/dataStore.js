const Datastore = require('nedb')
const Promise = require('bluebird')
const winston = require('winston')
const fs = require('fs-extra')

const DB_DIR = 'db/dataStore/'

let databases = {}

/**
 * Generic method to get a database
 * @param dbName
 * @returns {*}
 */
function getDatastore(dbName) {
  if (!databases[dbName]) {
    databases[dbName] = new Datastore({
      filename: DB_DIR + dbName + '.db',
      autoload: true
    })
  }
  return databases[dbName]
}

/**
 * Compacts the data files and moves them to a folder based on the current timestamp
 */
function archiveDataFiles() {
  let cpPromises = []

  // Compact all NEDB files
  Object.keys(databases).forEach(function (dbName) {
    cpPromises.push(new Promise(function (resolve, reject) {
      databases[dbName].on('compaction.done', function () {
        resolve()
      })
      databases[dbName].persistence.compactDatafile();
    }))
  })

  // Move files new folder location
  return Promise.all(cpPromises).then(function () {
    let archiveDir = Date.now() + '/'
    fs.mkdirSync(DB_DIR + archiveDir);

    //All dbs have been compacted, move them
    Object.keys(databases).forEach(function (dbName) {
      fs.renameSync(DB_DIR + dbName + '.db', DB_DIR + archiveDir + dbName + '.db')
      databases[dbName] = new Datastore({
        filename: DB_DIR + dbName + '.db',
        autoload: true
      })
    })

    //Move the players.json and notifications.json files
    fs.renameSync('db/players.json', DB_DIR + archiveDir + 'players.json')
    fs.renameSync('db/notifications.json', DB_DIR + archiveDir + 'notifications.json')

    //Copy the log file
    fs.copySync('log/ifpmon.log', DB_DIR + archiveDir + 'ifpmon.log')
    fs.writeFileSync('log/ifpmon.log', '')
    return Promise.resolve()
  }).catch(function (err) {
    winston.error("Failed to archive data store files: " + err)
  })
}

module.exports = {
  getDatastore: getDatastore,
  archiveDataFiles: archiveDataFiles
}
