# sql-to-json

## Synopsis

This object is a generic tool to convert your sql tables to an any structured json object.
the object gets a connected db client and a structure json object that describes the sql tables and the output json structure

## Code Example

```
const JsonToSql = require('sql-to-json');
const mysql = require('mysql'); // can be any sql db client with query method.

const mySqlDbClient = mysql.createConnection({credentials object});
mySqlDbClient.connect();

const struct = {};

const instance = new JsonToSql(dbClient);
yield* instance.executeGen(struct);

mySqlDbClient.end();
```

## structure file

the structure file is a json file that describes the sql tables and the output json structure.
the structure is an hierarchy object which each level is describe a level in the output json. each level can be one of two kinds: a simple level - descbribes a simple value in the json and a nested level that describes a list (object or array) of many simple or nested levels inside. a special level always have a "fields" key that contains an array of objects that describe the nested levels.

### keys description:

| key        | description           | values  | mandatory |
| ------------- |--------------------------------------------| ----------------| --------|
| type      |the type of this level in the json |array, object, string, json |Yes|
| query      | sql query of data from the db       |any sql query |No|
| fields      | array of the fields of this elements (see fields sub headline below)       |array of objects|No|
| keyField | (can appear only when type=object of the first nested field) A field from the query that its values will be used as keys of the object's values        |name of a field from the query |No|
| refField | A field or fields from the query that its values will be used as reference for the query of the nested fields of this level | string or array of strings (DB column names)|No|
| dbName      | name of the db column of this field |string |only for simple levels|
| name      | name of the key in the output json that will contain this value |string |only for simple levels|
| nullable      | if true, create this field even if the db value is null or empty |string |No|
| preLoadTables      | can apear only in the first level. an object that descripbes sql queries that will be executed in the begining of the sql-to-json process and could be accessed by memQuery queries. (see the example bellow) |object |No|
| memQuery      | an sql query from the memory. the table names that can be used in this queries are the keys in the preLoadTables object (see the example bellow)|string |No|
| preDefinedKeys      |(can appear only for type=object)an array of hard coded strings that will be used as keys of the object (instead of query result for example)|array of strings |No|

#### fields 
the fields array in the stucture json is used to describe the next level in the output json. fields should appear only when type is list (object or array).

#### query

in the query you can use any sql that will be legal by your DB. you can use paramter bindings that will be filled by the reference filed or fields of the last level that has refField key.

#### memQuery

in the memQuery you can use any sql that legal by npm [alasql library](https://www.npmjs.com/package/alasql). you can use paramter bindings that will be filled by the reference filed or fields of the last level that has refField key.

### example
#### structure file
```
{
	type: 'object',
	preDefinedkeys: ['endpoints', 'events'],
	fields: [
		{
			name: 'endpoints',
			type: 'array',
			query: `select id from endpoints`,
			refField: 'id',
			fields: [
				{
					type: 'object',
					query: `select * from endpoints where id = ?`,
					fields: [
						{dbName: 'name', name: 'type', type: 'string'},
						{dbName: 'conf', name: 'conf', type: 'json'},
						{
							name: 'paths',
							type: 'array',
							query: `select path from endpoints_paths where endpoint_id = ?`,
							fields: [
								{dbName: 'path', type: 'string'}
							]
						}
					]
				}
			]
		},
		{
			name: 'events',
			type: 'object',
			query: `select id, name from event`,
			keyField: 'name',
			refField: 'id', // field for the suns' references
			fields: [
				{
					type: 'object',
					preDefinedkeys: ['tasks'],
					fields: [
						{
							name: 'tasks',
							type: 'array',
							query: `select tt.name, et.conf
									    from event_tasks et
									    inner join tasks tt
									    on tt.id = et.task_id
									    where et.event_id = ?`,
							fields: [
								{dbName: 'name', name: 'type' ,type: 'string'},
								{dbName: 'conf', name: 'conf', type: 'json'},
							]
						}
					]
				}
			]
		}
	]
};
```
#### output
```
{
  "endpoints": [
    {
      "type": "generic",
      "conf": {
        "endpoint": "configuration"
      },
      "paths": [
        "/sdk_click"
      ]
    },
    {
      "type": "videoPlayer",
      "conf": {
        "zubi": "zubi"
      },
      "paths": [
        "/player",
        "/zubbi"
      ]
    }
  ],
  "events": {
    "sdk_postback": {
      "tasks": [
        "ironBeast",
        {
          "name": "yoav"
        },
        "url",
        {
          "url": "http://ya.ru/",
          "method": "POST"
        }
      ]
    }
  }
}
```

### fields


