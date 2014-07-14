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
      opts = {}
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
          // build result object
          var resObj = {};
          resObj.name = reqName;
          resObj.result = result
          if (err) {
            resObj.error = err.toString();
          }
          callback(null, resObj);
        });
      };

      var sendResponse = function(err, results) {
        callback(req, res, results, next);
      };

      // are there multiple requests?
      if (_.isArray(requestList)) {
        async.map(requestList, routeRequest, sendResponse);
      }
      else if (_.isObject(requestList)) {
        routeRequest(requestList, function(err, result) {
          var resultArray = (result ? [result] : []);
          sendResponse(err, resultArray);
        });
      }
      else {
        // don't know what type this is
        return next(new Error(reqProperty + " needs to be an array or object"));
      }
    };
  }
}
