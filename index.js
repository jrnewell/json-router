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

      var context = {
        jsonRouter: _self,
        httpReq: req,
        httpRes: res
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
      depMap = {};
      var anyDeps = false
      _.each(requestList, function(req) {
        req._parent = null;
        req._children = [];
        req._orderIdx = 0;
        req._depId = (_.isString(req.requestId) ? req.requestId : req.name);
        if (depMap[req._depId]) {
          req._skip = true;
          req._error = "Request skipped due duplicate requestId";
          return;
        }
        depMap[req._depId] = req;
        if (!anyDeps) anyDeps = true;
      });

      // we can skip these parts if no dependencies were detected
      var requestOrder = [];
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
      var results = {}
      var doRequest = function(reqArray, callback) {
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
              requestId: req._depId
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
