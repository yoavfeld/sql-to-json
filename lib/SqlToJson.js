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
    this._logger.info('Building JSON structure');
    const jsonData = yield* this._buildStructureRecursiveGen(struct);
    return jsonData;
};

p._buildStructureRecursiveGen = function*(struct, reference, value) {
	this._debug('_buildStructureRecursiveGen', struct, reference, value);
	let data;
	if (this._isList(struct.type)) {
		if (struct.preDefinedkeys) {
			for (var i = 0; i < struct.preDefinedkeys.length; i++) {
				let key = struct.preDefinedkeys[i];
				let valueDesc = struct.fields[i];
				let element = yield* this._buildStructureRecursiveGen(valueDesc, reference);
				data = this._setElement(data, element, struct.type, key);
			}
		}
		let dbData;
		if (struct.query) {
			dbData = yield* this._queryGen(struct.query, reference);
		}
		if (struct.memQuery) {
			dbData = this._memQuery(struct.memQuery, reference);
		}
		if (dbData) {
			for (var i = 0; i < dbData.length; i++) {
				let dbRow = dbData[i];
				reference = this._getReferenceField(dbRow, struct.refField, reference);
				for (var j = 0; j < struct.fields.length; j++) {
					let field = struct.fields[j];
					let element = yield* this._buildStructureRecursiveGen(field, reference, dbRow[field.dbName]);
					let key = dbRow[struct.keyField] || field.name;		
					data = this._setElement(data, element, struct.type, key);
				}
			}
		}
	} else if (struct.type === 'json') {
		try {
			data = (value ? JSON.parse(value) : '');		
		} catch (e) {
			data = 'invalid json: ' + value;
		}
	} else { // for values (number,string, etc)
		data = (value ? value : undefined);
	}
    return data;
};

p._memQuery = function(sql, params) {
	this._debug('_memQuery');
	let parameters = [this._dbData].concat(params);
	return alasql(sql, parameters);
};

p._getReferenceField = function(dbRow, refField, defaultValue) {
	this._debug('_getReferenceField');
	if (!refField) {
		return defaultValue;
	}
	if (!_.isArray(refField)) {
		refField = [refField];
	}
	let ref = [];
	for (var i = 0; i < refField.length; i++) {
		ref.push(dbRow[refField[i]]);
	}
	return ref;
};

p._isList = function(type) {
	this._debug('_isList');
	return (type === 'array' || type === 'object');
};

p._setElement = function(container, element, containerType, key) {
	this._debug('_setElement');
	if (!element) {
		return container;
	}
	switch (containerType) {
		case ('array'):
			if (!container) {
				container = [];
			}
			container.push(element);
			break;
		case ('object'):
			if (!container) {
				container = {};
			}
			container[key] = element;
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
        result = yield _.bind(this._dbClient.query, this._dbClient, sql, params);
    } catch (e) {
        const error = new Error('Error while query ' + sql + '. ' + e);
        throw error;
    }
    result = (result.rows ? result.rows : result);
    this._dbData = result;
    return result;
};

module.exports = SqlToJson;