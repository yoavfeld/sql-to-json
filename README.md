# sql-to-json

# sql-to-json

## Synopsis

This object is a generic tool to convert your sql tables to an any structured json object.
the objects gets a db client and a structure json object that describes the sql tables and the output json structure

## Code Example

```
const JsonToSql = require('sql-to-json');
const mysql = require('mysql'); // can be any sql db client with query method.

const mySqlDbClient = mysql.createConnection({credentials object});
mySqlDbClient.connect();

const struct = {
};

const instance = new JsonToSql(dbClient);
yield* instance.executeGen(struct);

mySqlDbClient.end();
```

## structure file

the structure file is a json file that describes the sql tables and the output json structure

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


### fields


