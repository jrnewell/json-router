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
    _.defaults(opts, {reqProperty: 'jsonRequests', flattenSingle: true, sendObject: true});
    callback = (_.isFunction(callback) ? callback : _self._defaultCallback);

    // get options
    var reqProperty = opts.reqProperty;
    var flattenSingle = opts.flattenSingle;
    var sendObject = opts.sendObject;

    return function(req, res, next) {
      // if there is no 'jsonRequests' (reqProperty) parameter, then skip this middleware
      var requestList = req.param(reqProperty);
      if (typeof requestList === 'undefined' || requestList === null) {
        return next();
      }

      // request instance variables
      var depMap = {};
      var requestOrder = [];
      var results = {};
      var reqUtils = require('./request').init(depMap, requestOrder);
      var contextUtils = require('./context').init(reqUtils, depMap);

      // create context obj
      var context = contextUtils.newContext(_self, req, res);

      var routeRequest = function(request, callback) {
        // skip request
        if (request._skip) {
          request._status = "cancelled";
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

        request._status = "running";
        reqMapping(context, reqArgs, function(err, result) {
          // attach result object
          request._status = "finished";
          request._result = result;
          if (err) request._error = err.toString();
          callback(null, request);
        });
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

      // init and create dependency tree, job queue
      reqUtils.initRequestList(requestList);

      // do actual requests
      var doRequest = function(reqArray, callback) {
        contextUtils.incReqOrderIdx();
        async.map(reqArray, routeRequest, function(err, requests) {
          if (err) return callback(err);

          // check for any errors, disable any children on error
          _.each(requests, function(req) {
            if (reqUtils.anyDeps && req._error && !req._skip) {
              reqUtils.cancelDependencies(req, "Request skipped due to failed dependency");
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
        if (flattenSingle) {
          var keys = _.keys(results);
          if (keys.length === 1) results = results[keys[0]];
        }
        if (!sendObject) {
          results = _.values(results);
        }

        return callback(req, res, results, next);
      });
    };
  }
};
