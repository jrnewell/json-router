# JSON Router

An alternative mobile-focused router/RPC middleware that uses the JSON body instead of URL slugs to route requests.

The major advantage of this approach is that it easily allows multiple server requests to occur per HTTP request.  This reduces latency in your client with network constrained devices like mobile apps.

JSON Router works similar to javascript Function.apply() by taking a name and a variable number of arguments via an array.  The request object can handle an array of server requests.  The values returned by each request handler and will be aggregated into a JSON array which will be returned to the client.

JSON Router can take an optional callback if you would like to do custom handling on the result object.

## Install

```shell
npm install --save json-router
```

## Simple Usage

For the simple use case, JSON Router is straightforward.  On the server, you pass the router a variable number of handler names and handler functions.  You then pass your server (express, connect, restify, etc.) the router middleware after the JSON body parser.

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

On the client, you send the server a JSON object in the HTTP body using POST.  The middleware looks for JSON objects that have the top-level property 'jsonRoute' (this can be changed with the `routeProperty` option).  If this property does not exist, the server will continue on with the middleware chain.

```json

{
  "jsonRoute": {
    "name": "myRequestName1",
    "arguments": [ "foo" ]
  }
}

```

JSON router will reply with a JSON object containing the result

```json

{
  "requestId": "myRequestName1",
  "result": "myResult"
}

```

## Advanced Usage

### Multiple Requests

JSON Router can take multiple requests per HTTP request

```json

{
  "jsonRoute": [
    {
      "name": "myRequestName1",
      "arguments": [ "foo" ]
    },
    {
      "name": "myRequestName2",
      "arguments": [ "arg1", "arg2", "arg3" ]
    }
  ]
}

```

Similarly, the router will reply with multiple results

```json

{
  "myRequestName1": {
    "requestId": "myRequestName1",
    "result": "myResult"
  },
  "myRequestName2": {
    "requestId": "myRequestName2",
    "result": [ 1, 2, 3 ]
  }
}

```

If there is an error, the response object will use the `error` property instead of a non-200 HTTP code.  This is because it may be possible that some request handlers succeed while other fail.

```json

{
  "myRequestName1": {
    "requestId": "myRequestName1",
    "error": "My Error String"
  },
  "myRequestName2": {
    "requestId": "myRequestName2",
    "result": [ 1, 2, 3 ]
  }
}

```

If you would like to execute the same handler function multiple times in a single request, you need to give each request a unique `requestId` (this defaults to the `name` if not provided)

```json

{
  "jsonRoute": [
    {
      "name": "myRequestName1",
      "requestId": "passFooToReq1",
      "arguments": [ "foo" ]
    },
    {
      "name": "myRequestName1",
      "requestId": "emptyReq1",
      "arguments": []
    }
  ]
}

```

### Dependencies

Normally, JSON Router will run all requests concurrently.  However, this behavior can be modified using dependencies between requests.  The property `dependsOn` causes JSON Router to build a dependency tree to execute the requests.  In this example, `myRequestName2` will run after `myRequestName1` (`myRequestName3` will run concurrently with `myRequestName1`).

```json

{
  "jsonRoute": [
    {
      "name": "myRequestName1",
      "arguments": [ "foo" ]
    },
    {
      "name": "myRequestName2",
      "dependsOn": "myRequestName1",
      "arguments": [ "bar" ]
    },
    {
      "name": "myRequestName3",
      "arguments": [ "baz" ]
    }
  ]
}

```

If a request handler fails, all dependent children requests will be cancelled and not run.

```json

{
  "myRequestName1": {
    "requestId": "myRequestName1",
    "error": "My Error String"
  },
  "myRequestName2": {
    "requestId": "myRequestName2",
    "error": "Request skipped due to failed dependency"
  },
  "myRequestName3": {
    "requestId": "myRequestName2",
    "result": [ 1, 2, 3 ]
  }
}

```

## API

### Handler Function

The handler function should provide the follow signature

```javascript
handlerFunc = function(context, arguments, callback)
```

#### Context

The context object provide help object and functions to use in your handler

| Property | Type | Description |
| :---: | :---: | --- |
| `name` | `String` | Request handler name |
| `requestId` | `String` | Request handler requestId (by default is equal to `name`) |
| `dependsOn` | `String` | The requestId of the request handler that this request depends on (if any) |
| `parentResult` | `Object` | The result that the parent request returned (if `dependsOn` exists) |
| `request` | `Object` | The request object used by JSON Router |
| `httpReq` | `Object` | HTTP request object passed to the middleware |
| `httpRes` | `Object` | HTTP response object passed to the middleware (don't use directly in handler function) |
| `getResult` | `function` | `getResult(reqId)`<br/> Returns the result object of `requestId` if it has finished running |
| `getRequest` | `function` | `getRequest(reqId)`<br/> Returns the request object of `requestId` |
| `enqueueRequest` | `function` | `enqueueRequest(reqName, args, reqId, dependsOn)`<br/> Dynamically adds a request to be run |
| `cancelRequest` | `function` | `cancelRequest(reqId)`<br/> Dynamically cancels a request |
| `getRequestHandler` | `function` | `getRequestHandler(name)`<br/> Returns the request handler function |
| `newRequest` | `function` | `newRequest(name, handler)`<br/> Adds a new request handler function to JSON Router |

#### Arguments

Arguments will always be an array type

#### Callback

The callback to the handler function accepts the following signature

```javascript
callback = function(err, result)
```

### Middlware Options

JSON Router can take options and a custom callback function when instantiating the middleware function.

```javascript
app.use(jsonRouter.middleware(opts, callback));
```

#### Options

The following options are supported

| Option | Type | Default | Description |
| :---: | :---: | :---: | --- |
| `routeProperty` | `String` | `jsonRoute` | The top-level property that indicates the incoming JSON object should be handled by the router middleware |
| `flattenSingle` | `Boolean` | `true` | If there is only one request handler, the response object will be flattened instead of being keyed by one `requestId` |
| `sendObject` | `Boolean` | `true` | If option is false, the response object will return an array of responses instead of a `requestId` keyed object |

#### Callback Function

If you would like to handle the results of the JSON router manually, you can provide a callback function with the following signature:

```javascript
callback = function(req, res, results, next)
```

By default, JSON Router uses the following callback function to send a JSON object to the client

```javascript
function(req, res, results, next) {
  return res.json(results);
}
```

### Events

JSON router emits events that can be subscribed to

| Event | Signature | Description |
| :---: | :---: | --- |
| `status` | `function(reqId, status, req)` | emitted whenever a requests' status changes<br/> (`waiting`, `cancelled`, `running`, `finished`) |

Example

```javascript

var jsonRouter = require('json-router');
jsonRouter.on('status', function(reqId, status, req) {
  console.log("Request: " + reqId + " changed to " + status);
});

```

## Coming Soon

Object literal notation for requests and dependencies.

## License

[MIT License](http://en.wikipedia.org/wiki/MIT_License)