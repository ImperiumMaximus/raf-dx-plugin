import { flags, SfdxCommand } from '@salesforce/command';
import { Connection, Messages, SfdxError, Org } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import { LoggerLevel, Raf } from "../../../raf";

import path = require('path');
import _ = require('lodash');
import csv = require('csv');
import fs = require('fs');
import { Options } from 'csv-stringify';


// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('raf-dx-plugin', 'raf');

export default class Pull extends SfdxCommand {

  public static description = messages.getMessage("data.pull.description");

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
      description: messages.getMessage("data.pull.flags.datastore"),
    }),
    loglevel: flags.enum({
      description: messages.getMessage("general.flags.loglevel"),
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

    if (this.flags.targetusername) {
      this.org =  await Org.create({ aliasOrUsername: this.flags.targetusername })
    }

    if (!this.org) {
      throw new SfdxError(messages.getMessage("general.error.noOrgFound", [this.flags.targetusername]))
    }

    if (this.flags.apiversion) {
      this.org.getConnection().setApiVersion(this.flags.apiversion)
    }

    const config = _.get(require(path.resolve(process.cwd(), this.flags.datastore)), 'pull', [])

    if (!config.length) {
      Raf.log(messages.getMessage("data.pull.warns.datastoreEmpty"), LoggerLevel.WARN)
      return ''
    }

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
      Raf.log(messages.getMessage("data.pull.infos.writingLines", [res.records.length]), LoggerLevel.INFO)
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
      Raf.log(messages.getMessage("data.pull.infos.processingObject", [config[item].object]), LoggerLevel.INFO)
      return conn
        .query(buildQuery(config[item]))
        .then(res => {
          let opts: Options = {
            delimiter: ',',
            quote: '"',
            quoted: true,
            quoted_empty: false,
            columns: config[item].fields,
            header: true
          }
          const csvWriter = csv.stringify(opts)
          csvWriter.pipe(fs.createWriteStream(path.resolve(process.cwd(), config[item].storeIn)))
          return buildCsv(csvWriter, conn, res)
        })
        .then(() => {
          if (item + 1 < config.length) return processData(conn, item + 1)
          else return true
        })
    }

    processData(this.org.getConnection())
    .then(() => Raf.log(messages.getMessage("general.infos.done"), LoggerLevel.INFO))
    .catch(e => Raf.log(messages.getMessage("data.pull.errors.generalError", [e]), LoggerLevel.ERROR))

    return ''
  }

}
