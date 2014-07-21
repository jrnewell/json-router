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

  var enqueueRequest = function(reqName, args, reqId, dependsOn) {
    // check for some errors
    reqId = (_.isString(reqId) ? reqId : reqName);
    if (depMap[reqId]) {
      throw new Error("Duplicate requestId");
    }

    if (!_.isArray(args) && _.isObject(args)) {
      args = [ args ];
    }
    else if (!_.isArray(args)) {
      throw new Error("Invalid args parameter");
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

    var earliestOrderIdx = _reqOrderIdx + 1;
    if (earliestOrderIdx > req._orderIdx) {
      req._orderIdx = earliestOrderIdx;
    }

    reqUtils.addRequestToOrderList(req);

    return req;
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
      httpReq: httpReq,
      httpRes: httpRes,
      getResult: getResult,
      getRequest: getRequest,
      enqueueRequest: enqueueRequest,
      cancelRequest: cancelRequest,
      getRequestHandler: jsonRouter.getRequestHandler,
      newRequest: jsonRouter.newRequest
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