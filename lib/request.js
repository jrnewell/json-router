var _ = require('lodash');

var init = function(depMap, requestOrder) {
  var _anyDeps = false;

  var initRequest = function(req) {
    req._status = "waiting";
    req._parent = null;
    req._children = [];
    req._orderIdx = 0;
    req._reqId = (_.isString(req.requestId) ? req.requestId : req.name);
    if (depMap[req._reqId]) {
      request._status = "cancelled";
      req._skip = true;
      req._error = "Request skipped due duplicate requestId";
      return;
    }
    depMap[req._reqId] = req;
    if (req.dependsOn && !_anyDeps) _anyDeps = true;
  };

  var addToDependencyTree = function(req) {
    if (req.dependsOn) {
      var parent = depMap[req.dependsOn];
      if (parent) {
        parent._children.push(req);
        req._parent = parent;
      }
    }
  };

  var updateSubtreeOrderIdx = function(req) {
    var recurse = function(idx, req) {
      req._orderIdx = idx + 1;
      _.each(req._children, function(child) { recurse(req._orderIdx, child); });
    }
    _.each(req._children, function(child) { recurse(req._orderIdx, child); });
  };

  var cancelDependencies = function(req, errorMsg) {
    var recurse = function(req) {
      req._status = "cancelled";
      req._skip = true;
      req._error = (errorMsg ? errorMsg : "Request cancelled");
      _.each(req._children, recurse);
    };
    _.each(req._children, recurse);
  }

  var addRequestToOrderList = function(req) {
    // make sure the array is long enough
    var newLeng = req._orderIdx + 1;
    if (newLeng > requestOrder.length) {
      while (requestOrder.length < newLeng) {
        requestOrder.push([]);
      }
    }

    // add to array
    requestOrder[req._orderIdx].push(req);
  };

  var initRequestList = function(requestList) {

    // initialize depedency metadata
    _.each(requestList, initRequest);

    // we can skip these parts if no dependencies were detected
    if (_anyDeps) {

      // build depdency tree
      _.each(requestList, addToDependencyTree);

      // iterate over tree to determine depth (stored in _orderIdx)
      _.each(requestList, function(req) {
        if (_.isNull(req._parent)) {
          updateSubtreeOrderIdx(req);
        }
      });

      // build up request order array
      _.each(requestList, addRequestToOrderList);
    }
    else {
      requestOrder.push(requestList);
    }
  };

  return {
    get anyDeps() {
      return _anyDeps;
    },
    initRequest: initRequest,
    addToDependencyTree: addToDependencyTree,
    updateSubtreeOrderIdx: updateSubtreeOrderIdx,
    cancelDependencies: cancelDependencies,
    addRequestToOrderList: addRequestToOrderList,
    initRequestList: initRequestList
  };
};

module.exports = {
  init: init
};