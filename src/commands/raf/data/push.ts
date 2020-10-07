import { flags, SfdxCommand } from '@salesforce/command';
import { Connection, Messages, SfdxError } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import { Raf } from "../../../raf";
import { upsert } from "../../../shared/upsert";

import path = require('path');
import _ = require('lodash');
import csv = require('csv');
import fs = require('fs');
import { Writable } from 'stream';
import through2 = require('through2');

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('raf-dx-plugin', 'data_push');

export default class Push extends SfdxCommand {

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

    const config = _.get(require(path.resolve(process.cwd(), this.flags.datastore)), 'push', [])

    if (!config.length) throw new Error("Supplied datastore.json is empty!")

    class SfdcWriter extends Writable {

      cfg: any;
      conn: Connection;

      constructor (cfg, conn: Connection, options?) {
        super(Object.assign(options || {}, { objectMode: true }))
        this.cfg = cfg
        this.conn = conn
      }

      _write (objects, encoding, callback) {
        const attrs: any = {}
        if (this.cfg.operation === 'upsert') {
          attrs.externalIdFieldName = this.cfg.externalId
          attrs.sObjects = objects
        } else if (this.cfg.operation === 'delete') {
          attrs.ids = objects
        }

        if (!objects.length) callback()
        else {
          //console.log(attrs.sObjects);

          (this.cfg.operation === 'delete' ? this.conn.sobject(this.cfg.object).delete(attrs.id) : upsert(this.conn, this.cfg.object, attrs.sObjects, attrs.externalIdFieldName))
            .then(res => {
              var resArray = Array.isArray(res) ? res : [res]
              console.log(`${this.cfg.operation === 'delete' ? 'deleted' : 'upserted'} ${resArray.length} records`)
              let hasErrors = false
              resArray.forEach((r, index) => {
                if (!r.success) {
                  console.log('Error on row ', index, r.errors)
                  hasErrors = true
                }
              })
              if (hasErrors) throw new Error()
            })
            .then(callback)
            .catch(callback)
        }
      }

    }

    const objectMapper = function (cfg) {
      let buffer = []

      return through2.obj(function (chunk, enc, callback) {
        if (cfg.operation === 'delete') {
          chunk = chunk.Id
        } else {
          //chunk['$type'] = cfg.object
          chunk["attributes"] = {"type": cfg.object}
          _.each(chunk, (v, k) => {
            if (v === '') delete chunk[k]
            else if (k.indexOf('\.') !== -1) {
              const tokens = k.split('\.')
              let cursor = chunk
              for (let i = 0; i < tokens.length - 1; i++) {
                const key = tokens[i]
                cursor = cursor[key] = {
                  //'$type': key.replace('__r', '__c').replace(/Id$/, '')
                  "attributes" : {"type" : key.replace('__r', '__c').replace(/Id$/, '')}
                }
              }

              cursor[tokens[tokens.length - 1]] = v
              delete chunk[k]
            }
          })
        }
        buffer.push(chunk)
        if (buffer.length === 200) {
          this.push(buffer)
          buffer = []
        }
        callback()
      }, function (callback) {
        this.push(buffer)
        callback()
      })
    }

    const processData = function (conn, item = 0) {
      const cfg = config[item]
      console.log(`PROCESSING ${config[item].object}`)

      return new Promise((resolve, reject) => {
        const input = (
          fs.createReadStream(path.resolve(process.cwd(), cfg.source), { encoding: 'utf-8' })
              .pipe(csv.parse({ delimiter: ',', quote: '"', columns: true }))
        )

        input
          .pipe(objectMapper(cfg))
          .pipe(new SfdcWriter(cfg, conn))
          .on('error', reject)
          .on('finish', () => {
            if (item + 1 === config.length) resolve()
            else {
              processData(conn, item + 1)
              .then(resolve)
              .catch(reject)
            }
          })
      })
    }

    processData(this.org.getConnection())
    .then(() => console.log('Script completed'))
    .catch(e => console.error('SOMETHING WENT WRONG!', e))


    return ''
  }

}
