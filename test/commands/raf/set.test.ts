var expect = require('chai').expect;
/*import { ensureJsonMap, ensureString } from '@salesforce/ts-types';*/

describe('raf:boh:set', () => {
  /*test
    .withOrg({ username: 'rfioratto@raf-dx-plugin.com' }, true)
    .withConnectionRequest(request => {
      const requestMap = ensureJsonMap(request);
      if (ensureString(requestMap.url).match(/Organization/)) {
        return Promise.resolve({ records: [ { Name: 'Super Awesome Org', TrialExpirationDate: '2018-03-20T23:24:11.000+0000'}] });
      }
      return Promise.resolve({ records: [] });
    })
    .stdout()
    .command(['hello:org', '--targetusername', 'test@org.com'])*/
    it('runs hello:org --targetusername test@org.com', ctx => {
      expect.fail('fail')
      //expect(ctx.stdout).to.contain('Hello world! This is org: Super Awesome Org and I will be around until Tue Mar 20 2018!');
    });
});
