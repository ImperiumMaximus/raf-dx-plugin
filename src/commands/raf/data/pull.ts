import { flags, SfdxCommand } from '@salesforce/command';
import { Connection, Messages, SfdxError } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import { Raf } from "../../../raf";

import path = require('path');
import _ = require('lodash');
import csv = require('csv');
import fs = require('fs');


// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('raf-dx-plugin', 'data_pull');

export default class Pull extends SfdxCommand {

  public static description = messages.getMessage("commandDescription");

  // Comment this out if your command does not require an org username
  protected static requiresUsername = true;

  // Comment this out if your command does not support a hub org username
  //protected static supportsDevhubUsername = true;

  // Set this to true if your command requires a project workspace; 'requiresProject' is false by default
  //protected static requiresProject = true;

  protected static flagsConfig = {
    datastore: flags.string({
      required: true,
      char: "d",
      description: "File path of datastore.json with push/pull info",
    }),
    loglevel: flags.enum({
      description: "logging level for this command invocation",
      default: "info",
      required: false,
      options: [
        "trace",
        "debug",
        "info",
        "warn",
        "error",
        "fatal",
        "TRACE",
        "DEBUG",
        "INFO",
        "WARN",
        "ERROR",
        "FATAL"
      ]
    })
  }

  public async run(): Promise<AnyJson> {
    Raf.setLogLevel(this.flags.loglevel, this.flags.json)

    const config = _.get(require(path.resolve(process.cwd(), this.flags.datastore)), 'pull', [])

    if (!config.length) throw new Error("Supplied datastore.json is empty!")

    const buildQuery = function (configItem) {
      let q = _.compact([
        `SELECT ${configItem.fields.join(',')} FROM ${configItem.object}`,
        configItem.filter
      ]).join(' WHERE ')

      if (configItem.order) q = q + ' ORDER BY ' + configItem.order
      if (configItem.limit) q = q + ' LIMIT ' + configItem.limit
      return q
    }

    const buildCsv = function (csvWriter, conn, res) {
      console.log(`WRITING ${res.records.length} lines`)
      for (const record of res.records) {
        _.each(record, (v, k) => {
          if (v === true) record[k] = 'true'
          else if (v === false) record[k] = 'false'
        })
        csvWriter.write(record)
      }
      if (!res.done) {
        return conn
        .queryMore(res.nextRecordsUrl)
        .then(newRes => buildCsv(csvWriter, conn, newRes))
      } else return true
    }

    const processData = function (conn: Connection, item = 0) {
      console.log(`PROCESSING ${config[item].object}`)
      return conn
        .query(buildQuery(config[item]))
        .then(res => {
          const csvWriter = csv.stringify({
            delimiter: ',',
            quote: '"',
            quoted: true,
            quotedEmpty: false,
            columns: config[item].fields,
            header: true
          })
          csvWriter.pipe(fs.createWriteStream(path.resolve(process.cwd(), config[item].storeIn)))
          return buildCsv(csvWriter, conn, res)
        })
        .then(() => {
          if (item + 1 < config.length) return processData(conn, item + 1)
          else return true
        })
    }

    processData(this.org.getConnection())
    .then(() => console.log('Script completed'))
    .catch(e => console.error('SOMETHING WENT WRONG!', e))

    return ''
  }

}
