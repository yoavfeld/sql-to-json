'use strict';

const _ = require('lodash');
const debug = require('debug');
const logger = require('log4js');

function SqlToJson(dbClient) {	
	this._debug = debug('SqlToJson');
	this._logger = logger.getLogger('SqlToJson');
	this._dbClient = dbClient;
}

const p = SqlToJson.prototype;

p.executeGen = function*(struct) {
    this._debug('execute');
    this._logger.info('Connecting to DB');
    this._dbClient.connect();
    this._logger.info('Building JSON structure');
    const jsonData = yield* this._buildStructureRecursiveGen(struct);
    this._logger.info('Closing DB connection');
    this._dbClient.end();
    return jsonData;
};

p._buildStructureRecursiveGen = function*(struct, referrence, value) {
	this._debug('_buildStructureRecursiveGen', struct, referrence, value);
	let data;
	let dbData;
	if (this._isList(struct.type)) {
		if (struct.preDefinedkeys) {
			for (var i = 0; i < struct.preDefinedkeys.length; i++) {
				let key = struct.preDefinedkeys[i];
				let valueDesc = struct.fields
				[i];
				let element = yield* this._buildStructureRecursiveGen(valueDesc, referrence);
				data = this._setElement(data, element, struct.type, key);
			}
		}
		if (struct.query) {
			dbData = yield* this._queryGen(struct.query, referrence);
			for (var i = 0; i < dbData.length; i++) {
				let dbRow = dbData[i];
				referrence = this._getReferenceField(dbRow, struct.refField, referrence);
				for (var j = 0; j < struct.fields.length; j++) {
					let field = struct.fields[j];
					let element = yield* this._buildStructureRecursiveGen(field, referrence, dbRow[field.dbName]);
					let key = dbRow[struct.keyField] || field.name;		
					data = this._setElement(data, element, struct.type, key);
				}	
			}
		}
	}
	else if (struct.type === 'json') {
		data = JSON.parse(value);
	} else { // for values (number,string, etc)
		data = value;
	}
    return data;
};

p._getReferenceField = function(dbRow, refField, defaultValue) {
	this._debug('_getReferenceField');
	if (!refField) {
		return defaultValue;
	} else {
		if (!_.isArray(refField)) {
			refField = [refField];
		}
		let ref = [];
		for (var i = 0; i < refField.length; i++) {
			ref.push(dbRow[refField[i]]);
		}
		return ref;
	}
};

p._isList = function(type) {
	this._debug('_isList');
	return (type === 'array' || type === 'object');
};

p._setElement = function(container, element, containerType, key) {
	this._debug('_setElement');
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
        const error = new Error('Error while query', sql);
        error.cause = e;
        throw error;
    }
    result = (result.rows ? result.rows : result);
    return result;
};

module.exports = SqlToJson;