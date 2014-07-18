var _ = require('lodash');
var async = require('async');

module.exports = {
  _requests: {},

  _defaultCallback: function(req, res, results, next) {
    return res.json(results);
  },

  getRequestHandler: function(name) {
    return this._requests[name];
  },

  newRequest: function(name, handler) {
    this._requests[name] = handler;
  },

  middleware: function(opts, callback) {
    var _self = this;

    // special case were we don't include an opts, but do include a callback
    if (!_.isFunction(callback) && _.isFunction(opts)) {
      callback = opts;
      opts = {};
    }

    // set default options
    opts = (_.isObject(opts) ? opts : {});
    _.defaults(opts, {reqProperty: 'jsonRequests'});
    callback = (_.isFunction(callback) ? callback : _self._defaultCallback);

    // get options
    var reqProperty = opts.reqProperty;

    return function(req, res, next) {
      // if there is no 'jsonRequests' (reqProperty) parameter, then skip this middleware
      var requestList = req.param(reqProperty);
      if (typeof requestList === 'undefined' || requestList === null) {
        return next();
      }

      // request instance variables
      var depMap = {};
      var anyDeps = false;
      var requestOrder = [];
      var results = {};
      var reqOrderIdx = -1;

      var context = {
        jsonRouter: _self,
        httpReq: req,
        httpRes: res,
        getResult: function(reqId) {
          return results[reqId];
        },
        getRequest: function(reqId) {
          return depMap[reqId];
        },
        enqueueRequest: function(reqName, args, reqId, dependsOn, callback) {
          // check for some errors
          reqId = (_.isString(reqId) ? reqId : reqName);
          if (depMap[req._reqId]) {
            return callback(new Error("Duplicate requestId"));
          }

          if (!_.isArray(args) && _.isObject(args)) {
            args = [ args ];
          }
          else if (!_.isArray(args)) {
            return callback(new Error("Invalid args parameter"));
          }

          // create request obj
          var req = {
            name: reqName,
            _parent: null,
            _children: [],
            _orderIdx: reqOrderIdx + 1,
            _reqId: reqId
          };

          // add to dep map
          depMap[req._reqId] = req;

          if (_.isString(dependsOn)) {
            var parent = depMap[dependsOn];
            if (parent) {
              parent._children.push(req);
              req._parent = parent;
            }

            if (parent._orderIdx >= req._orderIdx) {
              req._orderIdx = parent._orderIdx + 1;
            }

            req.dependsOn = dependsOn;
            if (!anyDeps) anyDeps = true;
          }

          // add to request order array
          var newLeng = req._orderIdx + 1;
          if (newLeng > requestOrder.length) {
            while (requestOrder.length < newLeng) {
              requestOrder.push([]);
            }
          }
          requestOrder[req._orderIdx].push(req);
          return callback(null, req);
        },
        cancelRequest: function(reqId) {
          var req = depMap[reqId];
          if (req) {
            req._skip = true;
            req._error = "Request is cancelled";
          }
        }
      };

      var routeRequest = function(request, callback) {
        // skip request
        if (request._skip) {
          if (!request._error) request._error = "Request skipped";
          return callback(null, request);
        }

        var reqName = request.name;
        if (typeof reqName === 'undefined' || reqName === null) {
          return callback(new Error("missing 'name' property for request"));
        }

        context.request = request;
        if (req.dependsOn && req._parent) {
          context.dependsOn = req.dependsOn;
          context.parentResult = req._parent.result;
        }
        context.requestId = req._reqId;
        context.name = reqName;

        var reqMapping = _self._requests[reqName];
        if (typeof reqMapping === 'undefined' || reqMapping === null) {
          return callback(new Error("missing request " + reqName));
        }

        var reqArgs = request.arguments;
        if (typeof reqArgs === 'undefined' || reqArgs === null) {
          reqArgs = [];
        }
        else if (!_.isArray(reqArgs)) {
          reqArgs = [ reqArgs ];
        }

        reqMapping(context, reqArgs, function(err, result) {
          // attach result object
          request._result = result;
          if (err) request._error = err.toString();
          callback(null, request);
        });
      };

      var sendResponse = function(err, results) {
        callback(req, res, results, next);
      };

      // make sure we are dealing with arrays
      if (!_.isArray(requestList)) {
        if (_.isObject(requestList)) {
          requestList = [ requestList ];
        }
        else {
          // don't know what type this is
          return next(new Error(reqProperty + " needs to be an array or object"));
        }
      }

      // initialize depedency metadata
      _.each(requestList, function(req) {
        req._parent = null;
        req._children = [];
        req._orderIdx = 0;
        req._reqId = (_.isString(req.requestId) ? req.requestId : req.name);
        if (depMap[req._reqId]) {
          req._skip = true;
          req._error = "Request skipped due duplicate requestId";
          return;
        }
        depMap[req._reqId] = req;
        if (req.dependsOn && !anyDeps) anyDeps = true;
      });

      // we can skip these parts if no dependencies were detected
      if (anyDeps) {
        // build depdency tree
        for(var i = 0; i < requestList.length; i++) {
          var req = requestList[i];
          if (req.dependsOn) {
            var parent = depMap[req.dependsOn];
            if (parent) {
              parent._children.push(req);
              req._parent = parent;
            }
          }
        }

        // iterate over tree to determine depth (stored in _orderIdx)
        for(var i = 0; i < requestList.length; i++) {
          var req = requestList[i];
          var recurse = function(idx, req) {
            req._orderIdx = idx + 1;
            _.each(req._children, function(child) { recurse(req._orderIdx, child); });
          }
          if (_.isNull(req._parent)) {
            _.each(req._children, function(child) { recurse(req._orderIdx, child); });
          }
        }

        // build up request order array
        for(var i = 0; i < requestList.length; i++) {
          var req = requestList[i];

          // make sure the array is long enough
          var newLeng = req._orderIdx + 1;
          if (newLeng > requestOrder.length) {
            while (requestOrder.length < newLeng) {
              requestOrder.push([]);
            }
          }

          // add to array
          requestOrder[req._orderIdx].push(req);
        }
      }
      else {
        var requestOrder = [ requestList ];
      }

      // do actual requests
      var doRequest = function(reqArray, callback) {
        reqOrderIdx += 1;
        async.map(reqArray, routeRequest, function(err, requests) {
          if (err) return callback(err);

          // check for any errors, disable any children on error
          _.each(requests, function(req) {
            if (anyDeps && req._error && !req._skip) {
              var recurse = function(req) {
                req._skip = true;
                req._error = "Request skipped due to failed dependency";
                _.each(req._children, recurse);
              };
              _.each(req._children, recurse);
            }
            var resObj = {
              requestId: req._reqId
            };
            if (req._result) resObj.result = req._result;
            if (req._error) resObj.error = req._error;
            results[resObj.requestId] = resObj;
          });
          callback(null);
        });
      };
      async.each(requestOrder, doRequest, function(err) {
        if (err) return next(err);
        sendResponse(null, results);
      });
    };
  }
};
