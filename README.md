# sql-to-json

## Synopsis

This object is a generic tool to convert your sql tables to an any structured json object.
the object gets a connected db client and a structure json object that describes the sql tables and the output json structure

## Code Example

```
const SqlToJson = require('sql-to-json');
const mysql = require('mysql'); // can be any sql db client with query method.

const mySqlDbClient = mysql.createConnection({credentials object});
mySqlDbClient.connect();

const struct = {};

const instance = new SqlToJson(dbClient);
yield* instance.executeGen(struct);

mySqlDbClient.end();
```

## structure file

The structure file is a json file that describes the sql tables and the output json structure.
the structure is an hierarchy object that each of its levels describes a level in the output json. each level can be: a simple level - descbribes a simple value in the json and a nested level that describes a list (object or array) of many simple or nested levels inside. a special level always have a "fields" key that contains an array of objects that describe the nested levels.

### keys description:

| key        | description           | values  | mandatory |
| ------------- |--------------------------------------------| ----------------| --------|
| type      |the type of this level in the json |array, object, string, json |Yes|
| query      | sql query of data from the db       |string or array of strings with sql queries |No|
| fields      | array of the fields of this elements (see fields headline below)       |array of objects|No|
| keyField | (can appear only when type=object of the first nested field) A field from the query that its values will be used as keys of the object's values        |name of a field from the query |No|
| refField | A field or fields from the query that its values will be used as reference for the query of the nested fields of this level | string or array of strings (DB column names)|No|
| dbName      | name of the db column of this field |string |only for simple levels|
| name      | name of the key in the output json that will contain this value |string |only for simple levels|
| nullable      | if true, create this field even if the db value is null or empty |boolean |No|
| preLoadTables      |(can apear only in the first level) an object that descripbes sql queries that will be executed in the begining of the sql-to-json process and could be accessed by memQuery queries. (see the example bellow) |object |No|
| memQuery      | an sql query from the memory. the table names that can be used in this queries are the keys in the preLoadTables object (see the example bellow)|string or array of strings with sql queries |No|
| preDefinedkeys      |(can appear only for type=object) an array of hard coded strings that will be used as keys of the object (instead of query result for example)|array of strings |No|
| diver      | if true, set a nested object that the keys are the first [numOfKes] fields that apear in the query in this level. |boolean |No|
| numOfKeys      | number of the first fields that apear in the query that should be keys of the nested object.|number |Yes - if diver=true|
|logLevel | if set to DEBUG, sql-to-json will print debug info for the current level. usefull for debugging |"DEBUG"| No|

#### fields 
The fields array in the stucture json is used to describe the next level in the output json. fields should appear only when type is list (object or array).

#### query

In the query you can use any sql that will be legal by your DB. you can use paramter bindings that will be filled by the reference filed or fields of the last level that has refField key.

* note: it is much better to use memQuery and not query for preventing too many requests to your db and then getting better performances.

#### memQuery

In the memQuery you can use any sql that legal by npm [alasql library](https://www.npmjs.com/package/alasql). you can use paramter bindings that will be filled by the reference filed or fields of the last level that has refField key.

### example
* look in examples folder For more structure files exampales.

#### structure file
```
{
    "type": "object",
    "preLoadTables": {
        "direct_publishers": "select * from publishers",
        "cost_models": "select * from costModels",
        "cost_models_countries": "select * from cm_countries",
        "cost_model_types": "select * from cm_types",
        "activities": "select * from activities",
        "countries": "select * from countries"
    },
    "memQuery": "select id from direct_publishers",
    "keyField": "id",
    "refField": "id",
    "fields": [{
        "type": "object",
        "memQuery": "select dp.name, ac.name as activity_name from direct_publishers dp inner join activities ac on dp.activity_id = ac.id where dp.id = ?",
        "fields": [{
            "dbName": "name",
            "name": "name",
            "type": "string"
        }, {
            "dbName": "activity_name",
            "name": "activity",
            "type": "string"
        }, {
            "name": "costModels",
            "type": "object",
            "nullable": true,
            "memQuery": "select id, domain from cost_models where publisher_id = ?",
            "keyField": "domain",
            "refField": "id",
            "fields": [{
                "type": "object",
                "memQuery": "select c.country_code from cost_models cm inner join cost_models_countries cmc on cm.id = cmc.cost_model_id inner join countries c on cmc.country_id = c.id where cm.id = ?",
                "keyField": "country_code",
                "fields": [{
                    "type": "object",
                    "memQuery": [
                        "select c.country_code from cost_models cm inner join cost_models_countries cmc on cm.id =      
                                cmc.cost_model_id inner join countries c on cmc.country_id = c.id where cm.id = ?",
                        "select 'all' as country_code"
                    ],
                    "fields": [{
                        "dbName": "type_name",
                        "name": "type",
                        "type": "string"
                    }, {
                        "dbName": "value",
                        "name": "value",
                        "type": "number"
                    }]
                }]
            }]
        }]
    }]
}
```
#### output
```
{
  "1": {
    "name": "test",
    "activity": "activity1",
    "costModels": {
      "abc": {
        "AD": {
          "type": "cpc",
          "value": 2.2
        },
        "US": {
          "type": "cpi",
          "value": 2.2
        }
      },
      "www.cnn.com": {
        "IL": {
          "type": "cpi",
          "value": 2.2
        },
        "US": {
          "type": "cpm",
          "value": 2.2
        }
      }
    }
  },
  "2": {
    "name": "test",
    "activity": "activity2",
    "costModels": {}
  }
}
```

