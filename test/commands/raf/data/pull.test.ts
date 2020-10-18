//import { expect, test } from '@salesforce/command/lib/test';
import { Messages } from '@salesforce/core';
import { Push } from '../../../../src/commands/raf/data/push';
import { Pull } from '../../../../src/commands/raf/data/pull';
import * as csv from 'csvtojson';
import { expect } from 'chai';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('raf-dx-plugin', 'raf');

let username;

describe('raf:data:pull', function() {
  before(async function () {
    username = process.env.SCRATCH_ORG_USERNAME;

    await Push.run(['-u', username, '-d', 'test/data/raf-dx-plugin-devorg/.datastore.json'])
  })


  it('reads from .datastore.json to pull data from an org', async function () {
    await Pull.run(['-u', username, '-d', 'test/data/raf-dx-plugin-devorg/.datastore.test.json', '--apiversion', '49.0'])
    const pullResultArray = await csv().fromFile('test/data/raf-dx-plugin-devorg/data/accounts.csv')
    const originalArray = await csv().fromFile('test/data/accounts.csv')

    expect(pullResultArray.length).to.be.equal(originalArray.length)
  })
  it('generates an error if an empty .datastore.json is specified', async function() {
    const res = await Pull.run(['-u', username, '-d', 'test/data/raf-dx-plugin-devorg/.datastore.empty.json', '--apiversion', '49.0'])
    expect(res).to.be.equal(messages.getMessage("data.pull.warns.datastoreEmpty"))
  })
})
