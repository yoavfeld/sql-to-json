'use strict';

const _ = require('lodash');
const debug = require('debug');
const logger = require('log4js');
const alasql = require('alasql');

function SqlToJson(dbClient) {
    this._debug = debug('SqlToJson');
    this._logger = logger.getLogger('SqlToJson');
    this._dbClient = dbClient;
}

const p = SqlToJson.prototype;

p.executeGen = function*(struct) {
    this._debug('executeGen');
    yield * this._loadDbTables(struct.preLoadTables);
    this._logger.info('Building JSON structure');
    const jsonData = yield * this._buildStructureRecursiveGen(struct);
    this._clearAlaSqlTables();
    return jsonData;
};

p._loadDbTables = function*(tablesQueries) {
    this._debug('_loadDbTables');
    if (tablesQueries) {
        this._logger.info('Loading pre load tables');
        for (let tableName in tablesQueries) {
            alasql.tables[tableName] = {};
            let data = yield * this._queryGen(tablesQueries[tableName]);
            alasql.tables[tableName].data = data;
        }
    }
};

p._clearAlaSqlTables = function() {
    this._debug('_clearAlaSqlTables');
    for (let table in alasql.tables) {
        delete alasql.tables[table];
    }
};

p._buildStructureRecursiveGen = function*(struct, reference, value) {
    this._debug('_buildStructureRecursiveGen', struct, reference, value);
    let data;
    if (this._isList(struct.type)) {
        this._debug('list');
        if (struct.preDefinedkeys) {
            for (let i = 0; i < struct.preDefinedkeys.length; i++) {
                let key = struct.preDefinedkeys[i];
                let valueDesc = struct.fields[i];
                let element = yield * this._buildStructureRecursiveGen(valueDesc, reference);
                data = this._setElement(data, element, struct.type, key, struct.nullable);
            }
        }
        let dbData = yield * this._fetchDataGen(struct, reference);
        if (dbData && dbData.length > 0) {
            for (let i = 0; i < dbData.length; i++) {
                let dbRow = dbData[i];
                reference = this._getReferenceField(dbRow, struct.refField, reference);
                for (let j = 0; j < struct.fields.length; j++) {
                    let field = struct.fields[j];
                    let element = yield * this._buildStructureRecursiveGen(field, reference, dbRow[field.dbName]);
                    let key = dbRow[struct.keyField] || field.name;
                    data = this._setElement(data, element, struct.type, key, field.nullable);
                }
            }
        } else if (struct.nullable) {
            data = this._createElementByType(struct.type);
            for (let j = 0; j < struct.fields.length; j++) {
                let field = struct.fields[j];
                let element = yield * this._buildStructureRecursiveGen(field, reference, null);
                let key = field.name;
                data = this._setElement(data, element, struct.type, key, field.nullable);
            }
        }
    } else if (struct.type === 'json') {
        this._debug('json');
        try {
            data = (value ? JSON.parse(value) : '');
        } catch (e) {
            data = 'invalid json: ' + value;
        }
    } else { // for values (number,string, etc)
        this._debug('value', value);
        data = value;
    }
    return data;
};

p._fetchDataGen = function*(struct, reference) {
    this._debug('_fetchDataGen');
    let dbData;
    if (struct.query) {
        dbData = yield * this._queryGen(struct.query, reference);
    }
    if (struct.memQuery) {
        dbData = this._memQuery(struct.memQuery, reference);
    }
    this._debug(dbData);
    return dbData;
};

p._memQuery = function(sql, params) {
    this._debug('_memQuery', sql, params);
    return alasql(sql, params);
};

p._getReferenceField = function(dbRow, refField, defaultValue) {
    this._debug('_getReferenceField', arguments);
    if (!refField) {
        return defaultValue;
    }
    if (!_.isArray(refField)) {
        refField = [refField];
    }
    let ref = [];
    for (let i = 0; i < refField.length; i++) {
        ref.push(dbRow[refField[i]]);
    }
    return ref;
};

p._isList = function(type) {
    this._debug('_isList');
    return (type === 'array' || type === 'object');
};

p._createElementByType = function(type) {
    this._debug('_createElementByType');
    let data;
    switch (type) {
        case ('array'):
            return [];
        case ('object'):
            data = {};
            return data;
        default:
            return undefined;
    }
};

p._setElement = function(container, element, containerType, key, nullable) {
    this._debug('_setElement');
    if ((element === undefined || element === null) && !nullable) {
        return container;
    }
    if (!container) {
        container = this._createElementByType(containerType);
    }
    switch (containerType) {
        case ('array'):
            if (!element) {
                return container;
            }
            container.push(element);
            break;
        case ('object'):
            if (!key) {
                return container;
            }
            if (container[key] !== undefined) {
                for (let newkey in element) {
                    container[key][newkey] = element[newkey];
                }
            } else {
                container[key] = element;
            }
            break;
        default: // value
            container = element;
            break;
    }
    return container;
};

p._queryGen = function*(sql, params) {
    this._debug('_queryGen');
    let result;
    try {
        result = yield _.bind(this._dbClient.query, this._dbClient, sql, _.clone(params));
    } catch (e) {
        const error = new Error('Error while query ' + sql + '. ' + e);
        throw error;
    }
    result = (result.rows ? result.rows : result);
    return result;
};

module.exports = SqlToJson;
