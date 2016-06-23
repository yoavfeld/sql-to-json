'use strict';

const _ = require('lodash');
const debug = require('debug');
const diver = require('diver');
const logger = require('log4js');
const alasql = require('alasql');

function SqlToJson(dbClient) {
	this._debug = debug('SqlToJson');
	this._logger = logger.getLogger('SqlToJson');
	this._logger.setLevel('INFO');
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
	this._logger.setLevel(struct.logLevel || 'INFO'); // set the log level for the current level in the struct file
	let data;
	if (this._isList(struct.type)) {
		this._debug('list');
		if (struct.preDefinedkeys) {
			for (let i = 0; i < struct.preDefinedkeys.length; i++) {
				let key = struct.preDefinedkeys[i];
				let valueDesc = struct.fields[i];
				let element = yield * this._buildStructureRecursiveGen(valueDesc, reference);
				this._logger.setLevel(struct.logLevel || 'INFO');// set back the log level for the current level in the struct file
				data = this._setElement(data, element, struct.type, key, struct.nullable);
			}
		}
		let dbData = yield * this._fetchDataGen(struct, reference);
		if (struct.diver) {
			data = {};
			for (let i = 0; i < dbData.length; i++) {
				let dbRow = dbData[i];
				let newObj = {};
				for (let j = 0; j < struct.fields.length; j++) {
					let field = struct.fields[j];
					let element = yield * this._buildStructureRecursiveGen(field, reference, dbRow[field.dbName]);
					this._logger.setLevel(struct.logLevel || 'INFO');// set back the log level for the current level in the struct file
					newObj = this._setElement(newObj, element, 'object', field.name);
				}
				let keys = _.values(dbRow).slice(0, struct.numOfKeys);
				diver.set(data, keys, newObj);
			}
		} else if (dbData && dbData.length > 0) {
			for (let i = 0; i < dbData.length; i++) {
				let dbRow = dbData[i];
				reference = this._getReferenceField(dbRow, struct.refField, reference);
				for (let j = 0; j < struct.fields.length; j++) {
					let field = struct.fields[j];
					let element = yield * this._buildStructureRecursiveGen(field, reference, dbRow[field.dbName]);
					this._logger.setLevel(struct.logLevel || 'INFO');// set back the log level for the current level in the struct file
					let key = dbRow[struct.keyField] || field.name;
					data = this._setElement(data, element, struct.type, key, field.nullable);
				}
			}
		} else if (_.isEmpty(data) && struct.nullable) {
			data = this._createElementByType(struct.type);
			for (let j = 0; j < struct.fields.length; j++) {
				let field = struct.fields[j];
				let element = yield * this._buildStructureRecursiveGen(field, reference, null);
				this._logger.setLevel(struct.logLevel || 'INFO');// set back the log level for the current level in the struct file
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
	} else if (struct.type === 'number') {
		this._debug('number', value);
		data = (value ? Number(value) : undefined);
	} else { // for values (string, etc)
		this._debug('value', value);
		data = value;
	}
	this._logger.setLevel('INFO');// set back the log level to default
	return data;
};

p._fetchDataGen = function*(struct, reference) {
	this._debug('_fetchDataGen');
	let dbData = [];
	if (struct.query) {
		dbData = yield * this._makeQueries(dbData, struct.query, _.bind(this._queryGen, this), reference);
	}
	if (struct.memQuery) {
		dbData = yield * this._makeQueries(dbData, struct.memQuery, _.bind(this._memQueryGen, this), reference);
	}
	this._debug(dbData);
	return dbData;
};

p._makeQueries = function*(dbData, queries, queryGen, reference) {
	this._debug('_makeQueries');
	if (!_.isArray(queries)) {
		queries = [queries];
	}
	for (var i = 0; i < queries.length; i++) {
		let query = queries[i];
		dbData = _.concat(dbData, yield * queryGen(query, reference));
	}
	return dbData;
};

p._memQueryGen = function*(sql, params) {
	this._debug('_memQueryGen', sql, params);
	const result = alasql(sql, params);
	this._printDebug('running memQuery: ' + sql, 'params: ' + params, 'result is: ', result);
	return result;
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
	this._printDebug('running query: ' + sql, 'params: ' + params, 'result is: ', result);
	return result;
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
	this._printDebug('reference is:', ref);
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
	this._printDebug('Setting element: ' + element, 'key: ' + key, 'in container: ' + JSON.stringify(container));
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

p._printDebug = function() {
	this._debug('printDebug');
	for (let i = 0; i < arguments.length; i++) {
		this._logger.debug(arguments[i]);
	}
}

module.exports = SqlToJson;
