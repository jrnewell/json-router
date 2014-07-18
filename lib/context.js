var _ = require('lodash');

var init = function(reqUtils, depMap) {
  var _reqOrderIdx = -1;

  var incReqOrderIdx = function() {
    _reqOrderIdx++;
  }

  var getResult = function(reqId) {
    return results[reqId];
  };

  var getRequest = function(reqId) {
    return depMap[reqId];
  };

  var enqueueRequest = function(reqName, args, reqId, dependsOn, callback) {
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
      arguments: args
    };
    if (dependsOn) req.dependsOn = dependsOn;
    if (reqId) req.requestId = reqId;

    reqUtils.initRequest(req);
    reqUtils.addToDependencyTree(req);
    if (req._parent) {
      req._orderIdx = req._parent._orderIdx;
    }

    if (_reqOrderIdx > req._orderIdx) {
      req._orderIdx = _reqOrderIdx;
    }

    reqUtils.addRequestToOrderList(req);

    return callback(null, req);
  };

  var cancelRequest = function(reqId) {
    var req = depMap[reqId];
    if (req) {
      req._status = "cancelled";
      req._skip = true;
      req._error = "Request is cancelled";

      reqUtils.cancelDependencies(req, "Request cancelled due to cancelled dependency");
    }
  };

  var newContext = function(jsonRouter, httpReq, httpRes) {
    return {
      jsonRouter: jsonRouter,
      httpReq: httpReq,
      httpRes: httpRes,
      getResult: getResult,
      getRequest: getRequest,
      enqueueRequest: enqueueRequest,
      cancelRequest: cancelRequest
    };
  };

  return {
    incReqOrderIdx: incReqOrderIdx,
    newContext: newContext
  }
}

module.exports = {
  init: init
};