var _ = require('lodash');
var async = require('async');
var EventEmitter = require('events').EventEmitter;

var jsonRouter = {
  _requests: {},

  _emitter: new EventEmitter(),

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
    _.defaults(opts, {routeProperty: 'jsonRoute', flattenSingle: true, sendObject: true});
    callback = (_.isFunction(callback) ? callback : _self._defaultCallback);

    // get options
    var routeProperty = opts.routeProperty;
    var flattenSingle = opts.flattenSingle;
    var sendObject = opts.sendObject;

    return function(httpReq, httpRes, next) {
      // if there is no 'jsonRoute' (routeProperty) parameter, then skip this middleware
      var requestList = httpReq.param(routeProperty);
      if (typeof requestList === 'undefined' || requestList === null) {
        return next();
      }

      // request instance variables
      var depMap = {};
      var requestOrder = [];
      var results = {};
      var reqUtils = require('./request').init(_self, depMap, requestOrder);
      var contextUtils = require('./context').init(reqUtils, depMap);

      // create context obj
      var context = contextUtils.newContext(_self, httpReq, httpRes);

      var routeRequest = function(req, callback) {
        // skip request
        if (req._skip) {
          reqUtils.updateStatus(req, "cancelled");
          if (!req._error) req._error = "Request skipped";
          return callback(null, req);
        }

        var reqName = req.name;
        if (typeof reqName === 'undefined' || reqName === null) {
          return callback(new Error("missing 'name' property for request"));
        }

        context.request = req;
        if (req.dependsOn && req._parent) {
          context.dependsOn = req.dependsOn;
          if (req._parent._result) context.parentResult = req._parent._result;
        }
        context.requestId = req.requestId;
        context.name = reqName;

        var reqMapping = _self._requests[reqName];
        if (typeof reqMapping === 'undefined' || reqMapping === null) {
          return callback(new Error("missing request " + reqName));
        }

        var reqArgs = req.arguments;
        if (typeof reqArgs === 'undefined' || reqArgs === null) {
          reqArgs = [];
        }
        else if (!_.isArray(reqArgs)) {
          reqArgs = [ reqArgs ];
        }

        reqUtils.updateStatus(req, "running");
        reqMapping(context, reqArgs, function(err, result) {
          // attach result object
          reqUtils.updateStatus(req, "finished");
          req._result = result;
          if (err) req._error = err.toString();
          callback(null, req);
        });
      };

      // make sure we are dealing with arrays
      if (!_.isArray(requestList)) {
        if (_.isObject(requestList)) {
          requestList = [ requestList ];
        }
        else {
          // don't know what type this is
          return next(new Error(routeProperty + " needs to be an array or object"));
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
              requestId: req.requestId
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

        return callback(httpReq, httpRes, results, next);
      });
    };
  }
};

_.each(['addListener', 'on', 'once', 'emit'], function(func) {
  jsonRouter[func] = jsonRouter._emitter[func];
});

module.exports = jsonRouter;
