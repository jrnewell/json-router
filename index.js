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

  middleware: function(callback) {
    var _self = this;
    callback = (_.isFunction(callback) ? callback : _self._defaultCallback);

    return function(req, res, next) {
      // if there is no 'jsonRequests' parameter, then skip this middleware
      var requestList = req.param('jsonRequests');
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
          // add reqName to result object
          var resObj = {};
          resObj[reqName] = result;
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
        routeRequest(requestList, sendResponse);
      }
      else {
        // don't know what type this is
        return next(new Error("jsonRequests needs to be an array or object"));
      }
    };
  }
}
