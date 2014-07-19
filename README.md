# JSON Router

An alternative moblie-focused router/RPC middleware that uses the JSON body instead of URL slugs to route requests.

The major advantage of this approach is that it easily allows multiple server requests to occur per HTTP request.  This reduces latency in your client with network constrained devices like mobile apps.

JSON Router works similar to javascript Function.apply() by taking a name and a variable number of arguments via an array.  The request object can handle an array of server requests.  The values returned by each request handler and will be aggregated into a JSON array which will be returned to the client.

JSON Router can take an optional callback if you would like to do custom handling on the result object.

## Install

```shell
npm install --save json-router
```

## Simple Usage

API

```javascript

jsonRouter.newRequest(reqName, hanlderFunc);

/**
handlerFunc = function(context, arguments, callback)

context = {
  name: request name,
  httpReq: http req object,
  httpRes: http res object,
  jsonRouter: reference to jsonRouter
}

arguments = [...]

callback = function(err, result)

**/

app.use(jsonRouter.middleware(opts, callback));

/**
Both opts and callback are optional

opts = {
  reqProperty: name of top-level property that defined a JSON Router request (default: 'jsonRequests')
}

default callback

callback = function(req, res, results, next) {
  return res.json(results);
}
**/

```

Server

```javascript

var express = require('express');
var bodyParser = require('body-parser');
var jsonRouter = require('json-router');

var app = express();
app.use(bodyParser.json());

jsonRouter.newRequest("myRequestName1", function(context, arguments, callback) {
  // ...
  return callback(null, retValue);
});

jsonRouter.newRequest("myRequestName2", function(context, arguments, callback) {
  // ...
  return callback(null, [retValue1, retValue2]);
});

app.use(jsonRouter.middleware());

```

Example of a JSON body request object sent using POST.  The middleware looks for JSON objects that have the top-level property 'jsonRequests' (this can be changed with the 'reqProperty' option).  If this property does not exist, it will continue on with the middleware chain.

```json

{
  "jsonRequests": {
    "name": "myRequestName1",
    "arguments": [ "foo" ]
  }
}

```

Example of a multiple-request object

```json

{
  "jsonRequests": [
  {
    "name": "myRequestName1",
    "arguments": [ "foo" ]
  },
  {
    "name": "myRequestName2",
    "arguments": [ "arg1", "arg2", "arg3" ]
  }]
}

```

Example of a response object

```json

{
  "myRequestName1": {
    "requestId": "myRequestName1",
    "result": "myResult"
  },
  "myRequestName2": {
    "requestId": "myRequestName2",
    "arguments": [ 1, 2, 3 ]
  }
}

```

Example of a response object with an error.  Note that since multiple server requests can occur per HTTP request, it may be possible that some server requests succeeed while other fail.  Therefore, one should use the 'error' property on the return object to deteremine success instead of the HTTP code.

```json

{
  "requestId": "myRequestName1",
  "error": "My Error String"
}

```


## License

[MIT License](http://en.wikipedia.org/wiki/MIT_License)