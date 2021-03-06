import { Connection, Messages, SfdxError } from '@salesforce/core';

var _ = require('lodash/core')

/*
 * Constant of maximum records num in DML operation (update/delete)
 */
var MAX_DML_COUNT = 200;

/**
* Upsert records
*
* @param {String} type - SObject Type
* @param {Record|Array.<Record>} records - Record or array of records to upsert
* @param {String} extIdField - External ID field name
* @param {Object} [options] - Options for rest api.
* @param {Boolean} [options.allOrNone] - If true, any failed records in a call cause all changes for the call to be rolled back
* @param {Object} [options.headers] - Additional HTTP request headers sent in retrieve request
* @param {Callback.<RecordResult|Array.<RecordResult>>} [callback] - Callback
* @returns {Promise.<RecordResult|Array.<RecordResult>>}
*/

export function upsert(conn : Connection, type, records, extIdField, options?, callback?) {
  if (!_.isString(type)) {
    // reverse order
    callback = options;
    options = extIdField;
    extIdField = records;
    records = type;
    type = null;
  }
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = options || {};
  return (
    _.isArray(records) ?
      (_supports(conn, 'upsert-collection') ? // check whether SObject collection API is supported
        _upsertMany(conn, type, records, extIdField, options) :
        _upsertParallel(conn, type, records, extIdField, options)) :
        _upsertSingle(conn, type, records, extIdField, options)
  ).thenCall(callback);
}

function _supports(conn: Connection, feature) {
  switch (feature) {
    case 'upsert-collection':
      return _ensureVersion(conn, 49);
    default:
      return false;
  }
}

function _ensureVersion(conn: Connection, majorVersion) {
  var versions = conn.version.split('.');
  return parseInt(versions[0], 10) >= majorVersion;
}

function _upsertMany(conn: Connection, type, records, extIdField, options) {
  if (records.length === 0) {
    return Promise.resolve([]);
  }
  if (records.length > MAX_DML_COUNT && options.allowRecursive) {
    var self = this;
    return self._upsertMany(type, records.slice(0, MAX_DML_COUNT), options).then(function(rets1) {
      return self._upsertMany(type, records.slice(MAX_DML_COUNT), options).then(function(rets2) {
        return rets1.concat(rets2);
      });
    });
  }
  let sobjectType;
  records = _.map(records, function(record) {
    sobjectType = type || (record.attributes && record.attributes.type) || record.type;
    if (!sobjectType) {
      throw new Error('No SObject Type defined in record');
    }
    record = _.clone(record);
    delete record.type;
    return record
  });
  var url = [ conn._baseUrl(), "composite", "sobjects", sobjectType, extIdField ].join('/');
  return conn.request({
    method : 'PATCH',
    url : url,
    body : JSON.stringify({
      allOrNone : options.allOrNone || false,
      records : records
    }),
    headers : _.defaults(options.headers || {}, {
      "Content-Type" : "application/json"
    })
  });
}

function _upsertSingle(conn: Connection, type, record, extIdField, options) {
  var sobjectType = type || (record.attributes && record.attributes.type) || record.type;
  if (!sobjectType) {
    return Promise.reject(new Error('No SObject Type defined in record'));
  }
  var extId = record[extIdField];
  record = _.clone(record);
  delete record.type;
  var url = [ conn._baseUrl(), "sobjects", sobjectType, extIdField, extId ].join('/');
  return conn.request({
    method : 'PATCH',
    url : url,
    body : JSON.stringify(record),
    headers : _.defaults(options.headers || {}, {
      "Content-Type" : "application/json"
    })
  }, {
    noContentResponse: { success : true, errors : [] }
  });
}

function _upsertParallel(conn: Connection, type, records, extIdField, options) {
  if (records.length > 10) {
    return Promise.reject(new Error("Exceeded max limit of concurrent call"));
  }
  return Promise.all(
    records.map(function(record) {
      return _upsertSingle(conn, type, record, extIdField, options).catch(function(err) {
        // be aware that allOrNone in parallel mode will not revert the other successful requests
        // it only raises error when met at least one failed request.
        if (options.allOrNone || !err.errorCode) {
          throw err;
        }
        return _toRecordResult(record.Id, err);
      });
    })
  );
}


function _toRecordResult(id, err) {
  var error: any = {
    statusCode: err.errorCode,
    message: err.message
  };
  if (err.content) { error.content = err.content; } // preserve External id duplication message
  if (err.fields) { error.fields = err.fields; } // preserve DML exception occurred fields
  var result: any = {
    success: false,
    errors: [error]
  };
  if (id) { result.id = id; }
  return result;
};
